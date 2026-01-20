import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePortal } from "@/contexts/PortalContext";

interface PortalGuardProps {
  children: ReactNode;
}

const PortalGuard = ({ children }: PortalGuardProps) => {
  const { user, collaborator, isLoading, isCollaborator } = usePortal();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">
          Verificando acesso...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!collaborator) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Acesso não autorizado
          </h2>
          <p className="text-muted-foreground mb-4">
            Seu usuário não está vinculado a nenhum colaborador. Entre em contato com
            o RH da sua empresa.
          </p>
          <a
            href="/login"
            className="text-primary hover:underline font-medium"
          >
            Voltar ao login
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PortalGuard;
