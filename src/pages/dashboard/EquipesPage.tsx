import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { UserCog } from "lucide-react";

const EquipesPage = () => {
  return (
    <RoleGuard allowedRoles={["admin", "rh", "gestor"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipes</h1>
          <p className="text-muted-foreground">Organize colaboradores em equipes</p>
        </div>

        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <UserCog className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Nenhuma equipe cadastrada
            </h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Crie equipes para organizar melhor seus colaboradores.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
};

export default EquipesPage;
