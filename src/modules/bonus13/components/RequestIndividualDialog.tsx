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
import { CircleNotch as Loader2, UserCircle } from "@phosphor-icons/react";
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

/** "Solicitar individual" = pagamento avulso (rescisão, caso especial).
 *  Sai do batch ao Gerar Pagamentos. NÃO dispara notificação animada
 *  (decisão administrativa). */
export function RequestIndividualDialog({
  open,
  onOpenChange,
  entry,
  year,
}: Props) {
  const [notes, setNotes] = useState("");
  const updateMode = useUpdateEntryMode();
  const createPayment = useCreateSinglePayment();
  const isSubmitting = updateMode.isPending || createPayment.isPending;

  const handleConfirm = async () => {
    if (!entry) return;
    try {
      await updateMode.mutateAsync({
        entryId: entry.id,
        mode: "individual",
        notes: notes.trim() || undefined,
      });
      await createPayment.mutateAsync({
        entryId: entry.id,
        amount: entry.gross_value,
        collaboratorId: entry.collaborator_id,
        year,
        mode: "individual",
        notes: notes.trim() || undefined,
      });
      toast.success(`${entry.collaborator.name} marcado como pago avulso.`);
      setNotes("");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-amber-700" weight="duotone" />
            </div>
            <DialogTitle className="text-lg">Solicitar pagamento individual</DialogTitle>
          </div>
          <DialogDescription>
            Use pra rescisão ou caso especial. O colaborador <strong>{entry?.collaborator.name}</strong> sai
            do batch e não recebe notificação animada — é um registro
            administrativo.
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor bruto</span>
              <span className="font-semibold">{formatCurrency(entry.gross_value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Meses computados</span>
              <span className="tabular-nums">{entry.months_worked}/12</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="indiv-notes">Motivo (opcional)</Label>
          <Textarea
            id="indiv-notes"
            rows={3}
            placeholder="Ex: Rescisão em 2026-08-15"
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
            Confirmar pagamento avulso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
