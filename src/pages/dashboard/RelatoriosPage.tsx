import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const RelatoriosPage = () => {
  return (
    <RoleGuard allowedRoles={["admin", "rh", "contador"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground">Visualize relatórios e métricas da empresa</p>
        </div>

        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Módulo em construção
            </h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Os relatórios estarão disponíveis em breve.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
};

export default RelatoriosPage;
