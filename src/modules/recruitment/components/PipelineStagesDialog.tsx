import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Trash,
  CircleNotch as Loader2,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { STAGE_LABELS } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStages: string[];
  onSave: (stages: string[]) => Promise<void> | void;
  isSaving?: boolean;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function PipelineStagesDialog({
  open,
  onOpenChange,
  initialStages,
  onSave,
  isSaving,
}: Props) {
  const [stages, setStages] = useState<string[]>(initialStages);
  const [newStage, setNewStage] = useState("");

  useEffect(() => {
    if (open) {
      setStages(initialStages);
      setNewStage("");
    }
  }, [open, initialStages]);

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[idx], next[target]] = [next[target], next[idx]];
    setStages(next);
  };

  const remove = (idx: number) => {
    if (stages.length <= 1) {
      toast.error("Mantém pelo menos uma etapa.");
      return;
    }
    setStages(stages.filter((_, i) => i !== idx));
  };

  const add = () => {
    const slug = slugify(newStage);
    if (!slug) {
      toast.error("Digita um nome.");
      return;
    }
    if (stages.includes(slug)) {
      toast.error("Etapa já existe.");
      return;
    }
    setStages([...stages, slug]);
    setNewStage("");
  };

  const handleSave = async () => {
    await onSave(stages);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Etapas do pipeline</DialogTitle>
          <DialogDescription>
            Reordena, adiciona ou remove etapas do kanban dessa vaga. Os
            candidatos das etapas removidas vão pra "Encerrados" como
            withdrawn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {stages.map((stage, idx) => (
            <div
              key={stage}
              className="flex items-center gap-2 rounded-md border p-2"
            >
              <span className="text-xs text-muted-foreground tabular-nums w-5">
                {idx + 1}.
              </span>
              <span className="flex-1 text-sm font-medium">
                {STAGE_LABELS[stage]}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {stage}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
                title="Subir"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={idx === stages.length - 1}
                onClick={() => move(idx, 1)}
                title="Descer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove(idx)}
                title="Remover"
              >
                <Trash className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            placeholder="Nova etapa (ex: 'Teste técnico')"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={add}>
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
