import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  newEntrySchema,
  type NewEntryValues,
} from "../schemas/payroll.schema";
import {
  ACTIVE_ENTRY_TYPES,
  ENTRY_TYPE_LABELS,
  type ActiveEntryType,
} from "../types";

interface NewEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NewEntryValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const DEFAULTS: NewEntryValues = {
  collaborator_id: "",
  type: "hora_extra",
  description: "",
  value: 0,
  is_fixed: false,
};

export function NewEntryDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: NewEntryDialogProps) {
  const { currentCompany } = useDashboard();

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-for-payroll", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name")
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    enabled: !!currentCompany?.id && open,
  });

  const form = useForm<NewEntryValues>({
    resolver: zodResolver(newEntrySchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
          <DialogDescription>
            Hora extra, falta, atestado, bonificação, desconto ou ajuste manual.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="collaborator_id">Colaborador</Label>
            <Select
              value={form.watch("collaborator_id")}
              onValueChange={(v) => form.setValue("collaborator_id", v)}
            >
              <SelectTrigger id="collaborator_id">
                <SelectValue placeholder="Quem é?" />
              </SelectTrigger>
              <SelectContent>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.collaborator_id && (
              <p className="text-sm text-destructive">
                {form.formState.errors.collaborator_id.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as ActiveEntryType)}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_ENTRY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ENTRY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor (R$)</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                min="0"
                {...form.register("value", { valueAsNumber: true })}
                placeholder="0,00"
              />
              {form.formState.errors.value && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.value.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              {...form.register("description")}
              placeholder="Ex: HE noturna 03/04..."
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lançar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
