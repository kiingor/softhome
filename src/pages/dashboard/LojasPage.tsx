import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, Plus } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";

const LojasPage = () => {
  const { stores, currentCompany } = useDashboard();

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lojas</h1>
            <p className="text-muted-foreground">
              Gerencie as unidades de {currentCompany?.company_name || "sua empresa"}
            </p>
          </div>
          <Button variant="hero">
            <Plus className="w-4 h-4 mr-2" />
            Nova Loja
          </Button>
        </div>

        {stores.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map(store => (
              <Card key={store.id} className="border border-border hover:shadow-soft transition-shadow cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Store className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{store.store_name}</h3>
                      {store.store_code && (
                        <p className="text-sm text-muted-foreground">Código: {store.store_code}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Store className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Nenhuma loja cadastrada
              </h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Cadastre lojas para organizar colaboradores por unidade.
              </p>
              <Button variant="hero">
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Loja
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </RoleGuard>
  );
};

export default LojasPage;
