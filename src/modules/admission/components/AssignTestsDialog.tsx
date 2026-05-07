import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAdmissionTests } from "../hooks/use-admission-tests";
import { useJourneyTests } from "../hooks/use-admission-tests";
import { getTestDefinition } from "../lib/tests";

interface AssignTestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journeyId: string | null;
  /** IDs dos testes já atribuídos (pra pré-selecionar). */
  assignedTestIds: string[];
  onAssigned?: () => void;
}

export function AssignTestsDialog({
  open,
  onOpenChange,
  journeyId,
  assignedTestIds,
  onAssigned,
}: AssignTestsDialogProps) {
  const { tests, isLoading } = useAdmissionTests();
  const { assignTests } = useJourneyTests(journeyId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pré-seleciona o que já está atribuído quando abre.
  useEffect(() => {
    if (open) setSelected(new Set(assignedTestIds));
  }, [open, assignedTestIds]);

  const activeTests = tests.filter((t) => t.is_active);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!journeyId) return;
    // Ids ainda não atribuídos (vai inserir). Se não tem novos, mesmo
    // assim chamamos a mutation porque ela também rebobina o status da
    // journey pra `tests_pending` quando há testes pendentes.
    const toAssign = [...selected].filter((id) => !assignedTestIds.includes(id));
    try {
      await assignTests.mutateAsync({ journeyId, testIds: toAssign });
      if (toAssign.length > 0) {
        toast.success(`${toAssign.length} teste(s) atribuído(s)`);
      } else {
        toast.success("Etapa 1 reposicionada — candidato vai cair nos testes.");
      }
      onAssigned?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atribuir");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Selecionar testes pra essa admissão</DialogTitle>
          <DialogDescription>
            Marque os testes que o candidato vai fazer na primeira etapa.
            Apenas testes ativos no catálogo aparecem aqui.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTests.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum teste ativo. Vá em "Testes" pra ativar pelo menos um.
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {activeTests.map((t) => {
              const def = getTestDefinition(t.slug);
              const isAssigned = assignedTestIds.includes(t.id);
              return (
                <label
                  key={t.id}
                  htmlFor={`assign-${t.id}`}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/40 ${
                    selected.has(t.id) ? "border-primary bg-primary/5" : "border-border"
                  } ${isAssigned ? "opacity-60" : ""}`}
                >
                  <Checkbox
                    id={`assign-${t.id}`}
                    checked={selected.has(t.id)}
                    disabled={isAssigned}
                    onCheckedChange={() => !isAssigned && toggle(t.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {t.name}
                      </span>
                      {isAssigned && (
                        <Badge variant="secondary" className="text-[10px]">
                          Já atribuído
                        </Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {def?.questions.length ?? 0} perguntas · ~
                      {def?.estimatedMinutes ?? "?"} min
                      {t.time_limit_minutes
                        ? ` · limite ${t.time_limit_minutes} min`
                        : ""}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={assignTests.isPending || selected.size === 0}
          >
            {assignTests.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
