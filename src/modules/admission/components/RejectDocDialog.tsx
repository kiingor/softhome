import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import {
  rejectDocumentSchema,
  type RejectDocumentValues,
} from "../schemas/admission.schema";

interface RejectDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docLabel: string;
  onSubmit: (values: RejectDocumentValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

export function RejectDocDialog({
  open,
  onOpenChange,
  docLabel,
  onSubmit,
  isSubmitting,
}: RejectDocDialogProps) {
  const form = useForm<RejectDocumentValues>({
    resolver: zodResolver(rejectDocumentSchema),
    defaultValues: { rejection_reason: "" },
  });

  useEffect(() => {
    if (open) form.reset({ rejection_reason: "" });
  }, [open, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedir ajuste em "{docLabel}"</DialogTitle>
          <DialogDescription>
            Conta o que precisa ajustar. O candidato vai ver esse motivo e poder
            reenviar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rejection_reason">Motivo</Label>
            <Textarea
              id="rejection_reason"
              {...form.register("rejection_reason")}
              placeholder="Ex: a foto tá borrada, manda de novo com mais luz?"
              rows={4}
              autoFocus
            />
            {form.formState.errors.rejection_reason && (
              <p className="text-sm text-destructive">
                {form.formState.errors.rejection_reason.message}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Pedir ajuste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
