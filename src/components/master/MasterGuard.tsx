import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMaster } from "@/contexts/MasterContext";
import { Loader2, ShieldAlert } from "lucide-react";

interface MasterGuardProps {
  children: ReactNode;
}

export function MasterGuard({ children }: MasterGuardProps) {
  const { isMasterAdmin, isLoading } = useMaster();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  if (!isMasterAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto p-8">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Acesso Negado</h1>
          <p className="text-muted-foreground mb-6">
            Você não possui permissão para acessar o Portal Master. 
            Este portal é exclusivo para administradores do RH360.
          </p>
          <a href="/" className="text-primary hover:underline">
            Voltar ao site
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}