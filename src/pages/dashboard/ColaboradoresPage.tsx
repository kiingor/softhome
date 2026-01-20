import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, Search, Filter, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

const ColaboradoresPage = () => {
  return (
    <RoleGuard allowedRoles={["admin", "rh", "gestor"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
            <p className="text-muted-foreground">Gerencie os colaboradores da sua empresa</p>
          </div>
          <Button variant="hero">
            <UserPlus className="w-4 h-4 mr-2" />
            Novo Colaborador
          </Button>
        </div>

        {/* Search and Filters */}
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, email ou cargo..." className="pl-10" />
              </div>
              <Button variant="outline">
                <Filter className="w-4 h-4 mr-2" />
                Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Nenhum colaborador cadastrado
            </h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Comece cadastrando seu primeiro colaborador para gerenciar a equipe.
            </p>
            <Button variant="hero">
              <UserPlus className="w-4 h-4 mr-2" />
              Cadastrar Colaborador
            </Button>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
};

export default ColaboradoresPage;
