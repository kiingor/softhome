import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CircleNotch as Loader2, Confetti } from "@phosphor-icons/react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { year: number; notes?: string }) => Promise<void> | void;
  isSubmitting: boolean;
  /** Anos já em uso (pra desabilitar botão se duplicado). */
  existingYears: number[];
};

export function OpenBonusPeriodDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  existingYears,
}: Props) {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [notes, setNotes] = useState("");

  const yearAlreadyExists = existingYears.includes(year);

  const handleSubmit = async () => {
    if (yearAlreadyExists) return;
    await onSubmit({ year, notes: notes.trim() || undefined });
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Confetti className="w-5 h-5 text-primary" weight="duotone" />
            </div>
            <DialogTitle className="text-lg">Abrir campanha de 13º</DialogTitle>
          </div>
          <DialogDescription>
            Vou listar todos os colaboradores ativos do regime CLT da empresa
            atual e calcular automaticamente o valor proporcional aos meses
            trabalhados (regra: mês com ≥15 dias conta cheio).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bonus-year">Ano</Label>
            <Input
              id="bonus-year"
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || 0)}
            />
            {yearAlreadyExists && (
              <p className="text-xs text-destructive">
                Já existe campanha de {year} para esta empresa.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bonus-notes">Observações (opcional)</Label>
            <Textarea
              id="bonus-notes"
              rows={3}
              placeholder="Algo importante sobre essa campanha?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || yearAlreadyExists || !year}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Abrindo...
              </>
            ) : (
              <>
                <Confetti className="w-4 h-4 mr-2" />
                Abrir campanha
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
