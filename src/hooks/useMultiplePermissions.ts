import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { ModuleType } from "./usePermissions";

interface ModulePermission {
  module: ModuleType;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Hook to fetch permissions for multiple modules at once.
 * Useful for the dashboard home page to filter quick actions.
 */
export const useMultiplePermissions = (modules: ModuleType[]) => {
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

  const { data: permissions = [], isLoading: isPermissionsLoading } = useQuery({
    queryKey: ["all-permissions", user?.id, currentCompany?.id],
    queryFn: async () => {
      if (!user?.id || !currentCompany?.id) return [];

      const { data, error } = await supabase
        .from("user_permissions")
        .select("module, can_view, can_create, can_edit, can_delete")
        .eq("user_id", user.id)
        .eq("company_id", currentCompany.id);

      if (error) {
        console.error("Error fetching permissions:", error);
        return [];
      }

      return data || [];
    },
    enabled: !!user?.id && !!currentCompany?.id,
  });

  const isLoading = isAdminLoading || isPermissionsLoading;
  const userIsAdmin = isAdmin ?? false;

  // Build permissions map
  const getModulePermission = (module: ModuleType): ModulePermission => {
    if (userIsAdmin) {
      return {
        module,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
      };
    }

    const perm = permissions.find((p) => p.module === module);
    return {
      module,
      canView: perm?.can_view ?? false,
      canCreate: perm?.can_create ?? false,
      canEdit: perm?.can_edit ?? false,
      canDelete: perm?.can_delete ?? false,
    };
  };

  const modulePermissions = modules.map(getModulePermission);

  const canViewModule = (module: ModuleType) => {
    if (userIsAdmin) return true;
    const perm = permissions.find((p) => p.module === module);
    return perm?.can_view ?? false;
  };

  return {
    permissions: modulePermissions,
    canViewModule,
    isLoading,
    isAdmin: userIsAdmin,
  };
};
