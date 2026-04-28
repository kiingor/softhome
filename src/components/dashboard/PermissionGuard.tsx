import { ReactNode } from "react";
import { usePermissions, ModuleType } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldWarning as ShieldX, CircleNotch as Loader2 } from "@phosphor-icons/react";
interface PermissionGuardProps {
  module: ModuleType;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Guards content based on module-level permissions.
 * Checks if user has canView permission for the specified module.
 * Admin users (company owners) always have access.
 */
const PermissionGuard = ({ module, children, fallback }: PermissionGuardProps) => {
  const { canView, isLoading, isAdmin } = usePermissions(module);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Admin always has access
  if (isAdmin || canView) {
    return <>{children}</>;
  }

  // Custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default access denied UI
  return (
    <Card className="border border-border">
      <CardContent className="p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Acesso Restrito
        </h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Você não tem permissão para visualizar esta página. Entre em contato com o administrador da empresa.
        </p>
      </CardContent>
    </Card>
  );
};

export default PermissionGuard;
