import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { usePermissions } from "@/hooks/usePermissions";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, MagnifyingGlass as Search, Funnel as Filter, DotsThree as MoreHorizontal, Pencil as Edit, Trash as Trash2, Users, ArrowsClockwise as RefreshCw, UploadSimple } from "@phosphor-icons/react";
import { useDashboard } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCPF } from "@/lib/validators";
import CollaboratorModal from "@/modules/core/components/collaborators/CollaboratorModal";
import { CollaboratorsImportDialog } from "@/modules/core/components/collaborators/import/CollaboratorsImportDialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";

interface Collaborator {
  id: string;
  name: string;
  cpf: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  position_id: string | null;
  status: "ativo" | "inativo" | "aguardando_documentacao" | "validacao_pendente" | "reprovado";
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

interface Position {
  id: string;
  name: string;
}

const ColaboradoresPage = () => {
  const { currentCompany } = useDashboard();
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete, isAdmin } = usePermissions("colaboradores");

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Deep-link via ?openId=<uuid> (usado pelo GlobalSearch e outros lugares)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("openId");
    if (openId) {
      setEditingId(openId);
      setModalOpen(true);
      // Limpa o param pra não reabrir o modal ao fechar
      const next = new URLSearchParams(searchParams);
      next.delete("openId");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<Collaborator | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    await Promise.all([loadCollaborators(), loadTeams(), loadStores(), loadPositions()]);
  };

  const loadCollaborators = async () => {
    if (!currentCompany) return;

    // Only show loading skeleton on first load
    if (!hasLoadedOnce) {
      setIsLoading(true);
    }
    
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
        query = query.eq("status", statusFilter as "ativo" | "inativo" | "aguardando_documentacao" | "validacao_pendente" | "reprovado");
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
      setHasLoadedOnce(true);
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

  const loadPositions = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from("positions")
        .select("id, name")
        .eq("company_id", currentCompany.id)
        .order("name");

      if (error) throw error;
      setPositions(data || []);
    } catch (error) {
      console.error("Error loading positions:", error);
    }
  };

  const handleNewCollaborator = () => {
    setEditingId(null);
    setModalOpen(true);
  };

  const handleEdit = (collaborator: Collaborator) => {
    setEditingId(collaborator.id);
    setModalOpen(true);
  };

  const handleModalSuccess = () => {
    loadCollaborators();
  };

  const handleDelete = (collaborator: Collaborator) => {
    setCollaboratorToDelete(collaborator);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!collaboratorToDelete) return;

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        deletedAuthUser?: boolean;
        error?: string;
      }>("delete-collaborator", {
        body: { collaboratorId: collaboratorToDelete.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Colaborador excluído",
        description: data?.deletedAuthUser
          ? `${collaboratorToDelete.name} foi removido (login também desativado).`
          : `${collaboratorToDelete.name} foi removido.`,
      });

      loadCollaborators();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setCollaboratorToDelete(null);
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

  const getPositionName = (collaborator: Collaborator) => {
    if (collaborator.position_id) {
      const match = positions.find((p) => p.id === collaborator.position_id);
      if (match) return match.name;
    }
    return collaborator.position || "-";
  };

  const handleReenviarDocumentacao = async (collaborator: Collaborator) => {
    if (!confirm(`Reenviar documentação de ${collaborator.name}? Isso vai resetar o processo de onboarding.`)) return;
    try {
      // Delete onboarding session and documents
      const { data: session } = await supabase
        .from("onboarding_sessions")
        .select("id")
        .eq("collaborator_id", collaborator.id)
        .maybeSingle();

      if (session) {
        await supabase.from("onboarding_errors").delete().eq("onboarding_session_id", session.id);
        await supabase.from("onboarding_sessions").delete().eq("id", session.id);
      }
      await supabase.from("collaborator_documents").delete().eq("collaborator_id", collaborator.id);
      await supabase.from("collaborators").update({ status: "aguardando_documentacao" }).eq("id", collaborator.id);
      
      toast({ title: "Documentação reenviada", description: `${collaborator.name} pode iniciar o primeiro acesso novamente.` });
      loadCollaborators();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <PermissionGuard module="colaboradores">
      <div className="space-y-6 page-content">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
            <p className="text-muted-foreground">
              {totalCount} colaborador{totalCount !== 1 ? "es" : ""} cadastrado{totalCount !== 1 ? "s" : ""}
            </p>
          </div>
          {(canCreate || isAdmin) && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <UploadSimple className="w-4 h-4 mr-2" />
                Importar
              </Button>
              <Button variant="hero" onClick={handleNewCollaborator}>
                <UserPlus className="w-4 h-4 mr-2" />
                Novo Colaborador
              </Button>
            </div>
          )}
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
                      <SelectItem value="aguardando_documentacao">Aguardando Documentação</SelectItem>
                      <SelectItem value="validacao_pendente">Validação Pendente</SelectItem>
                      <SelectItem value="reprovado">Reprovado</SelectItem>
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
          <Card className="border border-border animate-scale-in">
            <CardContent className="p-4">
              <TableSkeleton columns={7} rows={6} />
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
                <Button variant="hero" onClick={handleNewCollaborator}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Cadastrar Colaborador
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-border overflow-hidden animate-scale-in">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-[140px]">CPF</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead className="hidden md:table-cell">Empresa</TableHead>
                    <TableHead className="hidden lg:table-cell">Setor</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="stagger-animation">
                  {collaborators.map((collaborator) => {
                    const statusConfig: Record<string, { label: string; className: string }> = {
                      ativo: { label: "Ativo", className: "bg-green-100 text-green-700 hover:bg-green-100" },
                      inativo: { label: "Inativo", className: "bg-muted text-muted-foreground" },
                      aguardando_documentacao: { label: "Aguardando Docs", className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
                      validacao_pendente: { label: "Validação Pendente", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
                      reprovado: { label: "Reprovado", className: "bg-red-100 text-red-700 hover:bg-red-100" },
                    };
                    const sc = statusConfig[collaborator.status] || statusConfig.inativo;

                    return (
                      <TableRow
                        key={collaborator.id}
                        className="table-row-animate cursor-pointer hover:bg-muted/50"
                        onClick={() => handleEdit(collaborator)}
                      >
                        <TableCell className="max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-medium text-sm capitalize truncate"
                              title={collaborator.name}
                            >
                              {collaborator.name.toLowerCase()}
                            </span>
                            {collaborator.is_temp && (
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                                Avulso
                              </Badge>
                            )}
                          </div>
                          {collaborator.email && (
                            <div
                              className="text-xs text-muted-foreground truncate"
                              title={collaborator.email}
                            >
                              {collaborator.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                          {formatCPF(collaborator.cpf)}
                        </TableCell>
                        <TableCell className="text-sm max-w-[220px]">
                          <span className="truncate block" title={getPositionName(collaborator)}>
                            {getPositionName(collaborator)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm hidden md:table-cell max-w-[160px]">
                          <span className="truncate block" title={getStoreName(collaborator.store_id)}>
                            {getStoreName(collaborator.store_id)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm hidden lg:table-cell max-w-[160px]">
                          <span className="truncate block" title={getTeamName(collaborator.team_id)}>
                            {getTeamName(collaborator.team_id)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`${sc.className} text-[11px] font-normal h-5 px-2`}
                          >
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {collaborator.status === "reprovado" && (canEdit || isAdmin) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReenviarDocumentacao(collaborator);
                                }}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Reenviar
                              </Button>
                            )}
                            {(canDelete || isAdmin) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(collaborator)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

        {/* Collaborator Modal */}
        <CollaboratorModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          collaboratorId={editingId}
          onSuccess={handleModalSuccess}
        />

        {/* Importação em massa */}
        {currentCompany && (
          <CollaboratorsImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            companyId={currentCompany.id}
            onImportFinished={() => loadCollaborators()}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir colaborador</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir <strong>{collaboratorToDelete?.name}</strong>?
                Esta ação não pode ser desfeita e todos os dados relacionados serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGuard>
  );
};

export default ColaboradoresPage;
