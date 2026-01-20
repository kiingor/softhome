import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useClosedPeriods = (companyId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: closedPeriods = [], isLoading } = useQuery({
    queryKey: ["closed-periods", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("closed_periods")
        .select("*")
        .eq("company_id", companyId)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const isPeriodClosed = (month: number, year: number): boolean => {
    return closedPeriods.some((p) => p.month === month && p.year === year);
  };

  const closePeriod = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      if (!companyId) throw new Error("Empresa não selecionada");

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("closed_periods").insert({
        month,
        year,
        company_id: companyId,
        closed_by: user.user.id,
      });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Este período já está fechado");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closed-periods"] });
      toast.success("Competência fechada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao fechar competência");
    },
  });

  const reopenPeriod = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      if (!companyId) throw new Error("Empresa não selecionada");

      const { error } = await supabase
        .from("closed_periods")
        .delete()
        .eq("company_id", companyId)
        .eq("month", month)
        .eq("year", year);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closed-periods"] });
      toast.success("Competência reaberta!");
    },
    onError: () => {
      toast.error("Erro ao reabrir competência");
    },
  });

  return {
    closedPeriods,
    isLoading,
    isPeriodClosed,
    closePeriod,
    reopenPeriod,
  };
};
