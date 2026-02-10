import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { useExams, type OccupationalExam } from "@/hooks/useExams";
import { EXAM_TYPE_LABELS, EXAM_STATUS_LABELS, EXAM_STATUS_COLORS } from "@/lib/riskGroupDefaults";
import { exportExamsToPDF, exportExamsToExcel } from "@/lib/examExportUtils";
import { ExamRequestModal } from "@/components/exames/ExamRequestModal";
import { ExamUploadModal } from "@/components/exames/ExamUploadModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  ClipboardCheck,
  Plus,
  FileDown,
  Printer,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Upload,
  MoreHorizontal,
  XCircle,
} from "lucide-react";
import { format, isWithinInterval, parseISO, addDays, isBefore } from "date-fns";

export default function ExamesPage() {
  const { currentCompany } = useDashboard();
  const { exams, isLoading, updateExam } = useExams();

  const [newExamOpen, setNewExamOpen] = useState(false);
  const [uploadExam, setUploadExam] = useState<OccupationalExam | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Check if exam has documents
  const { data: examDocCounts = {} } = useQuery({
    queryKey: ["exam-doc-counts", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return {};
      const { data, error } = await supabase
        .from("exam_documents")
        .select("exam_id")
        .eq("company_id", currentCompany.id);
      if (error) return {};
      const counts: Record<string, boolean> = {};
      data.forEach((d) => { counts[d.exam_id] = true; });
      return counts;
    },
    enabled: !!currentCompany?.id,
  });

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (searchTerm && !exam.collaborator?.name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (statusFilter !== "all" && exam.status !== statusFilter) return false;
      if (typeFilter !== "all" && exam.exam_type !== typeFilter) return false;
      if (dateFrom) {
        const from = parseISO(dateFrom);
        const examDate = parseISO(exam.due_date);
        if (isBefore(examDate, from)) return false;
      }
      if (dateTo) {
        const to = addDays(parseISO(dateTo), 1);
        const examDate = parseISO(exam.due_date);
        if (!isBefore(examDate, to)) return false;
      }
      return true;
    });
  }, [exams, searchTerm, statusFilter, typeFilter, dateFrom, dateTo]);

  // Summary cards
  const today = new Date();
  const in30Days = addDays(today, 30);
  const pendingCount = exams.filter((e) => e.status === "pendente").length;
  const overdueCount = exams.filter((e) => e.status !== "realizado" && e.status !== "cancelado" && isBefore(parseISO(e.due_date), today)).length;
  const next30Count = exams.filter((e) => {
    if (e.status === "realizado" || e.status === "cancelado") return false;
    const d = parseISO(e.due_date);
    return !isBefore(d, today) && isBefore(d, in30Days);
  }).length;
  const doneThisMonth = exams.filter((e) => {
    if (e.status !== "realizado" || !e.completed_date) return false;
    const d = parseISO(e.completed_date);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;

  const handleExport = (type: "pdf" | "excel" | "print") => {
    const entries = filteredExams.map((e) => ({
      collaborator_name: e.collaborator?.name || "-",
      exam_type: e.exam_type,
      status: e.status,
      risk_group: e.risk_group_at_time,
      due_date: e.due_date,
      scheduled_date: e.scheduled_date,
      completed_date: e.completed_date,
      has_aso: !!examDocCounts[e.id],
    }));

    const data = {
      companyName: currentCompany?.company_name || "",
      entries,
    };

    if (type === "pdf" || type === "print") exportExamsToPDF(data);
    else exportExamsToExcel(data);
  };

  return (
    <PermissionGuard module="exames">
      <div className="space-y-6 page-content">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Exames Ocupacionais</h1>
            <p className="text-muted-foreground">Controle de exames ASO e vencimentos</p>
          </div>
          <Button onClick={() => setNewExamOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Exame Avulso
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100"><Clock className="w-5 h-5 text-amber-600" /></div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">Vencidos</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100"><Calendar className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{next30Count}</p>
                <p className="text-xs text-muted-foreground">Próx. 30 dias</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100"><CheckCircle className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{doneThisMonth}</p>
                <p className="text-xs text-muted-foreground">Realizados (mês)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="todos">
          <TabsList>
            <TabsTrigger value="todos">Todos os Exames</TabsTrigger>
            <TabsTrigger value="vencimentos">Vencimentos</TabsTrigger>
          </TabsList>

          <TabsContent value="todos" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar colaborador..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="realizado">Realizado</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="admissional">Admissional</SelectItem>
                      <SelectItem value="periodico">Periódico</SelectItem>
                      <SelectItem value="mudanca_funcao">Mudança de Função</SelectItem>
                      <SelectItem value="retorno_trabalho">Retorno ao Trabalho</SelectItem>
                      <SelectItem value="demissional">Demissional</SelectItem>
                      <SelectItem value="avulso">Avulso</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="date" className="w-[140px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <Input type="date" className="w-[140px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" onClick={() => handleExport("pdf")} title="Exportar PDF">
                      <FileDown className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleExport("excel")} title="Exportar Excel">
                      <FileDown className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleExport("print")} title="Imprimir">
                      <Printer className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4"><TableSkeleton columns={7} rows={5} /></div>
                ) : filteredExams.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum exame encontrado</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Grupo Risco</TableHead>
                        <TableHead>Data Limite</TableHead>
                        <TableHead>Realizado</TableHead>
                        <TableHead>ASO</TableHead>
                        <TableHead className="w-[60px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExams.map((exam) => {
                        const isOverdue = !["realizado", "cancelado"].includes(exam.status) && isBefore(parseISO(exam.due_date), today);
                        return (
                          <TableRow key={exam.id} className={isOverdue ? "bg-red-50/50" : ""}>
                            <TableCell className="font-medium">{exam.collaborator?.name || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={isOverdue ? "destructive" : EXAM_STATUS_COLORS[exam.status]} className="text-xs">
                                {isOverdue ? "Vencido" : (EXAM_STATUS_LABELS[exam.status] || exam.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{exam.risk_group_at_time || "-"}</TableCell>
                            <TableCell>{format(parseISO(exam.due_date), "dd/MM/yyyy")}</TableCell>
                            <TableCell>{exam.completed_date ? format(parseISO(exam.completed_date), "dd/MM/yyyy") : "-"}</TableCell>
                            <TableCell>
                              {examDocCounts[exam.id] ? (
                                <Badge variant="outline" className="text-xs text-green-600"><CheckCircle className="w-3 h-3 mr-1" />Sim</Badge>
                              ) : "-"}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {exam.status === "pendente" && (
                                    <DropdownMenuItem onClick={() => {
                                      const date = prompt("Data agendada (AAAA-MM-DD):");
                                      if (date) updateExam({ id: exam.id, status: "agendado", scheduled_date: date });
                                    }}>
                                      <Calendar className="w-4 h-4 mr-2" />Agendar
                                    </DropdownMenuItem>
                                  )}
                                  {["pendente", "agendado"].includes(exam.status) && (
                                    <DropdownMenuItem onClick={() => {
                                      const date = prompt("Data de realização (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
                                      if (date) updateExam({ id: exam.id, status: "realizado", completed_date: date });
                                    }}>
                                      <CheckCircle className="w-4 h-4 mr-2" />Marcar Realizado
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => setUploadExam(exam)}>
                                    <Upload className="w-4 h-4 mr-2" />Enviar ASO
                                  </DropdownMenuItem>
                                  {exam.status !== "cancelado" && exam.status !== "realizado" && (
                                    <DropdownMenuItem onClick={() => updateExam({ id: exam.id, status: "cancelado" })} className="text-destructive">
                                      <XCircle className="w-4 h-4 mr-2" />Cancelar
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vencimentos" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                {(() => {
                  const urgentExams = exams
                    .filter((e) => !["realizado", "cancelado"].includes(e.status))
                    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

                  if (urgentExams.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum exame pendente</p>
                      </div>
                    );
                  }

                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Colaborador</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Data Limite</TableHead>
                          <TableHead>Urgência</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {urgentExams.map((exam) => {
                          const dueDate = parseISO(exam.due_date);
                          const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          let urgencyBadge;
                          if (daysLeft < 0) urgencyBadge = <Badge variant="destructive">Vencido ({Math.abs(daysLeft)}d)</Badge>;
                          else if (daysLeft <= 7) urgencyBadge = <Badge variant="destructive">Urgente ({daysLeft}d)</Badge>;
                          else if (daysLeft <= 30) urgencyBadge = <Badge variant="secondary">Próximo ({daysLeft}d)</Badge>;
                          else urgencyBadge = <Badge variant="outline">{daysLeft} dias</Badge>;

                          return (
                            <TableRow key={exam.id}>
                              <TableCell className="font-medium">{exam.collaborator?.name || "-"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type}
                                </Badge>
                              </TableCell>
                              <TableCell>{format(dueDate, "dd/MM/yyyy")}</TableCell>
                              <TableCell>{urgencyBadge}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ExamRequestModal open={newExamOpen} onOpenChange={setNewExamOpen} />
        <ExamUploadModal open={!!uploadExam} onOpenChange={(o) => !o && setUploadExam(null)} exam={uploadExam} />
      </div>
    </PermissionGuard>
  );
}
