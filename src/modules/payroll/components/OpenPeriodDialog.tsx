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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import {
  openPeriodSchema,
  type OpenPeriodValues,
} from "../schemas/payroll.schema";

interface OpenPeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OpenPeriodValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

function defaultMonth(): string {
  // Default: mês atual (primeiro dia)
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function OpenPeriodDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: OpenPeriodDialogProps) {
  const form = useForm<OpenPeriodValues>({
    resolver: zodResolver(openPeriodSchema),
    defaultValues: {
      reference_month: defaultMonth(),
      notes: "",
      auto_populate: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        reference_month: defaultMonth(),
        notes: "",
        auto_populate: true,
      });
    }
  }, [open, form]);

  // Input <type=month> usa formato YYYY-MM. Convertendo pra YYYY-MM-01.
  const monthValue = form.watch("reference_month").substring(0, 7);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir período</DialogTitle>
          <DialogDescription>
            Escolha o mês de referência. Se o auto-popular estiver ligado, o
            sistema vai criar automaticamente os lançamentos de salário base e
            benefícios pra cada colaborador ativo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="reference_month">Mês de referência</Label>
            <Input
              id="reference_month"
              type="month"
              value={monthValue}
              onChange={(e) =>
                form.setValue("reference_month", `${e.target.value}-01`)
              }
            />
            {form.formState.errors.reference_month && (
              <p className="text-sm text-destructive">
                {form.formState.errors.reference_month.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="auto_populate" className="text-sm font-medium">
                Auto-popular salário base + benefícios
              </Label>
              <p className="text-xs text-muted-foreground">
                Cria 1 lançamento de salário base por colaborador ativo +
                lançamentos de cada benefício atribuído.
              </p>
            </div>
            <Switch
              id="auto_populate"
              checked={form.watch("auto_populate")}
              onCheckedChange={(v) => form.setValue("auto_populate", v)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Algo a registrar sobre esse fechamento..."
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Abrir período
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
