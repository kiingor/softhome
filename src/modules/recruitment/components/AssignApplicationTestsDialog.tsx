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
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  assignTests,
  buildApplicationTestUrl,
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
}: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      setSelected(new Set());
      toast.success("Testes atribuídos ✓");
    },
    onError: (err: Error) =>
      toast.error("Não rolou. " + err.message),
  });

  const copyLink = async (token: string) => {
    const url = buildApplicationTestUrl(token);
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado ✓");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Testes do candidato</DialogTitle>
          <DialogDescription>
            Atribua testes para {candidateName} e compartilhe o link com ele.
          </DialogDescription>
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
                      {a.status !== "completed" && a.status !== "reviewed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyLink(a.access_token)}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copiar link
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {notYetAssigned.length > 0 && (
            <Button
              onClick={() => assign.mutate()}
              disabled={selected.size === 0 || assign.isPending}
            >
              {assign.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Atribuir {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
