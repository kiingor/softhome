import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/contexts/DashboardContext";
import { Building2, Users, Store, CreditCard } from "lucide-react";

const EmpresaPage = () => {
  const { currentCompany, stores } = useDashboard();

  const planLabels: Record<string, string> = {
    starter: "Starter",
    professional: "Profissional",
    enterprise: "Enterprise",
  };

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresa</h1>
          <p className="text-muted-foreground">Configurações e informações da empresa</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Informações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Nome da Empresa</label>
                <p className="font-medium text-foreground">{currentCompany?.company_name || "-"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">ID</label>
                <p className="font-mono text-sm text-muted-foreground">{currentCompany?.id || "-"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Plano
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Plano Atual</label>
                <p className="font-medium text-foreground">
                  {planLabels[currentCompany?.plan_type || "starter"] || "Starter"}
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Lojas Cadastradas</label>
                <p className="font-medium text-foreground">{stores.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
};

export default EmpresaPage;
