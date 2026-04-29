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
  jobOpeningSchema,
  type JobOpeningValues,
} from "../schemas/recruitment.schema";
import {
  REGIME_LABELS,
  type JobOpening,
  type JobOpeningStatus,
  type CollaboratorRegime,
} from "../types";

interface JobOpeningFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: JobOpening | null;
  onSubmit: (values: JobOpeningValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const DEFAULTS: JobOpeningValues = {
  title: "",
  description: "",
  requirements: "",
  regime: "clt",
  status: "draft",
  position_id: "",
  team_id: "",
  hiring_manager_id: "",
  vacancies_count: 1,
  notes: "",
};

export function JobOpeningForm({
  open,
  onOpenChange,
  job,
  onSubmit,
  isSubmitting,
}: JobOpeningFormProps) {
  const form = useForm<JobOpeningValues>({
    resolver: zodResolver(jobOpeningSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        job
          ? {
              title: job.title,
              description: job.description ?? "",
              requirements: job.requirements ?? "",
              regime: job.regime,
              status: job.status,
              position_id: job.position_id ?? "",
              team_id: job.team_id ?? "",
              hiring_manager_id: job.hiring_manager_id ?? "",
              vacancies_count: job.vacancies_count,
              notes: job.notes ?? "",
            }
          : DEFAULTS
      );
    }
  }, [open, job, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const isEdit = !!job;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar vaga" : "Nova vaga"}</SheetTitle>
          <SheetDescription>
            Cadastra a vaga primeiro como rascunho. Quando estiver pronta pra
            receber candidaturas, muda pra "Aberta".
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              {...form.register("title")}
              placeholder="Ex: Desenvolvedor(a) Backend Pleno"
            />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="regime">Regime</Label>
              <Select
                value={form.watch("regime")}
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="vacancies_count">Quantas vagas</Label>
              <Input
                id="vacancies_count"
                type="number"
                min={1}
                {...form.register("vacancies_count", { valueAsNumber: true })}
              />
              {form.formState.errors.vacancies_count && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.vacancies_count.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as JobOpeningStatus)}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Rascunho (não publicada)</SelectItem>
                <SelectItem value="open">Aberta (recebendo candidaturas)</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
                <SelectItem value="filled">Preenchida</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição da vaga</Label>
            <Textarea
              id="description"
              {...form.register("description")}
              placeholder="O que a pessoa vai fazer no dia a dia?"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements">Requisitos</Label>
            <Textarea
              id="requirements"
              {...form.register("requirements")}
              placeholder="Habilidades, experiência, formação..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              A IA usa esse texto pra fazer triagem dos CVs.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações internas</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Algo que só o RH/gestor precisa saber..."
              rows={2}
            />
          </div>

          <SheetFooter className="flex-row justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
