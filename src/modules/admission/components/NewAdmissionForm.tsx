import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  newAdmissionSchema,
  type NewAdmissionValues,
} from "../schemas/admission.schema";
import {
  REGIME_LABELS,
  type CollaboratorRegime,
} from "../types";
import { listRequiredDocs } from "../hooks/use-admission-journeys";
import { formatCPFInput } from "@/lib/validators";

interface NewAdmissionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NewAdmissionValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const DEFAULTS: NewAdmissionValues = {
  candidate_name: "",
  candidate_email: "",
  candidate_phone: "",
  candidate_cpf: "",
  regime: "clt",
  position_id: "",
  notes: "",
};

export function NewAdmissionForm({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: NewAdmissionFormProps) {
  const form = useForm<NewAdmissionValues>({
    resolver: zodResolver(newAdmissionSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  const regime = form.watch("regime");

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit({
      ...values,
      candidate_cpf: values.candidate_cpf?.replace(/\D/g, "") || "",
    });
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nova admissão</SheetTitle>
          <SheetDescription>
            Cria o processo. Depois você compartilha o link com o candidato pra
            ele preencher dados e enviar documentos.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div className="space-y-2">
            <Label htmlFor="candidate_name">Nome completo</Label>
            <Input
              id="candidate_name"
              {...form.register("candidate_name")}
              placeholder="Nome do candidato"
            />
            {form.formState.errors.candidate_name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.candidate_name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="candidate_email">Email</Label>
            <Input
              id="candidate_email"
              type="email"
              {...form.register("candidate_email")}
              placeholder="email@candidato.com"
            />
            {form.formState.errors.candidate_email && (
              <p className="text-sm text-destructive">
                {form.formState.errors.candidate_email.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="candidate_phone">Telefone</Label>
              <Input
                id="candidate_phone"
                {...form.register("candidate_phone")}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="candidate_cpf">CPF (opcional)</Label>
              <Input
                id="candidate_cpf"
                value={form.watch("candidate_cpf") ?? ""}
                onChange={(e) =>
                  form.setValue("candidate_cpf", formatCPFInput(e.target.value))
                }
                placeholder="000.000.000-00"
              />
              {form.formState.errors.candidate_cpf && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.candidate_cpf.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="regime">Regime</Label>
            <Select
              value={regime}
              onValueChange={(v) => form.setValue("regime", v as CollaboratorRegime)}
            >
              <SelectTrigger id="regime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clt">{REGIME_LABELS.clt}</SelectItem>
                <SelectItem value="pj">{REGIME_LABELS.pj}</SelectItem>
                <SelectItem value="estagiario">{REGIME_LABELS.estagiario}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Documentos requeridos: {listRequiredDocs(regime)}.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (interno)</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Algo que o RH precisa lembrar..."
              rows={3}
            />
          </div>

          <SheetFooter className="flex-row justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar admissão
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
