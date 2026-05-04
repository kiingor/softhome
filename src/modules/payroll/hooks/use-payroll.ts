import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type {
  PayrollPeriod,
  PayrollEntry,
  PayrollEntryWithCollaborator,
  PayrollAlertWithCollaborator,
  PayrollPeriodWithStats,
} from "../types";
import { periodToMonthYear, formatPeriodLabel } from "../types";
import type {
  OpenPeriodValues,
  NewEntryValues,
  ReverseEntryValues,
} from "../schemas/payroll.schema";
import { calculateMonthlyBenefitValue, type DayAbbrev } from "@/lib/workingDays";

// ─────────────────────────────────────────────────────────────────────────────
// Lista de períodos da empresa atual (dashboard mensal)
// ─────────────────────────────────────────────────────────────────────────────

export function usePayrollPeriods() {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["payroll-periods", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("company_id", companyId)
        .order("reference_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollPeriodWithStats[];
    },
    enabled: !!companyId,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Abre novo período (decisão Q3 manual)
  // Decisão Q2 auto-popula: se auto_populate=true, busca collaborators ativos
  // e cria 1 entry de salario_base (do position) + entries de benefícios
  // assigned (do benefits_assignments).
  // ─────────────────────────────────────────────────────────────────────────
  const openPeriod = useMutation({
    mutationFn: async (values: OpenPeriodValues) => {
      if (!companyId) throw new Error("Empresa não encontrada");

      // 1. Verifica se já existe período pra esse mês
      const { data: existing } = await supabase
        .from("payroll_periods")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_month", values.reference_month)
        .maybeSingle();

      if (existing) {
        throw new Error(
          `Já existe um período pra ${formatPeriodLabel(values.reference_month)}.`
        );
      }

      // 2. Cria o período
      const { data: period, error: periodError } = await supabase
        .from("payroll_periods")
        .insert({
          company_id: companyId,
          reference_month: values.reference_month,
          status: "open",
          notes: values.notes || null,
        })
        .select()
        .single();

      if (periodError) throw periodError;
      if (!period) throw new Error("Falha ao criar período");

      // 3. Auto-popula salário base + benefícios (decisão Q2)
      if (values.auto_populate) {
        const { month, year } = periodToMonthYear(values.reference_month);

        // 3a. Salário base de cada colaborador ativo
        const { data: collaborators } = await supabase
          .from("collaborators")
          .select("id, position_id, store_id, position:positions(salary)")
          .eq("company_id", companyId)
          .eq("status", "ativo");

        const salaryEntries =
          (collaborators ?? [])
            .map((c) => {
              const salary =
                (c.position as { salary?: number } | null)?.salary ?? 0;
              if (salary <= 0) return null;
              return {
                company_id: companyId,
                collaborator_id: c.id,
                store_id: c.store_id,
                type: "salario_base" as const,
                description: "Salário base (auto)",
                value: salary,
                is_fixed: true,
                month,
                year,
              };
            })
            .filter(Boolean) as PayrollEntry[];

        if (salaryEntries.length > 0) {
          await supabase.from("payroll_entries").insert(salaryEntries);
        }

        // 3b. Benefícios assigned
        // Pega value_type/applicable_days pra calcular valor mensal correto
        // (daily × dias úteis − feriados da store do colaborador).
        const { data: assignments } = await supabase
          .from("benefits_assignments")
          .select(
            "collaborator_id, benefit:benefits(name, value, value_type, applicable_days), collaborator:collaborators!inner(company_id, status, store_id, contracted_store_id)",
          )
          .eq("collaborator.company_id", companyId)
          .eq("collaborator.status", "ativo");

        // Carrega feriados do ano pra todas as stores envolvidas (1 query).
        const storeIds = Array.from(
          new Set(
            (assignments ?? [])
              .map((a) => {
                const c = a.collaborator as
                  | { store_id: string | null; contracted_store_id: string | null }
                  | null;
                return c?.store_id || c?.contracted_store_id || null;
              })
              .filter((id): id is string => !!id),
          ),
        );

        const holidaysByStore = new Map<string, string[]>();
        if (storeIds.length > 0) {
          const { data: hols } = await supabase
            .from("store_holidays")
            .select("store_id, date")
            .in("store_id", storeIds)
            .gte("date", `${year}-01-01`)
            .lte("date", `${year}-12-31`);
          for (const h of (hols ?? []) as Array<{ store_id: string; date: string }>) {
            const arr = holidaysByStore.get(h.store_id) ?? [];
            arr.push(h.date);
            holidaysByStore.set(h.store_id, arr);
          }
        }

        const benefitEntries =
          (assignments ?? [])
            .map((a) => {
              const benefit = a.benefit as
                | {
                    name: string;
                    value: number;
                    value_type: "monthly" | "daily" | null;
                    applicable_days: string[] | null;
                  }
                | null;
              if (!benefit || benefit.value <= 0) return null;

              const collab = a.collaborator as
                | { store_id: string | null; contracted_store_id: string | null }
                | null;
              const benefitStoreId =
                collab?.store_id || collab?.contracted_store_id || null;
              const holidays = benefitStoreId
                ? holidaysByStore.get(benefitStoreId) ?? []
                : [];

              const monthlyValue = calculateMonthlyBenefitValue(
                benefit.value,
                (benefit.value_type ?? "monthly") as "monthly" | "daily",
                (benefit.applicable_days ?? [
                  "mon",
                  "tue",
                  "wed",
                  "thu",
                  "fri",
                ]) as DayAbbrev[],
                month,
                year,
                holidays,
              );

              if (monthlyValue <= 0) return null;

              return {
                company_id: companyId,
                collaborator_id: a.collaborator_id,
                store_id: null,
                type: "beneficio" as const,
                description: `${benefit.name} (auto)`,
                value: monthlyValue,
                is_fixed: true,
                month,
                year,
              };
            })
            .filter(Boolean) as PayrollEntry[];

        if (benefitEntries.length > 0) {
          await supabase.from("payroll_entries").insert(benefitEntries);
        }
      }

      return period as PayrollPeriod;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast.success("Período aberto ✓");
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  return { periods, isLoading, openPeriod };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single period + entries do mês
// ─────────────────────────────────────────────────────────────────────────────

export function usePayrollPeriod(id: string | undefined) {
  return useQuery({
    queryKey: ["payroll-period", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as PayrollPeriod;
    },
    enabled: !!id,
  });
}

export function usePayrollEntries(periodId: string | undefined) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  // Buscar entries pelo período: como payroll_entries não tem period_id,
  // a query é por (company_id, month, year) lidos do período.
  const { data: period } = usePayrollPeriod(periodId);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["payroll-entries", periodId],
    queryFn: async () => {
      if (!periodId || !companyId || !period) return [];
      const { month, year } = periodToMonthYear(period.reference_month);
      const { data, error } = await supabase
        .from("payroll_entries")
        .select(
          "*, collaborator:collaborators(id, name, cpf, regime, status)"
        )
        .eq("company_id", companyId)
        .eq("month", month)
        .eq("year", year)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollEntryWithCollaborator[];
    },
    enabled: !!periodId && !!companyId && !!period,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cria lançamento manual (HE, falta, atestado, etc.)
  // ─────────────────────────────────────────────────────────────────────────
  const createEntry = useMutation({
    mutationFn: async (values: NewEntryValues) => {
      if (!period || !companyId) throw new Error("Período não encontrado");
      const { month, year } = periodToMonthYear(period.reference_month);

      if (period.status !== "open") {
        throw new Error(
          "Período fechado. Pra alterar, reabre o fechamento ou cria estorno."
        );
      }

      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("payroll_entries").insert({
        company_id: companyId,
        collaborator_id: values.collaborator_id,
        type: values.type,
        description: values.description || null,
        value: values.value,
        is_fixed: values.is_fixed,
        month,
        year,
        created_by: userData?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success("Lançamento criado ✓");
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Estorna lançamento (cria entry negativa, não deleta o original)
  // ─────────────────────────────────────────────────────────────────────────
  const reverseEntry = useMutation({
    mutationFn: async ({
      entryId,
      values,
    }: {
      entryId: string;
      values: ReverseEntryValues;
    }) => {
      if (!period || !companyId) throw new Error("Período não encontrado");
      const { data: original, error: fetchError } = await supabase
        .from("payroll_entries")
        .select("*")
        .eq("id", entryId)
        .single();
      if (fetchError || !original) throw fetchError ?? new Error("Lançamento não encontrado");

      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("payroll_entries").insert({
        company_id: companyId,
        collaborator_id: original.collaborator_id,
        store_id: original.store_id,
        type: original.type,
        description: `[Estorno] ${original.description ?? ""} — Motivo: ${values.reason}`,
        value: -original.value, // negativo
        is_fixed: false,
        month: original.month,
        year: original.year,
        created_by: userData?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success("Estorno registrado ✓");
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Fechar período (vira read-only; só pode estornar via novos lançamentos)
  // ─────────────────────────────────────────────────────────────────────────
  const closePeriod = useMutation({
    mutationFn: async () => {
      if (!periodId) throw new Error("Período não encontrado");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("payroll_periods")
        .update({
          status: "closed",
          closed_by: userData?.user?.id ?? null,
          closed_at: new Date().toISOString(),
        })
        .eq("id", periodId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-period"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast.success("Folha do mês fechada ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  // Reabrir período fechado (caso precise corrigir)
  const reopenPeriod = useMutation({
    mutationFn: async () => {
      if (!periodId) throw new Error("Período não encontrado");
      const { error } = await supabase
        .from("payroll_periods")
        .update({
          status: "open",
          closed_at: null,
          closed_by: null,
        })
        .eq("id", periodId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-period"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast.success("Período reaberto.");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return {
    entries,
    isLoading,
    period,
    createEntry,
    reverseEntry,
    closePeriod,
    reopenPeriod,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alertas pendentes (pendentes = sem resolved_at)
// ─────────────────────────────────────────────────────────────────────────────

export function usePayrollAlerts(periodId: string | undefined) {
  return useQuery({
    queryKey: ["payroll-alerts", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from("payroll_alerts")
        .select("*, collaborator:collaborators(id, name)")
        .eq("period_id", periodId)
        .is("resolved_at", null)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollAlertWithCollaborator[];
    },
    enabled: !!periodId,
  });
}
