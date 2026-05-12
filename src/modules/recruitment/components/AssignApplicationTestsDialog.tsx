import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  CircleNotch as Loader2,
  Copy,
  CheckCircle,
  Clock,
  WhatsappLogo,
  Phone,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  assignTests,
  buildApplicationTestsSessionUrl,
  getApplicationSessionToken,
  listApplicationTests,
  listAvailableAdmissionTests,
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

  const { data: sessionToken } = useQuery({
    queryKey: ["application-tests-session-token", applicationId],
    queryFn: () => getApplicationSessionToken(applicationId),
    enabled: open && !!applicationId,
  });

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
    if (!open) setSelected(new Set());
  }, [open]);

  const assignedTestIds = new Set(assigned.map((a) => a.test_id));
  const notYetAssigned = available.filter((t) => !assignedTestIds.has(t.id));

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
      queryClient.invalidateQueries({
        queryKey: ["application-tests-session-token", applicationId],
      });
      setSelected(new Set());
      toast.success("Testes atribuídos ✓");
    },
    onError: (err: Error) =>
      toast.error("Não rolou. " + err.message),
  });

  const copySessionLink = async () => {
    if (!sessionToken) {
      toast.error("Atribua pelo menos 1 teste antes de copiar o link.");
      return;
    }
    const url = buildApplicationTestsSessionUrl(sessionToken);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Testes do candidato</DialogTitle>
          <DialogDescription>
            Atribua testes para {candidateName} e envie via WhatsApp ou copie o
            link.
          </DialogDescription>
          {candidatePhone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Phone className="w-3 h-3" />
              <span className="font-mono">{candidatePhone}</span>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Já atribuídos */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Já atribuídos
            </h3>
            {loadingAssigned ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Nenhum teste atribuído ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {assigned.map((a) => {
                  const def = available.find((t) => t.id === a.test_id);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{def?.name ?? a.test_slug}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {a.status === "completed" || a.status === "reviewed" ? (
                            <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {STATUS_LABELS[a.status]}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              {STATUS_LABELS[a.status]}
                            </Badge>
                          )}
                          {a.auto_score != null && (
                            <span className="text-xs text-muted-foreground">
                              Score: {Number(a.auto_score).toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Link único da sessão */}
          {sessionToken && pendingTestsCount > 0 && (
            <section className="space-y-2 pt-2 border-t">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Link para o candidato
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono truncate">
                  {buildApplicationTestsSessionUrl(sessionToken)}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copySessionLink}
                  className="shrink-0"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Mesmo link para todos os testes. O candidato vê a lista e responde
                um por vez.
              </p>
            </section>
          )}

          {/* Atribuir novos */}
          {notYetAssigned.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Atribuir mais
              </h3>
              {loadingAvailable ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="space-y-1.5">
                  {notYetAssigned.map((t) => {
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
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
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
  );
}
