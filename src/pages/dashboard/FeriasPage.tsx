import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";

const FeriasPage = () => {
  const { hasRole, hasAnyRole } = useDashboard();
  const canManage = hasAnyRole(["admin", "rh", "gestor"]);

  return (
    <PermissionGuard module="ferias">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Férias e Ausências</h1>
            <p className="text-muted-foreground">
              {canManage ? "Gerencie solicitações de férias" : "Acompanhe suas férias e ausências"}
            </p>
          </div>
          <Button variant="hero">
            <Plus className="w-4 h-4 mr-2" />
            {canManage ? "Nova Solicitação" : "Solicitar Férias"}
          </Button>
        </div>

        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Nenhuma solicitação
            </h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              {canManage
                ? "As solicitações de férias dos colaboradores aparecerão aqui."
                : "Você ainda não tem solicitações de férias."}
            </p>
            <Button variant="hero">
              <Plus className="w-4 h-4 mr-2" />
              {canManage ? "Registrar Férias" : "Solicitar Férias"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
};

export default FeriasPage;
