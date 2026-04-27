import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type { JourneyMilestone, JourneyMilestoneStatus } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface UseJourneyMilestonesOptions {
  collaboratorId?: string;
  statusIn?: JourneyMilestoneStatus[];
}

export function useJourneyMilestones(options: UseJourneyMilestonesOptions = {}) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ["journey-milestones", companyId, options.collaboratorId, options.statusIn?.join("-")],
    queryFn: async () => {
      if (!companyId) return [];
      let q = sb
        .from("journey_milestones")
        .select("*, collaborator:collaborators(id, name, admission_date)")
        .eq("company_id", companyId)
        .order("due_date", { ascending: true });
      if (options.collaboratorId) {
        q = q.eq("collaborator_id", options.collaboratorId);
      }
      if (options.statusIn && options.statusIn.length > 0) {
        q = q.in("status", options.statusIn);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as JourneyMilestone[];
    },
    enabled: !!companyId,
  });

  const completeMilestone = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await sb
        .from("journey_milestones")
        .update({
          status: "completed",
          evaluated_by: userData?.user?.id ?? null,
          evaluated_at: new Date().toISOString(),
          notes: notes ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-milestones"] });
      toast.success("Marco avaliado ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return {
    milestones,
    isLoading,
    completeMilestone,
  };
}
