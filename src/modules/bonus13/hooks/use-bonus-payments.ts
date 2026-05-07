import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BonusInstallment, BonusPayment } from "../lib/bonus-types";

/**
 * Lista pagamentos de um período inteiro (via join com entries pra filtrar
 * por period_id).
 */
export function useBonusPayments(periodId: string | null) {
  return useQuery({
    queryKey: ["bonus-payments", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      // Resolve entries do período
      const { data: entries, error: entriesErr } = await supabase
        .from("bonus_entries")
        .select("id, collaborator_id, gross_value, mode, collaborator:collaborators(name, cpf, email)")
        .eq("period_id", periodId!);
      if (entriesErr) throw entriesErr;

      const entryIds = (entries ?? []).map((e) => (e as { id: string }).id);
      if (entryIds.length === 0) return { payments: [], entriesById: new Map() };

      const { data: payments, error: payErr } = await supabase
        .from("bonus_payments")
        .select("*")
        .in("entry_id", entryIds);
      if (payErr) throw payErr;

      const entriesById = new Map(
        (entries ?? []).map((e) => [(e as { id: string }).id, e]),
      );

      return {
        payments: (payments ?? []) as BonusPayment[],
        entriesById: entriesById as Map<string, {
          id: string;
          collaborator_id: string;
          gross_value: number;
          mode: string;
          collaborator: {
            name: string;
            cpf: string;
            email: string | null;
          };
        }>,
      };
    },
  });
}

export function useTogglePaymentPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      paymentId: string;
      paid: boolean;
      installment: BonusInstallment;
      collaboratorId: string;
      year: number;
      amount: number;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("bonus_payments")
        .update({
          paid_at: input.paid ? new Date().toISOString() : null,
          paid_by: input.paid ? user?.id ?? null : null,
        })
        .eq("id", input.paymentId);
      if (error) throw error;

      // Se acabou de marcar como pago, dispara notificação
      if (input.paid) {
        const type =
          input.installment === "first"
            ? "bonus_first_paid"
            : input.installment === "second"
              ? "bonus_second_paid"
              : "bonus_paid_single";

        // Best-effort — falha de notif não quebra o fluxo principal
        try {
          await supabase.functions.invoke("bonus-notify", {
            body: {
              collaborator_id: input.collaboratorId,
              type,
              params: {
                year: input.year,
                amount: input.amount,
              },
            },
          });
        } catch (e) {
          console.warn("[bonus-notify] falhou:", e);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-payments"] });
    },
  });
}

/** Cria uma parcela `single` (avulso/antecipado) e marca como paga.
 *  Usado quando RH antecipa ou solicita individual sem ter passado pelo batch.
 */
export function useCreateSinglePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entryId: string;
      amount: number;
      collaboratorId: string;
      year: number;
      mode: "individual" | "anticipated";
      notes?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("bonus_payments").insert({
        entry_id: input.entryId,
        installment: "single",
        amount: input.amount,
        paid_at: new Date().toISOString(),
        paid_by: user?.id ?? null,
        notes: input.notes ?? null,
      });
      if (error) throw error;

      // Antecipação notifica; pagamento individual (rescisão) não notifica
      // por padrão (decisão administrativa, não celebração).
      if (input.mode === "anticipated") {
        try {
          await supabase.functions.invoke("bonus-notify", {
            body: {
              collaborator_id: input.collaboratorId,
              type: "bonus_anticipated",
              params: { year: input.year, amount: input.amount },
            },
          });
        } catch (e) {
          console.warn("[bonus-notify] anticipated falhou:", e);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-payments"] });
      qc.invalidateQueries({ queryKey: ["bonus-entries"] });
    },
  });
}
