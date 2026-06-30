import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  CircleNotch as Loader2,
  Copy,
  CheckCircle,
  Clock,
  Hourglass,
  Eye,
  CaretRight,
  WhatsappLogo,
  Phone,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  TestResultDialog,
  type TestResultData,
} from "@/modules/admission/components/TestResultDialog";
import {
  assignTests,
  buildApplicationTestUrl,
  listApplicationTests,
  listAvailableAdmissionTests,
  type ApplicationTest,
  type CompanyAdmissionTest,
} from "../services/application-tests.service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateId: string;
  companyId: string;
  candidateName: string;
  candidatePhone?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  not_started: "Aguardando candidato",
  in_progress: "Em andamento",
  completed: "Concluído",
  reviewed: "Revisado",
};

const isDone = (a: ApplicationTest) =>
  a.status === "completed" || a.status === "reviewed";

// Mesmos formatos pt-BR do TestResultDialog.
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

// Linha-resumo legível por tipo de teste (objetivo, DISC, etc).
function summaryLine(a: ApplicationTest): string {
  const s = (a.result_summary ?? {}) as {
    profile?: string;
    correct?: number;
    total?: number;
    objective?: { correct: number; total: number };
  };
  const parts: string[] = [];
  if (s.profile) parts.push(`Perfil ${s.profile}`);
  else if (typeof s.correct === "number" && typeof s.total === "number")
    parts.push(`${s.correct}/${s.total} corretas`);
  else if (s.objective)
    parts.push(`${s.objective.correct}/${s.objective.total} corretas`);
  if (a.auto_score != null) parts.push(`Score ${Number(a.auto_score).toFixed(0)}%`);
  if (a.completed_at) parts.push(`concluído ${fmtDateTime(a.completed_at)}`);
  return parts.join(" · ");
}

function pendingLine(a: ApplicationTest): string {
  if (a.status === "in_progress" && a.started_at)
    return `Começou ${fmtDateTime(a.started_at)}`;
  return `Atribuído ${fmtDate(a.assigned_at)}`;
}

export function AssignApplicationTestsDialog({
  open,
  onOpenChange,
  applicationId,
  candidateId,
  companyId,
  candidateName,
  candidatePhone,
}: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [viewing, setViewing] = useState<ApplicationTest | null>(null);
  const [showAssignMore, setShowAssignMore] = useState(false);

  const { data: assigned = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ["application-tests", applicationId],
    queryFn: () => listApplicationTests(applicationId),
    enabled: open && !!applicationId,
  });

  const { data: available = [], isLoading: loadingAvailable } = useQuery({
    queryKey: ["admission-tests", companyId],
    queryFn: () => listAvailableAdmissionTests(companyId),
    enabled: open && !!companyId,
  });

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setViewing(null);
      setShowAssignMore(false);
    }
  }, [open]);

  const assignedTestIds = new Set(assigned.map((a) => a.test_id));
  const notYetAssigned = available.filter((t) => !assignedTestIds.has(t.id));

  const done = assigned.filter(isDone);
  const pending = assigned.filter((a) => !isDone(a));
  const doneCount = done.length;
  const pendingCount = pending.length;

  const assign = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      const byId = new Map<string, CompanyAdmissionTest>(
        available.map((t) => [t.id, t]),
      );
      await assignTests(applicationId, candidateId, companyId, ids, byId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["application-tests", applicationId],
      });
      setSelected(new Set());
      toast.success("Testes atribuídos ✓");
    },
    onError: (err: Error) => toast.error("Não rolou. " + err.message),
  });

  const copyLink = async (token: string) => {
    const url = buildApplicationTestUrl(token);
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado ✓");
  };

  // Conta testes pendentes (não-completados) que serão enviados pelo WhatsApp.
  const pendingTestsCount = assigned.filter(
    (a) => a.status === "not_started" || a.status === "in_progress",
  ).length;

  const sendWhatsApp = async () => {
    if (!candidatePhone) {
      toast.error("Candidato sem telefone cadastrado.");
      return;
    }
    if (pendingTestsCount === 0) {
      toast.error("Sem testes pendentes para enviar.");
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        error?: string;
        tests_count?: number;
      }>("application-test-notify", {
        body: {
          application_id: applicationId,
          public_url_origin: window.location.origin,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(
        `WhatsApp enviado ✓ (${data?.tests_count ?? pendingTestsCount} teste${
          (data?.tests_count ?? pendingTestsCount) === 1 ? "" : "s"
        })`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error("Não rolou. " + (err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  // "Atribuir mais" abre inline na primeira atribuição (nenhum teste ainda).
  const assignMoreOpen = assigned.length === 0 || showAssignMore;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg !grid-rows-[auto_1fr_auto] max-h-[85vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b text-left">
            <DialogTitle>Testes do candidato</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              <span>{candidateName}</span>
              {candidatePhone && (
                <>
                  <span aria-hidden>·</span>
                  <Phone className="w-3 h-3" />
                  <span className="font-mono">{candidatePhone}</span>
                </>
              )}
            </DialogDescription>
            {assigned.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {doneCount} concluído{doneCount === 1 ? "" : "s"} · {pendingCount}{" "}
                aguardando
              </p>
            )}
          </DialogHeader>

          {/* corpo rolável */}
          <div className="overflow-y-auto px-6 py-4 space-y-6">
            {loadingAssigned ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Ainda não rolou nenhum teste. Bora atribuir o primeiro?
              </p>
            ) : (
              <>
                {done.length > 0 && (
                  <GroupSection
                    title="Concluídos"
                    count={`${doneCount} de ${assigned.length}`}
                  >
                    {done.map((a) => (
                      <AssignedRow
                        key={a.id}
                        a={a}
                        def={available.find((t) => t.id === a.test_id)}
                        onView={() => setViewing(a)}
                      />
                    ))}
                  </GroupSection>
                )}
                {pending.length > 0 && (
                  <GroupSection title="Aguardando">
                    {pending.map((a) => (
                      <AssignedRow
                        key={a.id}
                        a={a}
                        def={available.find((t) => t.id === a.test_id)}
                        onCopy={() => copyLink(a.access_token)}
                      />
                    ))}
                  </GroupSection>
                )}
              </>
            )}

            {/* Atribuir mais */}
            {notYetAssigned.length > 0 && (
              <Collapsible open={assignMoreOpen} onOpenChange={setShowAssignMore}>
                {assigned.length > 0 && (
                  <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                    <CaretRight
                      className={`w-3 h-3 transition-transform ${
                        assignMoreOpen ? "rotate-90" : ""
                      }`}
                    />
                    Atribuir mais ({notYetAssigned.length}{" "}
                    {notYetAssigned.length === 1 ? "disponível" : "disponíveis"})
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent className="space-y-1.5 pt-2 data-[state=closed]:pt-0">
                  {loadingAvailable ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    notYetAssigned.map((t) => {
                      const checked = selected.has(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-start gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(t.id);
                                else next.delete(t.id);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{t.name}</p>
                              {t.category && (
                                <Badge variant="outline" className="text-xs">
                                  {t.category}
                                </Badge>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-xs text-muted-foreground">
                                {t.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t flex-col sm:flex-row gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {notYetAssigned.length > 0 && (
                <Button
                  onClick={() => assign.mutate()}
                  disabled={selected.size === 0 || assign.isPending}
                  variant="outline"
                >
                  {assign.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Atribuir {selected.size > 0 ? `(${selected.size})` : ""}
                </Button>
              )}
              {pendingTestsCount > 0 && (
                <Button
                  onClick={sendWhatsApp}
                  disabled={isSending || !candidatePhone}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  title={
                    !candidatePhone
                      ? "Candidato sem telefone cadastrado"
                      : `Enviar ${pendingTestsCount} link${pendingTestsCount === 1 ? "" : "s"} via WhatsApp`
                  }
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <WhatsappLogo className="w-4 h-4 mr-2" />
                  )}
                  Enviar via WhatsApp
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visualizador de respostas — reaproveita o dialog da admissão */}
      <TestResultDialog
        open={!!viewing}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        journeyTest={
          viewing
            ? ({
                test_slug: viewing.test_slug,
                answers: viewing.answers,
                result_summary: viewing.result_summary,
                auto_score: viewing.auto_score,
                completed_at: viewing.completed_at,
                test: {
                  name: available.find((t) => t.id === viewing.test_id)?.name,
                },
              } satisfies TestResultData)
            : null
        }
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function GroupSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {count && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function AssignedRow({
  a,
  def,
  onView,
  onCopy,
}: {
  a: ApplicationTest;
  def?: CompanyAdmissionTest;
  onView?: () => void;
  onCopy?: () => void;
}) {
  const done = isDone(a);
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* linha 1: nome + badge de status */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight truncate min-w-0 flex-1 pt-0.5">
          {def?.name ?? a.test_slug}
        </p>
        {done ? (
          <Badge className="shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
            <CheckCircle className="w-3 h-3 mr-1" weight="fill" />
            {STATUS_LABELS[a.status]}
          </Badge>
        ) : a.status === "in_progress" ? (
          <Badge variant="outline" className="shrink-0">
            <Clock className="w-3 h-3 mr-1" />
            {STATUS_LABELS[a.status]}
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0">
            <Hourglass className="w-3 h-3 mr-1" />
            {STATUS_LABELS[a.status]}
          </Badge>
        )}
      </div>

      {/* linha 2: meta legível */}
      <p className="text-xs text-muted-foreground">
        {done ? summaryLine(a) : pendingLine(a)}
      </p>

      {/* linha 3: uma ação, alinhada à direita */}
      <div className="flex justify-end">
        {done ? (
          <Button size="sm" onClick={onView}>
            <Eye className="w-4 h-4 mr-1.5" />
            Ver respostas
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy className="w-4 h-4 mr-1.5" />
            Copiar link
          </Button>
        )}
      </div>
    </div>
  );
}
