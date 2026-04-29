import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type { CollaboratorBadge } from "../types";
import type { BadgeAssignmentValues } from "../schemas/badge.schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface UseCollaboratorBadgesOptions {
  collaboratorId?: string; // se passado, filtra por colaborador
}

export function useCollaboratorBadges(options: UseCollaboratorBadgesOptions = {}) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["collaborator-badges", companyId, options.collaboratorId],
    queryFn: async () => {
      if (!companyId) return [];
      let q = sb
        .from("collaborator_badges")
        .select("*, badge:badges(*), collaborator:collaborators(id, name)")
        .eq("company_id", companyId)
        .order("awarded_at", { ascending: false });
      if (options.collaboratorId) {
        q = q.eq("collaborator_id", options.collaboratorId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CollaboratorBadge[];
    },
    enabled: !!companyId,
  });

  const assignBadge = useMutation({
    mutationFn: async (values: BadgeAssignmentValues) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await sb.from("collaborator_badges").insert({
        company_id: companyId,
        collaborator_id: values.collaborator_id,
        badge_id: values.badge_id,
        awarded_by: userData?.user?.id ?? null,
        awarded_at: new Date(values.awarded_at).toISOString(),
        evidence: values.evidence || null,
        notes: values.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collaborator-badges"] });
      toast.success("Conquistou uma insígnia! 🎉");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("collaborator_badges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collaborator-badges"] });
      toast.success("Atribuição removida.");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return {
    assignments,
    isLoading,
    assignBadge,
    removeAssignment,
  };
}
