import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ReviewInsert =
  Database["public"]["Tables"]["payroll_collaborator_reviews"]["Insert"];

// Conferência de lançamentos por colaborador dentro de um período de folha.
// 1 registro por (período, colaborador). Espelha o fluxo de "Pago" da aba
// Pagamentos, mas no nível do colaborador (o RH confere a pessoa inteira e
// anota uma observação quando há divergência).
/** Parecer da diretoria por colaborador. null = ainda não avaliado. */
export type DirectorStatus = "aprovado" | "atencao";

export interface PayrollReview {
  id: string;
  period_id: string;
  collaborator_id: string;
  is_reviewed: boolean;
  observation: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Independente de is_reviewed: a conferência é do RH, o parecer é da diretoria. */
  director_status: DirectorStatus | null;
  director_status_at: string | null;
  director_status_by: string | null;
}

export function usePayrollReviews(periodId: string | undefined) {
  return useQuery({
    queryKey: ["payroll-reviews", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from("payroll_collaborator_reviews")
        .select("*")
        .eq("period_id", periodId);
      if (error) throw error;
      return (data ?? []) as PayrollReview[];
    },
    enabled: !!periodId,
  });
}

interface ReviewPatch {
  is_reviewed?: boolean;
  observation?: string | null;
  director_status?: DirectorStatus | null;
}

export function useUpsertPayrollReview(periodId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collaboratorId,
      patch,
    }: {
      collaboratorId: string;
      patch: ReviewPatch;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      // Tipado pelo schema (era Record<string, unknown>, que desligava a
      // checagem justamente no ponto de escrita no banco).
      const payload: ReviewInsert = {
        period_id: periodId,
        collaborator_id: collaboratorId,
        ...patch,
      };
      // Carimba quem/quando conferiu sempre que o flag muda.
      if (patch.is_reviewed !== undefined) {
        payload.reviewed_at = patch.is_reviewed ? new Date().toISOString() : null;
        payload.reviewed_by = patch.is_reviewed ? userData?.user?.id ?? null : null;
      }
      const { error } = await supabase
        .from("payroll_collaborator_reviews")
        .upsert(payload, { onConflict: "period_id,collaborator_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-reviews", periodId] });
    },
    onError: (err: Error) => {
      toast.error("Não rolou salvar a conferência. " + (err.message ?? ""));
    },
  });
}
