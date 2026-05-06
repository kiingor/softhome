import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import { toast } from "sonner";

type VacationPeriod = {
  id: string;
  collaborator_id: string;
  start_date: string;
  end_date: string;
  days_entitled: number;
  days_taken: number;
  days_sold: number;
  days_remaining: number;
  status: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: VacationPeriod | null;
};

export function VacationPeriodAdjustDialog({ open, onOpenChange, period }: Props) {
  const queryClient = useQueryClient();

  const [daysTaken, setDaysTaken] = useState(0);
  const [daysSold, setDaysSold] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (period) {
      setDaysTaken(period.days_taken);
      setDaysSold(period.days_sold);
      setNotes("");
    }
  }, [period]);

  const remaining = period
    ? Math.max(period.days_entitled - daysTaken - daysSold, 0)
    : 0;
  const exceeded = period ? daysTaken + daysSold > period.days_entitled : false;

  const adjust = useMutation({
    mutationFn: async () => {
      if (!period) throw new Error("Período não selecionado");
      const { data, error } = await supabase.rpc(
        "adjust_vacation_period_manual",
        {
          _period_id: period.id,
          _days_taken: daysTaken,
          _days_sold: daysSold,
          _notes: notes.trim() || null,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Saldo ajustado");
      queryClient.invalidateQueries({ queryKey: ["vacation-periods-collaborator"] });
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Falha ao ajustar saldo");
    },
  });

  if (!period) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar saldo do período</DialogTitle>
          <DialogDescription>
            {new Date(period.start_date).toLocaleDateString("pt-BR")} —{" "}
            {new Date(period.end_date).toLocaleDateString("pt-BR")} · direito{" "}
            {period.days_entitled} dias
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="days_taken">Dias já tirados</Label>
              <Input
                id="days_taken"
                type="number"
                min={0}
                max={period.days_entitled}
                value={daysTaken}
                onChange={(e) =>
                  setDaysTaken(Math.max(0, parseInt(e.target.value || "0", 10)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="days_sold">Dias vendidos (abono)</Label>
              <Input
                id="days_sold"
                type="number"
                min={0}
                max={period.days_entitled}
                value={daysSold}
                onChange={(e) =>
                  setDaysSold(Math.max(0, parseInt(e.target.value || "0", 10)))
                }
              />
            </div>
          </div>

          <div
            className={`rounded-md border p-3 text-sm ${
              exceeded
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : "bg-muted/50"
            }`}
          >
            {exceeded ? (
              <span>
                Soma excede o direito de {period.days_entitled} dias. Reveja os
                valores antes de salvar.
              </span>
            ) : (
              <span>
                Saldo restante após o ajuste:{" "}
                <strong>{remaining} dia{remaining === 1 ? "" : "s"}</strong>
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação (opcional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Ex: saldo importado da planilha legada"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={adjust.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => adjust.mutate()}
            disabled={adjust.isPending || exceeded}
          >
            {adjust.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar ajuste"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
