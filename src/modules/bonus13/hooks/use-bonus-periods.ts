import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import type { BonusPeriod } from "../lib/bonus-types";
import { calcBonus13Taxes, splitInstallmentsWithTaxes } from "../lib/calc-13";

export function useBonusPeriods() {
  const { currentCompany } = useDashboard();

  return useQuery({
    queryKey: ["bonus-periods", currentCompany?.id],
    enabled: !!currentCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bonus_periods")
        .select("*")
        .eq("company_id", currentCompany!.id)
        .order("year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BonusPeriod[];
    },
  });
}

export function useBonusPeriod(id: string | null) {
  return useQuery({
    queryKey: ["bonus-period", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bonus_periods")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as BonusPeriod;
    },
  });
}

export function useOpenBonusPeriod() {
  const qc = useQueryClient();
  const { currentCompany } = useDashboard();

  return useMutation({
    mutationFn: async (input: { year: number; notes?: string }) => {
      if (!currentCompany?.id) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase.functions.invoke<{
        period_id?: string;
        count?: number;
        ok?: boolean;
        error?: string;
      }>("bonus-open-period", {
        body: {
          company_id: currentCompany.id,
          year: input.year,
          notes: input.notes,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.period_id) throw new Error("Resposta inesperada do servidor");
      return { period_id: data.period_id, count: data.count ?? 0 };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-periods"] });
    },
  });
}

/** Marca o período como "pagamento" e cria as parcelas das entries em batch. */
export function useGeneratePayments() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (periodId: string) => {
      // 1. Pega entries do período em modo batch + dependentes do colaborador
      const { data: entries, error: entriesErr } = await supabase
        .from("bonus_entries")
        .select(
          "id, gross_value, collaborator:collaborators(dependents_count)",
        )
        .eq("period_id", periodId)
        .eq("mode", "batch");
      if (entriesErr) throw entriesErr;
      if (!entries || entries.length === 0) {
        throw new Error("Nenhum colaborador no batch para gerar pagamentos.");
      }

      // 2. Cria 2 linhas em bonus_payments por entry (first / second).
      //    1ª = 50% bruto (adiantamento, sem desconto)
      //    2ª = saldo restante − INSS_total − IRPF_total
      const rows: Array<{
        entry_id: string;
        installment: "first" | "second";
        amount: number;
        notes: string | null;
      }> = [];
      for (const e of entries as Array<{
        id: string;
        gross_value: number;
        collaborator: { dependents_count?: number } | null;
      }>) {
        const gross = Number(e.gross_value);
        const dependents = e.collaborator?.dependents_count ?? 0;
        const taxes = calcBonus13Taxes({ grossValue: gross, dependents });
        const { first, second } = splitInstallmentsWithTaxes({
          gross,
          taxes,
        });

        rows.push({
          entry_id: e.id,
          installment: "first",
          amount: first,
          notes: null,
        });
        rows.push({
          entry_id: e.id,
          installment: "second",
          amount: second,
          // Snapshot do desconto pra auditoria (notes é texto livre)
          notes:
            taxes.inss + taxes.irpf > 0
              ? `Bruto: ${gross.toFixed(2)} − INSS: ${taxes.inss.toFixed(2)} − IRPF: ${taxes.irpf.toFixed(2)}`
              : null,
        });
      }

      const { error: payErr } = await supabase
        .from("bonus_payments")
        .insert(rows);
      if (payErr) throw payErr;

      // 3. Atualiza status do período
      const { error: updErr } = await supabase
        .from("bonus_periods")
        .update({
          status: "pagamento",
          generated_at: new Date().toISOString(),
        })
        .eq("id", periodId);
      if (updErr) throw updErr;

      return { count: entries.length };
    },
    onSuccess: (_data, periodId) => {
      qc.invalidateQueries({ queryKey: ["bonus-period", periodId] });
      qc.invalidateQueries({ queryKey: ["bonus-payments", periodId] });
      qc.invalidateQueries({ queryKey: ["bonus-periods"] });
    },
  });
}

/** Reabre período (volta de 'pagamento' pra 'aberto').
 *  Limpa as parcelas que ainda não foram pagas — parcelas já quitadas ficam,
 *  garantindo que histórico de pagamento não se perde. */
export function useReopenBonusPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string) => {
      // Pega ids das entries do período pra limpar parcelas pendentes via filtro `in`
      const { data: entries, error: entriesErr } = await supabase
        .from("bonus_entries")
        .select("id")
        .eq("period_id", periodId);
      if (entriesErr) throw entriesErr;

      const entryIds = (entries ?? []).map((e) => (e as { id: string }).id);
      if (entryIds.length > 0) {
        await supabase
          .from("bonus_payments")
          .delete()
          .in("entry_id", entryIds)
          .is("paid_at", null);
      }

      const { error } = await supabase
        .from("bonus_periods")
        .update({ status: "aberto", generated_at: null })
        .eq("id", periodId);
      if (error) throw error;
    },
    onSuccess: (_data, periodId) => {
      qc.invalidateQueries({ queryKey: ["bonus-period", periodId] });
      qc.invalidateQueries({ queryKey: ["bonus-payments", periodId] });
      qc.invalidateQueries({ queryKey: ["bonus-periods"] });
    },
  });
}
