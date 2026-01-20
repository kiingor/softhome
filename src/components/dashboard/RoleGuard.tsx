import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useDashboard, AppRole } from "@/contexts/DashboardContext";

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  fallback?: ReactNode;
}

const RoleGuard = ({ children, allowedRoles, fallback }: RoleGuardProps) => {
  const { hasAnyRole, isLoading, user } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-pulse text-muted-foreground">Verificando permissões...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAnyRole(allowedRoles)) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Acesso Negado</h2>
        <p className="text-muted-foreground max-w-md">
          Você não tem permissão para acessar esta página. Entre em contato com o administrador se precisar de acesso.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGuard;
