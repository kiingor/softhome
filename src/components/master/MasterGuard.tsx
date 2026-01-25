import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMaster } from "@/contexts/MasterContext";
import { Loader2 } from "lucide-react";

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
    return <Navigate to="/admin-meurh" replace />;
  }

  return <>{children}</>;
}