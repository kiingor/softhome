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
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import {
  candidateManualSchema,
  type CandidateManualValues,
} from "../schemas/recruitment.schema";
import { formatCPFInput } from "@/lib/validators";

interface NewCandidateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CandidateManualValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const DEFAULTS: CandidateManualValues = {
  name: "",
  email: "",
  phone: "",
  cpf: "",
  linkedin_url: "",
  source: "",
  notes: "",
};

export function NewCandidateForm({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: NewCandidateFormProps) {
  const form = useForm<CandidateManualValues>({
    resolver: zodResolver(candidateManualSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Cadastrar candidato</SheetTitle>
          <SheetDescription>
            Use quando você recebe um currículo por outro canal (email,
            WhatsApp, indicação) e quer guardar no banco de talentos.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="Nome do candidato"
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...form.register("email")}
              placeholder="email@candidato.com"
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                {...form.register("phone")}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF (opcional)</Label>
              <Input
                id="cpf"
                value={form.watch("cpf") ?? ""}
                onChange={(e) => form.setValue("cpf", formatCPFInput(e.target.value))}
                placeholder="000.000.000-00"
              />
              {form.formState.errors.cpf && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.cpf.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="linkedin_url">LinkedIn (opcional)</Label>
            <Input
              id="linkedin_url"
              type="url"
              {...form.register("linkedin_url")}
              placeholder="https://linkedin.com/in/..."
            />
            {form.formState.errors.linkedin_url && (
              <p className="text-sm text-destructive">
                {form.formState.errors.linkedin_url.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Fonte (de onde veio)</Label>
            <Input
              id="source"
              {...form.register("source")}
              placeholder="LinkedIn, indicação, evento..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Algo que você queira lembrar sobre esse candidato..."
              rows={3}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            ℹ️ O CV em si vai ser anexado depois (via página do candidato ou edit).
          </p>

          <SheetFooter className="flex-row justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cadastrar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
