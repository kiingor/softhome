import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsDeveloper } from "@/hooks/useIsDeveloper";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus, MagnifyingGlass as Search, Funnel as Filter, DotsThree as MoreHorizontal, Pencil as Edit, Trash as Trash2, Users, ArrowsClockwise as RefreshCw } from "@phosphor-icons/react";
import { useDashboard } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateCollaborator } from "@/hooks/useCollaboratorWriteBack";
import { SyncProgressDialog } from "@/components/dashboard/SyncProgressDialog";
import {
  clearSyncJobId,
  getSyncJobId,
  setSyncJobId as setSyncJobIdInStorage,
} from "@/lib/sync-job-storage";
import { useToast } from "@/hooks/use-toast";
import { formatCPF } from "@/lib/validators";
import { AGENDA_SYNC_DISABLED } from "@/lib/agenda-sync";
import CollaboratorModal from "@/modules/core/components/collaborators/CollaboratorModal";
import { TableSkeleton } from "@/components/ui/table-skeleton";

interface Collaborator {
  id: string;
  name: string;
  softcom_surname: string | null;
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

interface SyncResult {
  inserted: number;
  updated: number;
  deactivated: number;
  fetched: number;
  errors: Array<{ external_id: string; name: string; cpf: string | null; error: string }>;
  successes: Array<{ external_id: string; name: string; action: "inserted" | "updated" }>;
  financials?: {
    processed: number;
    salaryCreated: number;
    salaryUpdated: number;
    inssGenerated?: number;
    irpfGenerated?: number;
    fgtsGenerated?: number;
    payrollUpserted: number;
    assignmentsUpserted: number;
    benefitsCreated: number;
    errors: number;
    errorDetails?: Array<{ collaboratorName: string; external_id: string; tipo: string; error: string }>;
  } | null;
  details?: {
    processed: number;
    totals: Record<string, number>;
    errors: number;
    errorDetails?: Array<{ collaboratorName: string; kind: string; error: string }>;
  } | null;
}

const ColaboradoresPage = () => {
  const { currentCompany } = useDashboard();
  const updateCollaborator = useUpdateCollaborator();
  const { toast } = useToast();
  const { canCreate, canEdit, canDelete, isAdmin } = usePermissions("colaboradores");
  // Cadastro manual de colaborador é controle de dev: fluxo padrão é via sync da agenda.
  const isDeveloper = useIsDeveloper();

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Sync com agenda Softcom Cloud
  const [isSyncing, setIsSyncing] = useState(false);
  // Job de sincronização em andamento — controla o modal de progresso
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [syncProgressOpen, setSyncProgressOpen] = useState(false);
  const [isSyncConfirmOpen, setIsSyncConfirmOpen] = useState(false);
  // 'full'       = sync completa (colab + financials + detalhes)
  // 'onlySalary' = só puxa salário/encargos dos colabs que ainda não têm
  //                salário-base lançado (não toca em exames/planos/detalhes)
  const [syncMode, setSyncMode] = useState<"full" | "onlySalary">("full");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  // Sincronização com a agenda desligada por enquanto (ver @/lib/agenda-sync).
  const canSync = (canCreate || isAdmin) && !AGENDA_SYNC_DISABLED;

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      // Status via edge function — PUSH pra agenda também
      await updateCollaborator.mutateAsync({
        collaboratorId: collaborator.id,
        section: "status",
        data: { status: "aguardando_documentacao" },
      });

      toast({ title: "Documentação reenviada ✓", description: `${collaborator.name} pode iniciar o primeiro acesso novamente.` });
      loadCollaborators();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSync = async () => {
    if (!currentCompany?.id) return;
    // Se já existe um job em andamento, só reabre o modal (não dispara outro)
    if (syncJobId) {
      setSyncProgressOpen(true);
      return;
    }
    setIsSyncing(true);
    try {
      const body: Record<string, unknown> = {
        companyId: currentCompany.id,
        includeFinancials: true,
        // 'onlySalary' não mexe em exames/planos/dependentes — ajustes manuais
        // ficam preservados. Também filtra pra só os colabs que ainda não têm
        // salário-base lançado, pra evitar re-processar quem já está OK.
        includeDetails: syncMode === "full",
        onlyMissingFinancials: syncMode === "onlySalary",
      };
      const { data, error } = await supabase.functions.invoke('sync-collaborators', {
        body,
      });
      if (error) throw error;
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg) throw new Error(errMsg);
      // Edge function agora retorna { jobId } imediato — trabalho real roda em background
      const jobId = (data as { jobId?: string })?.jobId;
      if (!jobId) {
        throw new Error('Edge function não retornou jobId');
      }
      setSyncJobId(jobId);
      // Persiste o jobId pra reabrir modal automaticamente se o user fechar e voltar
      setSyncJobIdInStorage(currentCompany.id, "collaborators", jobId);
      setSyncProgressOpen(true);
    } catch (err) {
      toast({
        title: 'Não foi possível sincronizar agora',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Ao montar (ou trocar de empresa): checa se há job de sync em andamento
  // pra esta company. Se sim, reabre o modal automaticamente. Isso resolve
  // o caso "fechei o modal e não consigo reabrir pra acompanhar".
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentCompany?.id) return;
    const stored = getSyncJobId(currentCompany.id, "collaborators");
    if (!stored) return;
    let cancelled = false;
    (async () => {
      // Cast: types.ts está desatualizado e não inclui sync_jobs ainda.
      // Tabela existe no schema (migration 20260522190000_create_sync_jobs.sql).
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{ data: { id: string; status: string } | null }>;
            };
          };
        };
      })
        .from("sync_jobs")
        .select("id, status")
        .eq("id", stored)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        // Job sumiu (apagado ou erro de RLS) — limpa storage
        clearSyncJobId(currentCompany.id, "collaborators");
        return;
      }
      if (data.status === "running" || data.status === "pending") {
        setSyncJobId(stored);
        setSyncProgressOpen(true);
      } else {
        // Terminal — limpa storage
        clearSyncJobId(currentCompany.id, "collaborators");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentCompany?.id]);

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
          {(canSync || isDeveloper) && (
            <div className="flex items-center gap-2">
              {canSync && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={isSyncing || !currentCompany?.id}
                      title="Importa colaboradores da agenda (api.softcom.cloud)"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem
                      onClick={() => {
                        setSyncMode("full");
                        setIsSyncConfirmOpen(true);
                      }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">Tudo</span>
                        <span className="text-xs text-muted-foreground">
                          Dados, financeiros e detalhes (exames, férias, planos).
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setSyncMode("onlySalary");
                        setIsSyncConfirmOpen(true);
                      }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">Só salários pendentes</span>
                        <span className="text-xs text-muted-foreground">
                          Puxa salário e encargos só de quem tá zerado. Não toca em exames/planos/detalhes.
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* Cadastro manual é controle de dev (cadastro padrão vem do sync). */}
              {isDeveloper && (
                <Button variant="hero" onClick={handleNewCollaborator}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Novo Colaborador
                </Button>
              )}
            </div>
          )}
        </div>

        <AlertDialog open={isSyncConfirmOpen} onOpenChange={setIsSyncConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {syncMode === "onlySalary"
                  ? "Puxar só os salários pendentes?"
                  : "Sincronizar colaboradores com a agenda?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {syncMode === "onlySalary" ? (
                  <>
                    Vou rodar só nos colabs que ainda não têm salário-base lançado e atualizar o financeiro deles a partir da agenda. <strong>Não toco em exames, planos ou outros detalhes</strong> — seus ajustes manuais ficam preservados.
                    <br /><br />
                    Quem já tem salário não é re-processado. Pode continuar?
                  </>
                ) : (
                  <>
                    Vou importar todos os colaboradores que estão em <strong>api.softcom.cloud</strong> e marcar como inativos os que sumirem de lá. Colaboradores criados manualmente aqui não são tocados.
                    <br /><br />
                    Sincronize <strong>Empresas</strong>, <strong>Setores</strong> e <strong>Cargos</strong> primeiro pra que os vínculos venham corretos. Pode continuar?
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleSync}>
                {syncMode === "onlySalary" ? "Puxar salários agora" : "Sincronizar agora"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!syncResult} onOpenChange={(open) => !open && setSyncResult(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Resultado da sincronização</DialogTitle>
              <DialogDescription>
                {syncResult?.fetched ?? 0} colaborador{(syncResult?.fetched ?? 0) !== 1 ? 'es' : ''} processado{(syncResult?.fetched ?? 0) !== 1 ? 's' : ''} da agenda (api.softcom.cloud).
              </DialogDescription>
            </DialogHeader>

            {syncResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Novos</div>
                    <div className="text-2xl font-bold text-emerald-600">{syncResult.inserted}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Atualizados</div>
                    <div className="text-2xl font-bold text-blue-600">{syncResult.updated}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Desativados</div>
                    <div className="text-2xl font-bold text-amber-600">{syncResult.deactivated}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Com erro</div>
                    <div className="text-2xl font-bold text-rose-600">{syncResult.errors.length}</div>
                  </div>
                </div>

                {syncResult.financials && (
                  <div className="rounded-lg border p-3 bg-muted/30 space-y-3">
                    <div>
                      <div className="font-medium mb-2">Financeiro aplicado</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Colabs processados:</span>{" "}
                          <strong>{syncResult.financials.processed}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Salários (criados/atualizados):</span>{" "}
                          <strong>{syncResult.financials.salaryCreated}/{syncResult.financials.salaryUpdated}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Lançamentos folha:</span>{" "}
                          <strong>{syncResult.financials.payrollUpserted}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">INSS gerado:</span>{" "}
                          <strong>{syncResult.financials.inssGenerated ?? 0}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">IRPF gerado:</span>{" "}
                          <strong>{syncResult.financials.irpfGenerated ?? 0}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">FGTS gerado:</span>{" "}
                          <strong>{syncResult.financials.fgtsGenerated ?? 0}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Benefícios criados no catálogo:</span>{" "}
                          <strong>{syncResult.financials.benefitsCreated}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Atribuições de benefício:</span>{" "}
                          <strong>{syncResult.financials.assignmentsUpserted}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Erros financeiros:</span>{" "}
                          <strong className={syncResult.financials.errors > 0 ? "text-rose-600" : ""}>{syncResult.financials.errors}</strong>
                        </div>
                      </div>
                    </div>

                    {syncResult.financials.errorDetails && syncResult.financials.errorDetails.length > 0 && (
                      <details open className="rounded border bg-rose-50 dark:bg-rose-950/30">
                        <summary className="cursor-pointer p-2 font-medium text-sm select-none">
                          Erros financeiros ({syncResult.financials.errorDetails.length})
                        </summary>
                        <div className="divide-y text-xs">
                          {syncResult.financials.errorDetails.map((e, idx) => (
                            <div key={idx} className="p-2">
                              <div className="font-medium">{e.collaboratorName} <span className="text-muted-foreground">· {e.tipo}</span></div>
                              <div className="text-rose-600">{e.error}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {syncResult.details && (
                  <div className="rounded-lg border p-3 bg-muted/30 space-y-3">
                    <div>
                      <div className="font-medium mb-2">Detalhes das sub-abas (afastamentos, férias, planos, PDV...)</div>
                      <div className="text-sm text-muted-foreground mb-2">
                        {syncResult.details.processed} colaborador(es) processado(s)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                        {Object.entries(syncResult.details.totals).map(([kind, total]) => (
                          <div key={kind}>
                            <span className="text-muted-foreground capitalize">
                              {kind === "healthPlans" ? "Planos" :
                               kind === "healthPlanDeductions" ? "Descontos plano (folha)" :
                               kind === "timelineEvents" ? "Eventos (histórico)" :
                               kind === "absences" ? "Absenteísmo" :
                               kind === "leaves" ? "Afastamentos" :
                               kind === "vacations" ? "Férias" :
                               kind === "exams" ? "Exames" :
                               kind === "internships" ? "Estágios" :
                               kind === "emails" ? "E-mails" :
                               kind === "pdvs" ? "PDVs" : kind}:
                            </span>{" "}
                            <strong>{total}</strong>
                          </div>
                        ))}
                      </div>
                    </div>

                    {syncResult.details.errorDetails && syncResult.details.errorDetails.length > 0 && (
                      <details open className="rounded border bg-rose-50 dark:bg-rose-950/30">
                        <summary className="cursor-pointer p-2 font-medium text-sm select-none">
                          Erros nos detalhes ({syncResult.details.errorDetails.length})
                        </summary>
                        <div className="divide-y text-xs">
                          {syncResult.details.errorDetails.map((e, idx) => (
                            <div key={idx} className="p-2">
                              <div className="font-medium">{e.collaboratorName} <span className="text-muted-foreground">· {e.kind}</span></div>
                              <div className="text-rose-600">{e.error}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {syncResult.errors.length > 0 && (
                  <details open className="rounded-lg border">
                    <summary className="cursor-pointer p-3 font-medium select-none bg-rose-50 dark:bg-rose-950/30 rounded-t-lg">
                      Erros ({syncResult.errors.length})
                    </summary>
                    <div className="divide-y">
                      {syncResult.errors.map((e) => (
                        <div key={e.external_id} className="p-3 text-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-medium">{e.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ID na agenda: {e.external_id}
                              {e.cpf ? ` · CPF: ${e.cpf}` : ''}
                            </span>
                          </div>
                          <div className="text-rose-600 text-xs">{e.error}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {syncResult.successes.length > 0 && (
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer p-3 font-medium select-none bg-emerald-50 dark:bg-emerald-950/30 rounded-t-lg">
                      Sincronizados com sucesso ({syncResult.successes.length})
                    </summary>
                    <div className="divide-y max-h-64 overflow-y-auto">
                      {syncResult.successes.map((s) => (
                        <div key={s.external_id} className="p-2 text-sm flex items-center justify-between gap-2">
                          <span>{s.name}</span>
                          <span className="text-xs">
                            <span className={s.action === 'inserted' ? 'text-emerald-600' : 'text-blue-600'}>
                              {s.action === 'inserted' ? 'novo' : 'atualizado'}
                            </span>
                            <span className="text-muted-foreground ml-2">#{s.external_id}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setSyncResult(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              {!searchTerm && statusFilter === "all" && storeFilter === "all" && teamFilter === "all" && isDeveloper && (
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
                          {/* Linha 1 (destaque): apelido Softcom — se tiver.
                              Fallback pro nome completo capitalizado quando não tem.
                              Linha 2 (secundária): nome completo, sempre. */}
                          <div className="flex items-center gap-2">
                            <span
                              className="font-medium text-sm capitalize truncate"
                              title={collaborator.softcom_surname ?? collaborator.name}
                            >
                              {(collaborator.softcom_surname ?? collaborator.name).toLowerCase()}
                            </span>
                            {collaborator.is_temp && (
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                                Avulso
                              </Badge>
                            )}
                          </div>
                          {collaborator.softcom_surname && (
                            <div
                              className="text-xs text-muted-foreground truncate capitalize"
                              title={collaborator.name}
                            >
                              {collaborator.name.toLowerCase()}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                          {collaborator.cpf ? formatCPF(collaborator.cpf) : "—"}
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
                                  {/* Excluir DESATIVADO. Use "Desativar" no modal do colab.
                                      Preserva histórico (folha, férias, 13º) e sincroniza com a agenda. */}
                                  <DropdownMenuItem
                                    disabled
                                    className="text-muted-foreground"
                                    title="Não é possível excluir. Abra o colaborador e clique em Desativar."
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir (indisponível)
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

        {/* Modal de progresso da sincronização (fire-and-poll: edge function
            roda em background, modal polla sync_jobs a cada 1.2s). */}
        <SyncProgressDialog
          open={syncProgressOpen}
          onOpenChange={(o) => {
            setSyncProgressOpen(o);
            // Quando fecha, limpa o jobId se já terminou (libera próximo Sincronizar)
            if (!o) {
              setSyncJobId((current) => current); // mantém ref pra histórico
            }
          }}
          jobId={syncJobId}
          onFinished={(job) => {
            if (job.status === "completed") {
              toast({
                title: "Sincronização concluída ✓",
                description: `${job.inserted} novos · ${job.updated} atualizados · ${job.deactivated} desativados${job.errors.length ? ` · ${job.errors.length} erros` : ""}`,
              });
            } else if (job.status === "failed") {
              toast({
                title: "Sincronização falhou",
                description: job.error_message ?? "Erro desconhecido",
                variant: "destructive",
              });
            }
            // Limpa jobId pra permitir nova sync no próximo clique
            setSyncJobId(null);
            loadCollaborators();
          }}
        />
      </div>
    </PermissionGuard>
  );
};

export default ColaboradoresPage;
