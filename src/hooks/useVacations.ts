import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";

export interface VacationPeriod {
  id: string;
  collaborator_id: string;
  company_id: string;
  start_date: string;
  end_date: string;
  days_entitled: number;
  days_taken: number;
  days_sold: number;
  days_remaining: number;
  status: string;
  created_at: string;
  collaborator?: {
    id: string;
    name: string;
    position: string | null;
    admission_date: string | null;
  };
}

export interface VacationRequest {
  id: string;
  collaborator_id: string;
  company_id: string;
  vacation_period_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  sell_days: number;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  collaborator?: {
    id: string;
    name: string;
    position: string | null;
  };
  vacation_period?: VacationPeriod;
}

export const useVacationPeriods = () => {
  const { currentCompany } = useDashboard();

  return useQuery({
    queryKey: ["vacation-periods", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("vacation_periods")
        .select("*, collaborator:collaborators(id, name, position, admission_date)")
        .eq("company_id", currentCompany.id)
        .order("end_date", { ascending: false });
      if (error) throw error;
      return data as unknown as VacationPeriod[];
    },
    enabled: !!currentCompany?.id,
  });
};

export const useVacationRequests = () => {
  const { currentCompany } = useDashboard();

  return useQuery({
    queryKey: ["vacation-requests", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("*, collaborator:collaborators(id, name, position), vacation_period:vacation_periods(*)")
        .eq("company_id", currentCompany.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as VacationRequest[];
    },
    enabled: !!currentCompany?.id,
  });
};

export const useCollaboratorVacationPeriods = (collaboratorId: string | undefined) => {
  return useQuery({
    queryKey: ["vacation-periods-collaborator", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("vacation_periods")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as unknown as VacationPeriod[];
    },
    enabled: !!collaboratorId,
  });
};

export const useCollaboratorVacationRequests = (collaboratorId: string | undefined) => {
  return useQuery({
    queryKey: ["vacation-requests-collaborator", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("*, vacation_period:vacation_periods(*)")
        .eq("collaborator_id", collaboratorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as VacationRequest[];
    },
    enabled: !!collaboratorId,
  });
};

export const useCreateVacationRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      collaborator_id: string;
      company_id: string;
      vacation_period_id: string;
      start_date: string;
      end_date: string;
      days_count: number;
      sell_days: number;
      requested_by: string;
      notes?: string;
    }) => {
      const { data: result, error } = await supabase
        .from("vacation_requests")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] });
      toast.success("Solicitação de férias criada!");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar solicitação: " + error.message);
    },
  });
};

export const useUpdateVacationRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      status?: string;
      approved_by?: string;
      approved_at?: string;
      rejection_reason?: string;
    }) => {
      const { data: result, error } = await supabase
        .from("vacation_requests")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar solicitação: " + error.message);
    },
  });
};

export const useDeleteVacationRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vacation_requests")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-requests"] });
      toast.success("Solicitação removida!");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover solicitação: " + error.message);
    },
  });
};

// Status helpers
export const vacationRequestStatusLabels: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  in_progress: "Em Gozo",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const vacationRequestStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  in_progress: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-gray-100 text-gray-800 border-gray-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

export const vacationPeriodStatusLabels: Record<string, string> = {
  pending: "Adquirindo",
  available: "Disponível",
  partially_used: "Parcialmente Usado",
  used: "Utilizado",
  expired: "Vencido",
};

export const vacationPeriodStatusColors: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800 border-blue-200",
  available: "bg-green-100 text-green-800 border-green-200",
  partially_used: "bg-yellow-100 text-yellow-800 border-yellow-200",
  used: "bg-gray-100 text-gray-800 border-gray-200",
  expired: "bg-red-100 text-red-800 border-red-200",
};
