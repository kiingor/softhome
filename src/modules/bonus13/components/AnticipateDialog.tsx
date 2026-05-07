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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CircleNotch as Loader2, FastForward } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useUpdateEntryMode } from "../hooks/use-bonus-entries";
import { useCreateSinglePayment } from "../hooks/use-bonus-payments";
import { formatCurrency } from "@/lib/formatters";
import type { BonusEntryWithCollaborator } from "../lib/bonus-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: BonusEntryWithCollaborator | null;
  year: number;
};

/** Antecipação = paga 100% antes do calendário normal. Dispara notificação
 *  animada pro colaborador (vai receber confetti no portal). */
export function AnticipateDialog({ open, onOpenChange, entry, year }: Props) {
  const [notes, setNotes] = useState("");
  const updateMode = useUpdateEntryMode();
  const createPayment = useCreateSinglePayment();
  const isSubmitting = updateMode.isPending || createPayment.isPending;

  const handleConfirm = async () => {
    if (!entry) return;
    try {
      await updateMode.mutateAsync({
        entryId: entry.id,
        mode: "anticipated",
        notes: notes.trim() || undefined,
      });
      await createPayment.mutateAsync({
        entryId: entry.id,
        amount: entry.gross_value,
        collaboratorId: entry.collaborator_id,
        year,
        mode: "anticipated",
        notes: notes.trim() || undefined,
      });
      toast.success(`13º antecipado pra ${entry.collaborator.name}! 🎉`);
      setNotes("");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao antecipar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FastForward className="w-5 h-5 text-emerald-700" weight="duotone" />
            </div>
            <DialogTitle className="text-lg">Antecipar 13º</DialogTitle>
          </div>
          <DialogDescription>
            Vai pagar o valor integral pra <strong>{entry?.collaborator.name}</strong> antes
            do calendário (Nov/Dez). O colaborador recebe uma notificação
            animada no portal e via WhatsApp/Email.
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor a antecipar</span>
              <span className="font-semibold text-emerald-700">
                {formatCurrency(entry.gross_value)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Meses computados</span>
              <span className="tabular-nums">{entry.months_worked}/12</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="antec-notes">Motivo / observação (opcional)</Label>
          <Textarea
            id="antec-notes"
            rows={3}
            placeholder="Ex: Pago junto com as férias"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar antecipação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
