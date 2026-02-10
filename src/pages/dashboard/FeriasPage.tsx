import { useState, useMemo } from "react";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { useDashboard } from "@/contexts/DashboardContext";
import { useVacationRequests, useVacationPeriods, useUpdateVacationRequest, useDeleteVacationRequest, vacationRequestStatusLabels, vacationRequestStatusColors, vacationPeriodStatusLabels, vacationPeriodStatusColors, VacationRequest } from "@/hooks/useVacations";
import VacationRequestModal from "@/components/ferias/VacationRequestModal";
import VacationCalendar from "@/components/ferias/VacationCalendar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Clock, Users, CalendarCheck, AlertTriangle, Search, Check, X, Loader2, Calendar, Trash2, Eye } from "lucide-react";
import { format, parseISO, isAfter, addDays } from "date-fns";
import { toast } from "sonner";

const FeriasPage = () => {
  const { hasAnyRole, user } = useDashboard();
  const canManage = hasAnyRole(["admin", "rh", "gestor"]);

  const { data: requests = [], isLoading: loadingRequests } = useVacationRequests();
  const { data: periods = [], isLoading: loadingPeriods } = useVacationPeriods();
  const updateRequest = useUpdateVacationRequest();
  const deleteRequest = useDeleteVacationRequest();

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodStatusFilter, setPeriodStatusFilter] = useState("all");
  const [rejectingRequest, setRejectingRequest] = useState<VacationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [deletingRequest, setDeletingRequest] = useState<VacationRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<VacationRequest | null>(null);

  // Summary cards
  const pendingCount = useMemo(() => requests.filter(r => r.status === "pending").length, [requests]);
  const inProgressCount = useMemo(() => requests.filter(r => r.status === "in_progress").length, [requests]);
  const approvedCount = useMemo(() => requests.filter(r => r.status === "approved").length, [requests]);
  const expiringPeriods = useMemo(() => {
    const in60Days = addDays(new Date(), 60);
    return periods.filter(p => {
      if (p.status !== "available" && p.status !== "partially_used") return false;
      const concessiveEnd = addDays(parseISO(p.end_date), 365);
      return concessiveEnd <= in60Days;
    }).length;
  }, [periods]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchSearch = !searchTerm || r.collaborator?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [requests, searchTerm, statusFilter]);

  // Filtered periods
  const filteredPeriods = useMemo(() => {
    return periods.filter(p => {
      const matchSearch = !searchTerm || p.collaborator?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = periodStatusFilter === "all" || p.status === periodStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [periods, searchTerm, periodStatusFilter]);

  const handleApprove = async (request: VacationRequest) => {
    await updateRequest.mutateAsync({
      id: request.id,
      status: "approved",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    });
    toast.success("Férias aprovadas!");
  };

  const handleReject = async () => {
    if (!rejectingRequest || !rejectionReason.trim()) return;
    await updateRequest.mutateAsync({
      id: rejectingRequest.id,
      status: "rejected",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      rejection_reason: rejectionReason,
    });
    setRejectingRequest(null);
    setRejectionReason("");
    toast.success("Solicitação rejeitada.");
  };

  const handleComplete = async (request: VacationRequest) => {
    await updateRequest.mutateAsync({ id: request.id, status: "completed" });
    toast.success("Férias concluídas!");
  };

  const handleStartVacation = async (request: VacationRequest) => {
    await updateRequest.mutateAsync({ id: request.id, status: "in_progress" });
    toast.success("Férias iniciadas!");
  };

  const isLoading = loadingRequests || loadingPeriods;

  return (
    <PermissionGuard module="ferias">
      <div className="space-y-6 page-content">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Férias e Ausências</h1>
            <p className="text-muted-foreground">
              {canManage ? "Gerencie solicitações de férias dos colaboradores" : "Acompanhe suas férias e ausências"}
            </p>
          </div>
          <Button variant="hero" onClick={() => setRequestModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {canManage ? "Nova Solicitação" : "Solicitar Férias"}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inProgressCount}</p>
                <p className="text-xs text-muted-foreground">Em Gozo</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <CalendarCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">Agendadas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{expiringPeriods}</p>
                <p className="text-xs text-muted-foreground">Vencendo</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="requests" className="space-y-4">
          <TabsList>
            <TabsTrigger value="requests">Solicitações</TabsTrigger>
            <TabsTrigger value="periods">Períodos Aquisitivos</TabsTrigger>
            <TabsTrigger value="calendar">Calendário</TabsTrigger>
          </TabsList>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar colaborador..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="approved">Aprovada</SelectItem>
                  <SelectItem value="in_progress">Em Gozo</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="rejected">Rejeitada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              {isLoading ? (
                <CardContent className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </CardContent>
              ) : filteredRequests.length === 0 ? (
                <CardContent className="p-12 text-center">
                  <Calendar className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma solicitação encontrada.</p>
                </CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead className="text-center">Dias</TableHead>
                      <TableHead className="text-center">Abono</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="stagger-animation">
                    {filteredRequests.map(r => (
                      <TableRow key={r.id} className="table-row-animate">
                        <TableCell className="font-medium">{r.collaborator?.name || "—"}</TableCell>
                        <TableCell>{format(parseISO(r.start_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{format(parseISO(r.end_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-center">{r.days_count}</TableCell>
                        <TableCell className="text-center">{r.sell_days > 0 ? r.sell_days : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={vacationRequestStatusColors[r.status] || ""}>
                            {vacationRequestStatusLabels[r.status] || r.status}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingRequest(r)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              {r.status === "pending" && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => handleApprove(r)}>
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => { setRejectingRequest(r); setRejectionReason(""); }}>
                                    <X className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {r.status === "approved" && (
                                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleStartVacation(r)}>
                                  Iniciar
                                </Button>
                              )}
                              {r.status === "in_progress" && (
                                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleComplete(r)}>
                                  Concluir
                                </Button>
                              )}
                              {(r.status === "pending" || r.status === "approved") && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingRequest(r)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          {/* Periods Tab */}
          <TabsContent value="periods" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar colaborador..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={periodStatusFilter} onValueChange={setPeriodStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Adquirindo</SelectItem>
                  <SelectItem value="available">Disponível</SelectItem>
                  <SelectItem value="partially_used">Parcialmente Usado</SelectItem>
                  <SelectItem value="used">Utilizado</SelectItem>
                  <SelectItem value="expired">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              {isLoading ? (
                <CardContent className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </CardContent>
              ) : filteredPeriods.length === 0 ? (
                <CardContent className="p-12 text-center">
                  <Calendar className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhum período aquisitivo encontrado.</p>
                </CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Período Aquisitivo</TableHead>
                      <TableHead className="text-center">Direito</TableHead>
                      <TableHead className="text-center">Gozados</TableHead>
                      <TableHead className="text-center">Vendidos</TableHead>
                      <TableHead className="text-center">Saldo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="stagger-animation">
                    {filteredPeriods.map(p => (
                      <TableRow key={p.id} className="table-row-animate">
                        <TableCell className="font-medium">{p.collaborator?.name || "—"}</TableCell>
                        <TableCell>
                          {format(parseISO(p.start_date), "dd/MM/yyyy")} - {format(parseISO(p.end_date), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-center">{p.days_entitled}</TableCell>
                        <TableCell className="text-center">{p.days_taken}</TableCell>
                        <TableCell className="text-center">{p.days_sold}</TableCell>
                        <TableCell className="text-center font-bold">{p.days_remaining}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={vacationPeriodStatusColors[p.status] || ""}>
                            {vacationPeriodStatusLabels[p.status] || p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar">
            <VacationCalendar requests={requests} />
          </TabsContent>
        </Tabs>

        {/* Request Modal */}
        <VacationRequestModal open={requestModalOpen} onOpenChange={setRequestModalOpen} />

        {/* Reject Dialog */}
        <Dialog open={!!rejectingRequest} onOpenChange={() => setRejectingRequest(null)}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Rejeitar Solicitação</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Informe o motivo da rejeição para {rejectingRequest?.collaborator?.name}:
              </p>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Descreva o motivo..." rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRejectingRequest(null)}>Cancelar</Button>
                <Button variant="destructive" onClick={handleReject} disabled={!rejectionReason.trim() || updateRequest.isPending}>
                  Rejeitar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={!!deletingRequest} onOpenChange={() => setDeletingRequest(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar solicitação?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja cancelar a solicitação de férias de {deletingRequest?.collaborator?.name}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Não</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (deletingRequest) deleteRequest.mutate(deletingRequest.id); setDeletingRequest(null); }}>
                Sim, cancelar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* View Dialog */}
        <Dialog open={!!viewingRequest} onOpenChange={() => setViewingRequest(null)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Detalhes da Solicitação</DialogTitle>
            </DialogHeader>
            {viewingRequest && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground">Colaborador</p>
                    <p className="font-medium">{viewingRequest.collaborator?.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant="outline" className={vacationRequestStatusColors[viewingRequest.status]}>
                      {vacationRequestStatusLabels[viewingRequest.status]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Início</p>
                    <p className="font-medium">{format(parseISO(viewingRequest.start_date), "dd/MM/yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fim</p>
                    <p className="font-medium">{format(parseISO(viewingRequest.end_date), "dd/MM/yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Dias</p>
                    <p className="font-medium">{viewingRequest.days_count}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Abono Pecuniário</p>
                    <p className="font-medium">{viewingRequest.sell_days > 0 ? `${viewingRequest.sell_days} dias` : "Não"}</p>
                  </div>
                </div>
                {viewingRequest.notes && (
                  <div>
                    <p className="text-muted-foreground">Observações</p>
                    <p className="font-medium">{viewingRequest.notes}</p>
                  </div>
                )}
                {viewingRequest.rejection_reason && (
                  <div>
                    <p className="text-muted-foreground">Motivo da Rejeição</p>
                    <p className="font-medium text-destructive">{viewingRequest.rejection_reason}</p>
                  </div>
                )}
                {viewingRequest.approved_at && (
                  <div>
                    <p className="text-muted-foreground">Data da decisão</p>
                    <p className="font-medium">{format(parseISO(viewingRequest.approved_at), "dd/MM/yyyy HH:mm")}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
};

export default FeriasPage;
