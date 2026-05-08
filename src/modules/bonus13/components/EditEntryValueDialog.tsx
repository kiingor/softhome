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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CircleNotch as Loader2, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useUpdateEntryGrossValue } from "../hooks/use-bonus-entries";
import { formatCurrency } from "@/lib/formatters";
import { calcGrossValue } from "../lib/calc-13";
import type { BonusEntryWithCollaborator } from "../lib/bonus-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: BonusEntryWithCollaborator | null;
};

export function EditEntryValueDialog({ open, onOpenChange, entry }: Props) {
  const [value, setValue] = useState<string>("");
  const updateValue = useUpdateEntryGrossValue();

  useEffect(() => {
    if (entry) setValue(String(entry.gross_value));
  }, [entry]);

  const calculated = entry
    ? calcGrossValue({
        baseSalary: entry.base_salary,
        monthsWorked: entry.months_worked,
        gratificacaoSum: entry.gratificacao_sum ?? 0,
        adicionalMonthly: entry.adicional_monthly ?? 0,
      })
    : 0;
  const numericValue = Number(value) || 0;

  const handleConfirm = async () => {
    if (!entry) return;
    try {
      await updateValue.mutateAsync({ entryId: entry.id, grossValue: numericValue });
      toast.success("Valor atualizado.");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  const handleResetToCalculated = () => {
    setValue(String(calculated));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <PencilSimple className="w-5 h-5 text-primary" weight="duotone" />
            </div>
            <DialogTitle className="text-lg">Editar valor do 13º</DialogTitle>
          </div>
          <DialogDescription>
            Override do valor calculado para <strong>{entry?.collaborator.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salário base (snapshot)</span>
              <span className="tabular-nums">{formatCurrency(entry.base_salary)}</span>
            </div>
            {(entry.gratificacao_sum ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gratificações no ano</span>
                <span className="tabular-nums">
                  {formatCurrency(entry.gratificacao_sum)}
                </span>
              </div>
            )}
            {(entry.adicional_monthly ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Adicional mensal</span>
                <span className="tabular-nums">
                  {formatCurrency(entry.adicional_monthly)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Meses trabalhados</span>
              <span className="tabular-nums">{entry.months_worked}/12</span>
            </div>
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="text-muted-foreground">Valor calculado</span>
              <span className="tabular-nums font-medium">{formatCurrency(calculated)}</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="entry-value">Valor bruto (R$)</Label>
          <Input
            id="entry-value"
            type="number"
            step="0.01"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {entry && Math.abs(numericValue - calculated) > 0.01 && (
            <button
              type="button"
              onClick={handleResetToCalculated}
              className="text-xs text-primary hover:underline"
            >
              Voltar pro valor calculado ({formatCurrency(calculated)})
            </button>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateValue.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={updateValue.isPending || numericValue < 0}
          >
            {updateValue.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
