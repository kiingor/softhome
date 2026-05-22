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
import {
  calcAllTaxes,
  calcSalarioFamilia,
  eligibleChildrenForSalarioFamilia,
  SALARIO_FAMILIA_LIMITE_2026,
} from "@/lib/payroll/cltCalc";
import { calcVacation, type VacationCalcResult } from "@/lib/payroll/vacationCalc";
import { getCollabsToSkipNextMonth } from "@/lib/payroll/vacationSkipRules";
import { postVacationToPayroll } from "@/hooks/useVacations";

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

        // 3a. Salário base + encargos (IRPF/INSS/FGTS via tabela 2026)
        const { data: collaborators } = await supabase
          .from("collaborators")
          .select(
            "id, position_id, store_id, dependents_count, position:positions(salary)",
          )
          .eq("company_id", companyId)
          .eq("status", "ativo");

        // Decisão de produto: recibo de férias cai no mês do gozo, JUNTO
        // com o salário normal. Por isso NÃO proratamos salário aqui — o
        // recibo é tratado como adicional, não como substituição.
        // (Se quiser voltar pra CLT estrito, ver vacationDaysInMonth helper.)

        // Anti-duplicação: a sync (apply-financials) cria salário/INSS/IRPF/
        // FGTS com external_id 'salario-base'/'inss-base'/'irpf-base'/'fgts-base'
        // e month/year do mês corrente da sync. Se o auto-populate roda no
        // mesmo mês, geraria entries duplicadas (sem external_id). Antes de
        // inserir, montamos um Map<collab_id, Set<type>> do que JÁ existe
        // neste mês, e pulamos esses tipos por colab.
        const { data: existingByMonth } = await supabase
          .from("payroll_entries")
          .select("collaborator_id, type")
          .eq("company_id", companyId)
          .eq("month", month)
          .eq("year", year)
          .in("type", ["salario_base", "inss", "irpf", "fgts"]);
        const coveredByCollab = new Map<string, Set<string>>();
        for (const e of existingByMonth ?? []) {
          const cid = (e as { collaborator_id: string }).collaborator_id;
          const set = coveredByCollab.get(cid) ?? new Set<string>();
          set.add((e as { type: string }).type);
          coveredByCollab.set(cid, set);
        }

        // Regra de produto: recibo de férias (lançado no mês do gozo) cobre
        // também o salário do MÊS SEGUINTE. Lista colabs cujo RECIBO foi
        // lançado no mês anterior → pula salário+encargos deste mês.
        //
        // Filtra por payroll_month/year (mês do LANÇAMENTO do recibo) e não
        // por end_date — assim cobre o caso de "Adiantar Férias" também
        // (gozo em Set, adianta o recibo pra Ago → ao abrir folha de Set,
        // queremos pular o colab mesmo que end_date continue em Set).
        const prevMonthAuto = month === 1 ? 12 : month - 1;
        const prevYearAuto = month === 1 ? year - 1 : year;
        const { data: vacPostedPrev } = await supabase
          .from("vacation_requests")
          .select("collaborator_id, payroll_month, payroll_year")
          .eq("company_id", companyId)
          .eq("status", "approved")
          .eq("payroll_month", prevMonthAuto)
          .eq("payroll_year", prevYearAuto);
        const skipSalaryNext = getCollabsToSkipNextMonth(
          (vacPostedPrev ?? []) as Array<{
            collaborator_id: string;
            payroll_month: number | null;
            payroll_year: number | null;
          }>,
          month,
          year,
        );

        const autoEntries: PayrollEntry[] = [];
        for (const c of collaborators ?? []) {
          const fullSalary =
            (c.position as { salary?: number } | null)?.salary ?? 0;
          if (fullSalary <= 0) continue;
          // Pula colab que teve gozo no mês anterior (recibo já cobriu)
          if (skipSalaryNext.has(c.id)) continue;
          const deps = (c as { dependents_count?: number }).dependents_count ?? 0;
          const covered = coveredByCollab.get(c.id) ?? new Set<string>();

          const salary = fullSalary;
          const taxes = calcAllTaxes({ grossSalary: salary, dependents: deps });
          const salaryDesc = "Salário base";

          if (!covered.has("salario_base")) {
            autoEntries.push({
              company_id: companyId,
              collaborator_id: c.id,
              store_id: c.store_id,
              type: "salario_base" as const,
              description: salaryDesc,
              value: salary,
              is_fixed: true,
              is_payable: true,
              month,
              year,
            } as PayrollEntry);
          }

          if (taxes.inss > 0 && !covered.has("inss")) {
            autoEntries.push({
              company_id: companyId,
              collaborator_id: c.id,
              store_id: c.store_id,
              type: "inss" as const,
              description: "INSS (tabela 2026)",
              value: taxes.inss,
              is_fixed: true,
              is_payable: true,
              month,
              year,
            } as PayrollEntry);
          }
          if (taxes.fgts > 0 && !covered.has("fgts")) {
            autoEntries.push({
              company_id: companyId,
              collaborator_id: c.id,
              store_id: c.store_id,
              type: "fgts" as const,
              description: "FGTS (8%)",
              value: taxes.fgts,
              is_fixed: true,
              is_payable: true,
              month,
              year,
            } as PayrollEntry);
          }
          if (taxes.irpf > 0 && !covered.has("irpf")) {
            autoEntries.push({
              company_id: companyId,
              collaborator_id: c.id,
              store_id: c.store_id,
              type: "irpf" as const,
              description:
                deps > 0
                  ? `IRPF (tabela 2026, ${deps} dep.)`
                  : "IRPF (tabela 2026)",
              value: taxes.irpf,
              is_fixed: true,
              is_payable: true,
              month,
              year,
            } as PayrollEntry);
          }
        }

        if (autoEntries.length > 0) {
          await supabase.from("payroll_entries").insert(autoEntries);
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3a-bis. Salário-família — pra cada CLT com salário ≤ limite, conta
        // filhos elegíveis (idade < 14 OU inválido) e cria entry tipo
        // salario_familia. Isento de INSS/IRPF/FGTS, não compõe base.
        //
        // Idempotência via external_id 'salario-familia-<collab_id>-<YYYY-MM>'.
        // Skip mês-seguinte respeitado (skipSalaryNext já filtrou colabs cujo
        // recibo de férias está cobrindo).
        // ─────────────────────────────────────────────────────────────────────
        const sfCandidates = (collaborators ?? []).filter((c) => {
          if (skipSalaryNext.has(c.id)) return false;
          const sal = (c.position as { salary?: number } | null)?.salary ?? 0;
          // Filtro grosso pra evitar query desnecessária quando salário já é
          // acima do limite. Salário-família só pra baixa renda (~R$ 1.9k).
          return sal > 0 && sal <= SALARIO_FAMILIA_LIMITE_2026;
        });

        if (sfCandidates.length > 0) {
          const candidateIds = sfCandidates.map((c) => c.id);
          // Carrega dependentes desses colabs em 1 query (evita N+1)
          const { data: depsData } = await supabase
            .from("collaborator_dependents")
            .select("collaborator_id, birth_date, kinship, is_invalid")
            .in("collaborator_id", candidateIds);

          // Anti-dup: pega salário-família já lançados nesse mês
          const sfExternalIds = candidateIds.map(
            (id) => `salario-familia-${id}-${year}-${String(month).padStart(2, "0")}`,
          );
          const { data: existingSF } = await supabase
            .from("payroll_entries")
            .select("external_id")
            .eq("company_id", companyId)
            .eq("month", month)
            .eq("year", year)
            .in("external_id", sfExternalIds);
          const existingSFSet = new Set(
            (existingSF ?? []).map((e) => (e as { external_id: string }).external_id),
          );

          const depsByCollab = new Map<
            string,
            Array<{ birth_date: string | null; kinship: string | null; is_invalid: boolean | null }>
          >();
          for (const d of depsData ?? []) {
            const cid = (d as { collaborator_id: string }).collaborator_id;
            const arr = depsByCollab.get(cid) ?? [];
            arr.push(d as { birth_date: string | null; kinship: string | null; is_invalid: boolean | null });
            depsByCollab.set(cid, arr);
          }

          const sfEntries: PayrollEntry[] = [];
          const refDate = new Date(year, month - 1, 15); // meio do mês como referência
          for (const c of sfCandidates) {
            const fullSalary = (c.position as { salary?: number } | null)?.salary ?? 0;
            const deps = depsByCollab.get(c.id) ?? [];
            const eligible = eligibleChildrenForSalarioFamilia(deps, refDate);
            const calc = calcSalarioFamilia({
              grossSalary: fullSalary,
              eligibleChildrenCount: eligible.length,
            });
            if (!calc.eligible || calc.value <= 0) continue;
            const externalId = `salario-familia-${c.id}-${year}-${String(month).padStart(2, "0")}`;
            if (existingSFSet.has(externalId)) continue;
            sfEntries.push({
              company_id: companyId,
              collaborator_id: c.id,
              store_id: c.store_id,
              external_id: externalId,
              type: "salario_familia" as const,
              description: `Salário-família (${eligible.length} filho${eligible.length === 1 ? "" : "s"})`,
              value: calc.value,
              is_fixed: true,
              is_payable: true,
              month,
              year,
            } as PayrollEntry);
          }

          if (sfEntries.length > 0) {
            await supabase.from("payroll_entries").insert(sfEntries);
          }
        }

        // 3b. Benefícios assigned
        // Pega value_type/applicable_days pra calcular valor mensal correto
        // (daily × dias úteis − feriados da store do colaborador).
        // category é usada pra setar is_payable (Adicional entra na aba Pagamentos).
        const { data: assignments } = await supabase
          .from("benefits_assignments")
          .select(
            "collaborator_id, custom_value, benefit:benefits(name, value, value_type, applicable_days, category), collaborator:collaborators!inner(company_id, status, store_id, contracted_store_id)",
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
                    category: string | null;
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

              const valueType = (benefit.value_type ?? "monthly") as "monthly" | "daily";
              const customValue = (a as { custom_value?: number | null }).custom_value;
              const baseValue =
                valueType === "monthly" && customValue != null
                  ? Number(customValue)
                  : benefit.value;
              const monthlyValue = calculateMonthlyBenefitValue(
                baseValue,
                valueType,
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
                description: benefit.name,
                value: monthlyValue,
                is_fixed: true,
                is_payable: benefit.category === "adicional",
                month,
                year,
              };
            })
            .filter(Boolean) as PayrollEntry[];

        if (benefitEntries.length > 0) {
          await supabase.from("payroll_entries").insert(benefitEntries);
        }
      }

      const { month: openMonth, year: openYear } = periodToMonthYear(
        values.reference_month,
      );

      // ─────────────────────────────────────────────────────────────────────
      // Carry-over de lançamentos recorrentes do mês anterior.
      // Copia gratificacao, bonificacao e desconto (is_fixed=true) do último
      // mês disponível. Útil pra grats/bonifs que vêm da agenda mas só foram
      // sincronizadas uma vez.
      //
      // Decisão de produto: recibo de férias cai no mês do gozo junto com o
      // salário, então a gratificação/bonificação recorrente DEVE continuar
      // no mês do gozo também (não pula).
      //
      // EXCEÇÃO: colabs cujo gozo ENDED no mês anterior → folha deste mês
      // fica VAZIA pra ele (regra: recibo já cobriu o próximo mês).
      // ─────────────────────────────────────────────────────────────────────
      const prevMonth = openMonth === 1 ? 12 : openMonth - 1;
      const prevYear = openMonth === 1 ? openYear - 1 : openYear;
      const CARRY_OVER_TYPES = ["gratificacao", "bonificacao", "desconto"] as const;

      // Lista colabs cujo recibo de férias foi lançado no mês anterior
      // (pular carry-over). Filtra por payroll_month/year — mesmo critério
      // do skip de salário acima, garante consistência com adiantamento.
      const { data: vacPostedPrevCarry } = await supabase
        .from("vacation_requests")
        .select("collaborator_id, payroll_month, payroll_year")
        .eq("company_id", companyId)
        .eq("status", "approved")
        .eq("payroll_month", prevMonth)
        .eq("payroll_year", prevYear);
      const skipCarryOverFor = getCollabsToSkipNextMonth(
        (vacPostedPrevCarry ?? []) as Array<{
          collaborator_id: string;
          payroll_month: number | null;
          payroll_year: number | null;
        }>,
        openMonth,
        openYear,
      );

      let recurringCopied = 0;
      if (values.auto_populate) {
        const { data: prevRecurring } = await supabase
          .from("payroll_entries")
          .select("collaborator_id, store_id, type, description, value")
          .eq("company_id", companyId)
          .eq("month", prevMonth)
          .eq("year", prevYear)
          .eq("is_fixed", true)
          .in("type", CARRY_OVER_TYPES as unknown as string[]);

        if (prevRecurring && prevRecurring.length > 0) {
          // Evita duplicar — se já existe entry desse tipo+desc pro colab neste mês, pula.
          const { data: alreadyHere } = await supabase
            .from("payroll_entries")
            .select("collaborator_id, type, description")
            .eq("company_id", companyId)
            .eq("month", openMonth)
            .eq("year", openYear)
            .in("type", CARRY_OVER_TYPES as unknown as string[]);
          const seen = new Set(
            (alreadyHere ?? []).map(
              (r) =>
                `${(r as { collaborator_id: string }).collaborator_id}::${(r as { type: string }).type}::${(r as { description: string | null }).description ?? ""}`,
            ),
          );

          const carryOverRows = prevRecurring
            .filter((r) => {
              const collab = (r as { collaborator_id: string }).collaborator_id;
              // Skip se colab teve gozo terminando no mês anterior
              if (skipCarryOverFor.has(collab)) return false;
              const key = `${collab}::${(r as { type: string }).type}::${(r as { description: string | null }).description ?? ""}`;
              return !seen.has(key);
            })
            .map((r) => ({
              company_id: companyId,
              collaborator_id: (r as { collaborator_id: string }).collaborator_id,
              store_id: (r as { store_id: string | null }).store_id,
              type: (r as { type: string }).type,
              description: (r as { description: string | null }).description,
              value: Number((r as { value: number }).value),
              is_fixed: true,
              is_payable: true,
              month: openMonth,
              year: openYear,
            }));

          if (carryOverRows.length > 0) {
            const { error: coErr } = await supabase
              .from("payroll_entries")
              .insert(carryOverRows as unknown as PayrollEntry[]);
            if (!coErr) recurringCopied = carryOverRows.length;
            else console.error("Carry-over falhou:", coErr.message);
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Lança férias aprovadas desse mês. Casos cobertos:
      //   1. posted=false + payroll_month match → caso normal
      //   2. posted=false + payroll_month null + start_date deriva pra cá
      //      → fallback pra requests aprovadas antes da migration
      //   3. posted=true + payroll_month match MAS entries não existem mais
      //      → órfão (folha foi deletada e recriada) → re-lança
      // ─────────────────────────────────────────────────────────────────────
      const { data: allApproved } = await supabase
        .from("vacation_requests")
        .select("id, collaborator_id, calculation_snapshot, days_count, sell_days, start_date, payroll_month, payroll_year, posted_to_payroll, payroll_entry_ids")
        .eq("company_id", companyId)
        .eq("status", "approved");

      // 1+2: pendentes deste mês
      const initialPending = (allApproved ?? []).filter((v) => {
        if ((v as { posted_to_payroll: boolean }).posted_to_payroll) return false;
        const pmonth = (v as { payroll_month: number | null }).payroll_month;
        const pyear = (v as { payroll_year: number | null }).payroll_year;
        if (pmonth === openMonth && pyear === openYear) return true;
        if (pmonth == null && (v as { start_date: string }).start_date) {
          const d = new Date((v as { start_date: string }).start_date);
          d.setDate(d.getDate() - 2);
          return d.getMonth() + 1 === openMonth && d.getFullYear() === openYear;
        }
        return false;
      });

      // 3: órfãos — posted=true desse mês mas entries não existem mais
      const candidatePosted = (allApproved ?? []).filter((v) => {
        if (!(v as { posted_to_payroll: boolean }).posted_to_payroll) return false;
        const pmonth = (v as { payroll_month: number | null }).payroll_month;
        const pyear = (v as { payroll_year: number | null }).payroll_year;
        return pmonth === openMonth && pyear === openYear;
      });

      const orphanIdsCheck = candidatePosted.flatMap(
        (v) => (v as { payroll_entry_ids: string[] | null }).payroll_entry_ids ?? [],
      );
      let existingEntryIds = new Set<string>();
      if (orphanIdsCheck.length > 0) {
        const { data: existing } = await supabase
          .from("payroll_entries")
          .select("id")
          .in("id", orphanIdsCheck);
        existingEntryIds = new Set((existing ?? []).map((e) => e.id as string));
      }
      const orphans = candidatePosted.filter((v) => {
        const ids = (v as { payroll_entry_ids: string[] | null }).payroll_entry_ids ?? [];
        if (ids.length === 0) return true; // posted mas sem ids = órfão garantido
        return ids.some((id) => !existingEntryIds.has(id));
      });

      const pendingVacations = [...initialPending, ...orphans];

      let vacationsPosted = 0;
      if (pendingVacations && pendingVacations.length > 0) {
        // Pra cada pendente: precisa do store_id atual do colab (snapshot
        // não captura). Pré-carrega.
        const collabIds = Array.from(
          new Set(pendingVacations.map((v) => v.collaborator_id as string)),
        );
        const { data: collabs } = await supabase
          .from("collaborators")
          .select("id, store_id, current_salary, dependents_count")
          .in("id", collabIds);
        const collabById = new Map(
          (collabs ?? []).map((c) => [
            c.id as string,
            c as { id: string; store_id: string | null; current_salary: number | null; dependents_count: number | null },
          ]),
        );

        for (const v of pendingVacations) {
          const collab = collabById.get(v.collaborator_id as string);
          if (!collab) continue;

          // Usa o snapshot se existir; senão recalcula como fallback.
          let calc: VacationCalcResult | null =
            (v.calculation_snapshot as unknown as VacationCalcResult | null) ?? null;
          if (!calc) {
            const salary = Number(collab.current_salary ?? 0);
            if (!(salary > 0)) continue; // sem como calcular
            calc = calcVacation({
              salary,
              daysTaken: v.days_count as number,
              daysSold: (v.sell_days as number | null) ?? 0,
              dependents: Number(collab.dependents_count ?? 0),
            });
          }

          try {
            const entryIds = await postVacationToPayroll({
              requestId: v.id as string,
              companyId,
              collaboratorId: v.collaborator_id as string,
              storeId: collab.store_id,
              month: openMonth,
              year: openYear,
              calc,
            });
            await supabase
              .from("vacation_requests")
              .update({
                posted_to_payroll: true,
                payroll_entry_ids: entryIds.length > 0 ? entryIds : null,
              })
              .eq("id", v.id as string);
            vacationsPosted++;
          } catch (e) {
            // Não derruba a abertura do período por causa de 1 férias com erro.
            console.error(`Falha ao lançar férias ${v.id} na folha:`, e);
          }
        }
      }

      return { period: period as PayrollPeriod, vacationsPosted, recurringCopied };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      queryClient.invalidateQueries({ queryKey: ["vacation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      const parts: string[] = ["Período aberto ✓"];
      if (result.recurringCopied > 0) {
        parts.push(
          `${result.recurringCopied} lançamento${result.recurringCopied === 1 ? "" : "s"} recorrente${result.recurringCopied === 1 ? "" : "s"} copiado${result.recurringCopied === 1 ? "" : "s"} do mês anterior`,
        );
      }
      if (result.vacationsPosted > 0) {
        parts.push(
          `${result.vacationsPosted} férias pendente${result.vacationsPosted === 1 ? "" : "s"} lançada${result.vacationsPosted === 1 ? "" : "s"}`,
        );
      }
      toast.success(parts.join(" · "));
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Deleta período e todos os seus lançamentos
  // ─────────────────────────────────────────────────────────────────────────
  const deletePeriod = useMutation({
    mutationFn: async ({
      periodId,
      reference_month,
    }: {
      periodId: string;
      reference_month: string;
    }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { month, year } = periodToMonthYear(reference_month);

      // 1. Reset vacation_requests do mês — apagar as payroll_entries faz
      //    com que os payroll_entry_ids guardados na request fiquem órfãos.
      //    Marcamos posted_to_payroll=false pra que, ao reabrir o período,
      //    o trigger de pending re-lance os 4-6 lançamentos automaticamente.
      await supabase
        .from("vacation_requests")
        .update({ posted_to_payroll: false, payroll_entry_ids: null })
        .eq("company_id", companyId)
        .eq("payroll_month", month)
        .eq("payroll_year", year)
        .eq("status", "approved");

      // 2. Remove entries do período — SELETIVO.
      //    Preserva entries criadas pela sync (têm external_id da agenda:
      //    salario-base, inss-base, fgts-base, irpf-base, plano-saude-*,
      //    e os ids numéricos dos adicionais sincronizados). Re-abrir a
      //    folha não perde grat/boni/desconto que vieram da agenda.
      //
      //    Apaga:
      //      - entries sem external_id (auto-populate, carry-over, manuais)
      //      - entries com prefixo 'ferias-' (do recibo de férias) —
      //        precisam ser re-postadas pelo openPeriod via vacation flag.
      await supabase
        .from("payroll_entries")
        .delete()
        .eq("company_id", companyId)
        .eq("month", month)
        .eq("year", year)
        .or("external_id.is.null,external_id.like.ferias-%");

      // 3. Remove o período
      const { error } = await supabase
        .from("payroll_periods")
        .delete()
        .eq("id", periodId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["vacation-requests"] });
      toast.success("Período removido ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Repopula apenas o que ainda não foi lançado (colaboradores/benefícios novos)
  // ─────────────────────────────────────────────────────────────────────────
  const repopulatePeriod = useMutation({
    mutationFn: async ({
      reference_month,
    }: {
      reference_month: string;
    }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { month, year } = periodToMonthYear(reference_month);

      // Entries fixas já existentes → para deduplicar
      const { data: existingEntries } = await supabase
        .from("payroll_entries")
        .select("collaborator_id, type, description")
        .eq("company_id", companyId)
        .eq("month", month)
        .eq("year", year)
        .eq("is_fixed", true);

      const existingSalaries = new Set(
        (existingEntries ?? [])
          .filter((e) => e.type === "salario_base")
          .map((e) => e.collaborator_id),
      );
      // Normaliza removendo sufixo " (auto)" pra casar tanto entries antigas
      // quanto novas (depois da remoção do sufixo).
      const stripAuto = (desc: string | null) =>
        (desc ?? "").replace(/\s*\(auto\)$/, "");
      const existingBenefits = new Set(
        (existingEntries ?? [])
          .filter((e) => e.type === "beneficio")
          .map((e) => `${e.collaborator_id}::${stripAuto(e.description)}`),
      );
      const existingTaxes = new Set(
        (existingEntries ?? [])
          .filter((e) => e.type === "inss" || e.type === "fgts" || e.type === "irpf")
          .map((e) => `${e.collaborator_id}::${e.type}`),
      );

      // Salários + encargos pra colaboradores que ainda não foram populados
      const { data: collaborators } = await supabase
        .from("collaborators")
        .select(
          "id, store_id, dependents_count, position:positions(salary)",
        )
        .eq("company_id", companyId)
        .eq("status", "ativo");

      const newAutoEntries: PayrollEntry[] = [];
      for (const c of collaborators ?? []) {
        const salary = (c.position as { salary?: number } | null)?.salary ?? 0;
        if (salary <= 0) continue;
        const deps = (c as { dependents_count?: number }).dependents_count ?? 0;
        const taxes = calcAllTaxes({ grossSalary: salary, dependents: deps });
        const baseEntry = {
          company_id: companyId,
          collaborator_id: c.id,
          store_id: c.store_id,
          is_fixed: true,
          is_payable: true,
          month,
          year,
        };
        if (!existingSalaries.has(c.id)) {
          newAutoEntries.push({
            ...baseEntry,
            type: "salario_base" as const,
            description: "Salário base",
            value: salary,
          } as PayrollEntry);
        }
        if (taxes.inss > 0 && !existingTaxes.has(`${c.id}::inss`)) {
          newAutoEntries.push({
            ...baseEntry,
            type: "inss" as const,
            description: "INSS (tabela 2026)",
            value: taxes.inss,
          } as PayrollEntry);
        }
        if (taxes.fgts > 0 && !existingTaxes.has(`${c.id}::fgts`)) {
          newAutoEntries.push({
            ...baseEntry,
            type: "fgts" as const,
            description: "FGTS (8%)",
            value: taxes.fgts,
          } as PayrollEntry);
        }
        if (taxes.irpf > 0 && !existingTaxes.has(`${c.id}::irpf`)) {
          newAutoEntries.push({
            ...baseEntry,
            type: "irpf" as const,
            description:
              deps > 0
                ? `IRPF (tabela 2026, ${deps} dep.)`
                : "IRPF (tabela 2026)",
            value: taxes.irpf,
          } as PayrollEntry);
        }
      }

      if (newAutoEntries.length > 0) {
        await supabase.from("payroll_entries").insert(newAutoEntries);
      }
      // Manter compat com o retorno (nome legado)
      const newSalaryEntries = newAutoEntries.filter(
        (e) => e.type === "salario_base",
      );

      // Benefícios
      const { data: assignments } = await supabase
        .from("benefits_assignments")
        .select(
          "collaborator_id, benefit:benefits(name, value, value_type, applicable_days, category), collaborator:collaborators!inner(company_id, status, store_id, contracted_store_id)",
        )
        .eq("collaborator.company_id", companyId)
        .eq("collaborator.status", "ativo");

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

      const newBenefitEntries = (assignments ?? [])
        .map((a) => {
          const benefit = a.benefit as
            | {
                name: string;
                value: number;
                value_type: "monthly" | "daily" | null;
                applicable_days: string[] | null;
                category: string | null;
              }
            | null;
          if (!benefit || benefit.value <= 0) return null;

          const desc = benefit.name;
          if (existingBenefits.has(`${a.collaborator_id}::${desc}`)) return null;

          const collab = a.collaborator as
            | { store_id: string | null; contracted_store_id: string | null }
            | null;
          const benefitStoreId = collab?.store_id || collab?.contracted_store_id || null;
          const holidays = benefitStoreId ? (holidaysByStore.get(benefitStoreId) ?? []) : [];

          const monthlyValue = calculateMonthlyBenefitValue(
            benefit.value,
            (benefit.value_type ?? "monthly") as "monthly" | "daily",
            (benefit.applicable_days ?? ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[],
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
            description: desc,
            value: monthlyValue,
            is_fixed: true,
            is_payable: benefit.category === "adicional",
            month,
            year,
          };
        })
        .filter(Boolean) as PayrollEntry[];

      if (newBenefitEntries.length > 0) {
        await supabase.from("payroll_entries").insert(newBenefitEntries);
      }

      return {
        salariesAdded: newSalaryEntries.length,
        benefitsAdded: newBenefitEntries.length,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      const total = result.salariesAdded + result.benefitsAdded;
      if (total === 0) {
        toast.success("Tudo já populado — nenhum lançamento novo necessário.");
      } else {
        toast.success(`${total} lançamento(s) adicionado(s) ✓`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Recalcula INSS/IRPF/FGTS de um período: apaga os encargos atuais e
  // reinjeta usando calcAllTaxes (tabela 2026 + dependentes do colaborador).
  // Útil pra periodos antigos com valores obsoletos.
  // ─────────────────────────────────────────────────────────────────────────
  const recalculateTaxes = useMutation({
    mutationFn: async ({ reference_month }: { reference_month: string }) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { month, year } = periodToMonthYear(reference_month);

      // 1. Apaga encargos existentes do período
      await supabase
        .from("payroll_entries")
        .delete()
        .eq("company_id", companyId)
        .eq("month", month)
        .eq("year", year)
        .in("type", ["inss", "irpf", "fgts"]);

      // 2. Pega salários ativos com dependentes
      const { data: collaborators } = await supabase
        .from("collaborators")
        .select(
          "id, store_id, dependents_count, position:positions(salary)",
        )
        .eq("company_id", companyId)
        .eq("status", "ativo");

      // 3. Reinjeta usando calcAllTaxes
      const newTaxEntries: PayrollEntry[] = [];
      for (const c of collaborators ?? []) {
        const salary = (c.position as { salary?: number } | null)?.salary ?? 0;
        if (salary <= 0) continue;
        const deps = (c as { dependents_count?: number }).dependents_count ?? 0;
        const taxes = calcAllTaxes({ grossSalary: salary, dependents: deps });
        const base = {
          company_id: companyId,
          collaborator_id: c.id,
          store_id: c.store_id,
          is_fixed: true,
          month,
          year,
        };
        if (taxes.inss > 0) {
          newTaxEntries.push({
            ...base,
            type: "inss" as const,
            description: "INSS (tabela 2026)",
            value: taxes.inss,
          } as PayrollEntry);
        }
        if (taxes.fgts > 0) {
          newTaxEntries.push({
            ...base,
            type: "fgts" as const,
            description: "FGTS (8%)",
            value: taxes.fgts,
          } as PayrollEntry);
        }
        if (taxes.irpf > 0) {
          newTaxEntries.push({
            ...base,
            type: "irpf" as const,
            description:
              deps > 0
                ? `IRPF (tabela 2026, ${deps} dep.)`
                : "IRPF (tabela 2026)",
            value: taxes.irpf,
          } as PayrollEntry);
        }
      }

      if (newTaxEntries.length > 0) {
        await supabase.from("payroll_entries").insert(newTaxEntries);
      }
      return { count: newTaxEntries.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success(`${result.count} encargos recalculados (tabela 2026) ✓`);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  return { periods, isLoading, openPeriod, deletePeriod, repopulatePeriod, recalculateTaxes };
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
          "*, collaborator:collaborators(id, name, cpf, regime, status, pix_key, softcom_surname, store_id, team_id)"
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

      // Decisão de produto: lançamento FIXO de gratificação/bonificação é
      // recorrente e precisa virar adicional na agenda (pra que apareça em
      // outras folhas e fique consistente com o sistema legado). Lançamento
      // pontual (is_fixed=false) fica só no DNA Softcom.
      const shouldPushAsAdicional =
        values.is_fixed === true &&
        (values.type === "gratificacao" || values.type === "bonificacao");

      let externalId: string | null = null;
      if (shouldPushAsAdicional) {
        // Mapeamento type → tipo da agenda
        const tipoAgenda =
          values.type === "gratificacao"
            ? "GRATIFICAÇÃO ESPONTANEA"
            : "CUSTO SETOR";

        const { data: pushData, error: pushError } = await supabase.functions.invoke(
          "collaborator-subresource",
          {
            body: {
              action: "create",
              kind: "adicionais",
              collaboratorId: values.collaborator_id,
              data: {
                tipo: tipoAgenda,
                descricao: values.description || tipoAgenda,
                valores: values.value,
              },
            },
          },
        );
        if (pushError) {
          throw new Error(
            "Falha ao criar adicional na agenda: " + pushError.message,
          );
        }
        if (pushData && typeof pushData === "object" && "error" in pushData) {
          const err = pushData as { error: string; details?: string };
          throw new Error(
            err.details ? `${err.error}: ${err.details}` : err.error,
          );
        }
        // edge function já gravou em payroll_entries via apply-financials NEXT
        // sync. MAS pra que o lançamento apareça JÁ neste período aberto,
        // gravamos local também com external_id do adicional retornado, pra
        // evitar duplicação se a sync rodar depois.
        const remote = (pushData as { remote?: { id?: number | string } } | null)?.remote;
        if (remote && remote.id != null) {
          externalId = String(remote.id);
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("payroll_entries").insert({
        company_id: companyId,
        collaborator_id: values.collaborator_id,
        type: values.type,
        description: values.description || null,
        value: values.value,
        is_fixed: values.is_fixed,
        external_id: externalId,
        month,
        year,
        created_by: userData?.user?.id ?? null,
      });
      if (error) throw error;

      return { pushedToAgenda: shouldPushAsAdicional };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      const suffix = result?.pushedToAgenda
        ? " ✓ (sincronizado com a agenda como adicional)"
        : " ✓";
      toast.success("Lançamento criado" + suffix);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Deleta lançamento AVULSO (manual) — só permite se for is_fixed=false E
  // sem external_id. Entries sincronizadas/auto-popular/férias/salário-família
  // não podem ser deletadas por aqui (devem ser estornadas ou recriadas via
  // re-sync). Pra deletar sync, apaga o período inteiro.
  // ─────────────────────────────────────────────────────────────────────────
  const deleteEntry = useMutation({
    mutationFn: async (entryId: string) => {
      if (!period || !companyId) throw new Error("Período não encontrado");
      if (period.status !== "open") {
        throw new Error("Período fechado. Reabra antes de deletar.");
      }
      // Confirma que é avulso antes de deletar (defesa em profundidade)
      const { data: entry, error: fetchError } = await supabase
        .from("payroll_entries")
        .select("id, is_fixed, external_id")
        .eq("id", entryId)
        .single();
      if (fetchError || !entry) throw fetchError ?? new Error("Lançamento não encontrado");
      if (entry.is_fixed) {
        throw new Error("Lançamento fixo (do salário/encargo) — use estorno.");
      }
      if (entry.external_id) {
        throw new Error("Lançamento sincronizado — não pode ser deletado.");
      }
      const { error } = await supabase
        .from("payroll_entries")
        .delete()
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success("Lançamento removido ✓");
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
    deleteEntry,
    reverseEntry,
    closePeriod,
    reopenPeriod,
  };
}

/**
 * Helper: identifica se uma entry é AVULSA (lançada manualmente via
 * NewEntryDialog). Avulsas podem ser deletadas e NÃO devem aparecer na ficha
 * permanente do colab (são pontuais ao mês).
 */
export function isManualAvulso(entry: { is_fixed?: boolean; external_id?: string | null }): boolean {
  return entry.is_fixed === false && (entry.external_id == null || entry.external_id === "");
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
