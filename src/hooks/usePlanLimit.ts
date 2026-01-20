import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPlanLimit, canAddCollaborator, getUpgradeSuggestion } from "@/lib/planUtils";

interface PlanLimitInfo {
  currentPlan: string;
  planLimit: number;
  activeCollaborators: number;
  canAdd: boolean;
  remainingSlots: number;
  suggestedUpgrade: string | null;
  isLoading: boolean;
}

export function usePlanLimit(companyId: string | null): PlanLimitInfo {
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['company-plan', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      
      const { data, error } = await supabase
        .from('companies')
        .select('plan_type, is_blocked')
        .eq('id', companyId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: collaboratorCount, isLoading: countLoading } = useQuery({
    queryKey: ['active-collaborators-count', companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      
      const { count, error } = await supabase
        .from('collaborators')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'ativo');
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
  });

  const currentPlan = company?.plan_type || 'essencial';
  const planLimit = getPlanLimit(currentPlan);
  const activeCollaborators = collaboratorCount || 0;
  const canAdd = canAddCollaborator(currentPlan, activeCollaborators) && !company?.is_blocked;
  const remainingSlots = Math.max(0, planLimit - activeCollaborators);
  const suggestedUpgrade = getUpgradeSuggestion(currentPlan);

  return {
    currentPlan,
    planLimit,
    activeCollaborators,
    canAdd,
    remainingSlots,
    suggestedUpgrade,
    isLoading: companyLoading || countLoading,
  };
}