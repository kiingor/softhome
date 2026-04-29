import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";

export type ModuleType =
  | "colaboradores"
  | "setores"
  | "cargos"
  | "empresas"
  | "beneficios"
  | "ferias"
  | "financeiro"
  | "relatorios"
  | "contabilidade"
  | "configuracoes"
  | "permissoes"
  | "exames"
  | "jornada"
  | "admissoes"
  | "vagas"
  | "candidatos"
  | "folha";

export interface ModulePermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isLoading: boolean;
  isAdmin: boolean;
}

export const MODULE_LABELS: Record<ModuleType, string> = {
  colaboradores: "Colaboradores",
  setores: "Setores",
  cargos: "Cargos",
  empresas: "Empresas",
  beneficios: "Benefícios",
  ferias: "Férias e Ausências",
  financeiro: "Lançamentos Financeiro",
  relatorios: "Relatórios",
  contabilidade: "Contabilidade",
  configuracoes: "Configurações",
  permissoes: "Permissões de Usuários",
  exames: "Exames Ocupacionais",
};

export const usePermissions = (module: ModuleType): ModulePermissions => {
  const { user, currentCompany } = useDashboard();

  const { data: isAdmin, isLoading: isAdminLoading } = useQuery({
    queryKey: ["is-company-admin", user?.id, currentCompany?.id],
    queryFn: async () => {
      if (!user?.id || !currentCompany?.id) return false;
      
      const { data, error } = await supabase.rpc("is_company_admin", {
        _user_id: user.id,
        _company_id: currentCompany.id,
      });
      
      if (error) {
        console.error("Error checking admin status:", error);
        return false;
      }
      
      return data ?? false;
    },
    enabled: !!user?.id && !!currentCompany?.id,
  });

  const { data: permissions, isLoading: isPermissionsLoading } = useQuery({
    queryKey: ["permissions", user?.id, currentCompany?.id, module],
    queryFn: async () => {
      if (!user?.id || !currentCompany?.id) {
        return { can_view: false, can_create: false, can_edit: false, can_delete: false };
      }

      const { data, error } = await supabase.rpc("get_user_permissions", {
        _user_id: user.id,
        _company_id: currentCompany.id,
        _module: module,
      });

      if (error) {
        console.error("Error fetching permissions:", error);
        return { can_view: false, can_create: false, can_edit: false, can_delete: false };
      }

      return data?.[0] || { can_view: false, can_create: false, can_edit: false, can_delete: false };
    },
    enabled: !!user?.id && !!currentCompany?.id,
  });

  const isLoading = isAdminLoading || isPermissionsLoading;
  const userIsAdmin = isAdmin ?? false;

  // Admin has all permissions
  if (userIsAdmin) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isLoading,
      isAdmin: true,
    };
  }

  return {
    canView: permissions?.can_view ?? false,
    canCreate: permissions?.can_create ?? false,
    canEdit: permissions?.can_edit ?? false,
    canDelete: permissions?.can_delete ?? false,
    isLoading,
    isAdmin: false,
  };
};

// Hook to check if current user is company admin
export const useIsCompanyAdmin = () => {
  const { user, currentCompany } = useDashboard();

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["is-company-admin", user?.id, currentCompany?.id],
    queryFn: async () => {
      if (!user?.id || !currentCompany?.id) return false;
      
      const { data, error } = await supabase.rpc("is_company_admin", {
        _user_id: user.id,
        _company_id: currentCompany.id,
      });
      
      if (error) {
        console.error("Error checking admin status:", error);
        return false;
      }
      
      return data ?? false;
    },
    enabled: !!user?.id && !!currentCompany?.id,
  });

  return { isAdmin: isAdmin ?? false, isLoading };
};
