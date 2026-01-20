import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, Search, Filter, MoreHorizontal, Edit, Trash2, Users } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCPF } from "@/lib/validators";

interface Collaborator {
  id: string;
  name: string;
  cpf: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: "ativo" | "inativo";
  is_temp: boolean;
  store_id: string | null;
  team_id: string | null;
  created_at: string;
}

interface Store {
  id: string;
  store_name: string;
}

interface Team {
  id: string;
  name: string;
}

const ColaboradoresPage = () => {
  const { currentCompany } = useDashboard();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    if (currentCompany) {
      loadData();
    }
  }, [currentCompany, page, statusFilter, storeFilter, teamFilter]);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      if (currentCompany) {
        loadCollaborators();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadData = async () => {
    await Promise.all([loadCollaborators(), loadTeams(), loadStores()]);
  };

  const loadCollaborators = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from("collaborators")
        .select("*", { count: "exact" })
        .eq("company_id", currentCompany.id)
        .order("name");

      // Apply filters
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,cpf.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "ativo" | "inativo");
      }
      if (storeFilter !== "all") {
        query = query.eq("store_id", storeFilter);
      }
      if (teamFilter !== "all") {
        query = query.eq("team_id", teamFilter);
      }

      // Pagination
      query = query.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      setCollaborators(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar colaboradores",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeams = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name")
        .eq("company_id", currentCompany.id)
        .order("name");

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error("Error loading teams:", error);
    }
  };

  const loadStores = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from("stores")
        .select("id, store_name")
        .eq("company_id", currentCompany.id)
        .order("store_name");

      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      console.error("Error loading stores:", error);
    }
  };

  const handleEdit = (collaborator: Collaborator) => {
    navigate(`/dashboard/colaboradores/${collaborator.id}`);
  };

  const handleDelete = async (collaborator: Collaborator) => {
    if (!confirm(`Tem certeza que deseja excluir ${collaborator.name}?`)) return;

    try {
      const { error } = await supabase
        .from("collaborators")
        .delete()
        .eq("id", collaborator.id);

      if (error) throw error;

      toast({
        title: "Colaborador excluído",
        description: `${collaborator.name} foi removido.`,
      });

      loadCollaborators();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStoreName = (storeId: string | null) => {
    if (!storeId) return "-";
    return stores.find((s) => s.id === storeId)?.store_name || "-";
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "-";
    return teams.find((t) => t.id === teamId)?.name || "-";
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <RoleGuard allowedRoles={["admin", "rh", "gestor"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
            <p className="text-muted-foreground">
              {totalCount} colaborador{totalCount !== 1 ? "es" : ""} cadastrado{totalCount !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            variant="hero"
            onClick={() => navigate("/dashboard/colaboradores/novo")}
          >
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
                <Input
                  placeholder="Buscar por nome, CPF ou email..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filtros
              </Button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t">
                <div>
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {stores.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Empresa</label>
                    <Select value={storeFilter} onValueChange={setStoreFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.store_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {teams.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Setor</label>
                    <Select value={teamFilter} onValueChange={setTeamFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        {isLoading ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <div className="animate-pulse text-muted-foreground">Carregando...</div>
            </CardContent>
          </Card>
        ) : collaborators.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {searchTerm || statusFilter !== "all" || storeFilter !== "all" || teamFilter !== "all"
                  ? "Nenhum colaborador encontrado"
                  : "Nenhum colaborador cadastrado"}
              </h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                {searchTerm || statusFilter !== "all" || storeFilter !== "all" || teamFilter !== "all"
                  ? "Tente ajustar os filtros de busca."
                  : "Comece cadastrando seu primeiro colaborador."}
              </p>
              {!searchTerm && statusFilter === "all" && storeFilter === "all" && teamFilter === "all" && (
                <Button
                  variant="hero"
                  onClick={() => navigate("/dashboard/colaboradores/novo")}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Cadastrar Colaborador
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collaborators.map((collaborator) => (
                    <TableRow key={collaborator.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{collaborator.name}</span>
                          {collaborator.is_temp && (
                            <Badge variant="secondary" className="text-xs">
                              Avulso
                            </Badge>
                          )}
                        </div>
                        {collaborator.email && (
                          <div className="text-sm text-muted-foreground">
                            {collaborator.email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatCPF(collaborator.cpf)}
                      </TableCell>
                      <TableCell>{collaborator.position || "-"}</TableCell>
                      <TableCell>{getStoreName(collaborator.store_id)}</TableCell>
                      <TableCell>{getTeamName(collaborator.team_id)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={collaborator.status === "ativo" ? "default" : "secondary"}
                          className={
                            collaborator.status === "ativo"
                              ? "bg-green-100 text-green-700 hover:bg-green-100"
                              : ""
                          }
                        >
                          {collaborator.status === "ativo" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(collaborator)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(collaborator)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Mostrando {page * pageSize + 1} a {Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </RoleGuard>
  );
};

export default ColaboradoresPage;
