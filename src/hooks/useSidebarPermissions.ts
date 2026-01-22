import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { ModuleType } from "./usePermissions";

/**
 * Hook to fetch all permissions for sidebar menu filtering.
 * Returns a map of module -> canView for efficient lookup.
 */
export const useSidebarPermissions = () => {
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
    queryKey: ["sidebar-permissions", user?.id, currentCompany?.id],
    queryFn: async () => {
      if (!user?.id || !currentCompany?.id) return [];

      const { data, error } = await supabase
        .from("user_permissions")
        .select("module, can_view")
        .eq("user_id", user.id)
        .eq("company_id", currentCompany.id);

      if (error) {
        console.error("Error fetching sidebar permissions:", error);
        return [];
      }

      return data || [];
    },
    enabled: !!user?.id && !!currentCompany?.id,
  });

  const isLoading = isAdminLoading || isPermissionsLoading;
  const userIsAdmin = isAdmin ?? false;

  // Build a map for quick lookup
  const permissionMap = new Map<string, boolean>();
  permissions.forEach((p) => {
    permissionMap.set(p.module, p.can_view ?? false);
  });

  const canViewModule = (module: ModuleType | string): boolean => {
    if (userIsAdmin) return true;
    return permissionMap.get(module) ?? false;
  };

  return {
    canViewModule,
    isAdmin: userIsAdmin,
    isLoading,
  };
};
