import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type { Badge } from "../types";
import type { BadgeFormValues } from "../schemas/badge.schema";

// 'as any' temporário: tabela 'badges' ainda não está em supabase/types.ts
// até as migrations da Fase 1 serem aplicadas e os types regenerados.
// Após `npx supabase db push` + `gen types`, remover os casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useBadges() {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: badges = [], isLoading } = useQuery({
    queryKey: ["badges", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await sb
        .from("badges")
        .select("*")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Badge[];
    },
    enabled: !!companyId,
  });

  const createBadge = useMutation({
    mutationFn: async (values: BadgeFormValues) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { error } = await sb.from("badges").insert({
        company_id: companyId,
        name: values.name,
        description: values.description || null,
        category: values.category,
        weight: values.weight,
        icon: values.icon || null,
        is_active: values.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["badges"] });
      toast.success("Insígnia cadastrada ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  const updateBadge = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: BadgeFormValues }) => {
      const { error } = await sb
        .from("badges")
        .update({
          name: values.name,
          description: values.description || null,
          category: values.category,
          weight: values.weight,
          icon: values.icon || null,
          is_active: values.is_active,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["badges"] });
      toast.success("Insígnia atualizada ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  const deleteBadge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("badges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["badges"] });
      toast.success("Insígnia removida.");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return {
    badges,
    isLoading,
    createBadge,
    updateBadge,
    deleteBadge,
  };
}
