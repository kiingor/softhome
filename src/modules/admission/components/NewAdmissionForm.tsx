import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  CircleNotch as Loader2,
  CaretUpDown,
  Check,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
  newAdmissionSchema,
  type NewAdmissionValues,
} from "../schemas/admission.schema";
import {
  REGIME_LABELS,
  DOCUMENT_TYPE_LABELS,
  REQUIRED_DOCS_BY_REGIME,
  type CollaboratorRegime,
  type DocumentType,
} from "../types";
import { formatCPFInput } from "@/lib/validators";
import {
  RISK_GROUP_PERIODICITY_LABELS,
} from "@/lib/riskGroupDefaults";

interface NewAdmissionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NewAdmissionValues) => Promise<void> | void;
  isSubmitting?: boolean;
  initialValues?: Partial<NewAdmissionValues>;
}

interface CargoOption {
  id: string;
  name: string;
  risk_group: string | null;
  exam_periodicity_months: number | null;
}

interface PositionDocOption {
  id: string;
  name: string;
  observation: string | null;
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
  initialValues,
}: NewAdmissionFormProps) {
  const { currentCompany } = useDashboard();
  const [cargoPickerOpen, setCargoPickerOpen] = useState(false);
  const form = useForm<NewAdmissionValues>({
    resolver: zodResolver(newAdmissionSchema),
    defaultValues: DEFAULTS,
  });

  // Reseta o form APENAS quando abre (transição closed → open). Se a gente
  // dependesse de `initialValues`, o objeto recriado a cada render do parent
  // faria o reset em loop, sobrescrevendo o que o user digitou.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      form.reset({ ...DEFAULTS, ...(initialValues ?? {}) });
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cargos da empresa atual
  const { data: cargos = [] } = useQuery({
    queryKey: ["positions-for-admission", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("id, name, risk_group, exam_periodicity_months")
        .eq("company_id", currentCompany.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CargoOption[];
    },
    enabled: !!currentCompany?.id && open,
  });

  const positionId = form.watch("position_id");
  const selectedCargo = cargos.find((c) => c.id === positionId);

  // Documentos do cargo selecionado — sempre busca dados frescos pra refletir
  // mudanças feitas no Cargos sem precisar reload.
  const { data: cargoDocs = [] } = useQuery({
    queryKey: ["position-documents", positionId],
    queryFn: async () => {
      if (!positionId) return [];
      const { data, error } = await supabase
        .from("position_documents")
        .select("id, name, observation")
        .eq("position_id", positionId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PositionDocOption[];
    },
    enabled: !!positionId && open,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const regime = form.watch("regime");

  // Documentos a mostrar: do cargo se houver, senão default do regime
  const docsToShow: { label: string; observation?: string | null }[] =
    cargoDocs.length > 0
      ? cargoDocs.map((d) => ({ label: d.name, observation: d.observation }))
      : REQUIRED_DOCS_BY_REGIME[regime].map((d) => ({
          label: DOCUMENT_TYPE_LABELS[d as DocumentType] ?? d,
        }));

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
            <Label htmlFor="position_id">Cargo</Label>
            <Popover open={cargoPickerOpen} onOpenChange={setCargoPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="position_id"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={cargoPickerOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedCargo ? (
                    <span className="truncate">
                      {selectedCargo.name}
                      {selectedCargo.risk_group && (
                        <span className="text-muted-foreground text-xs ml-2">
                          · {selectedCargo.risk_group}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Sem cargo definido
                    </span>
                  )}
                  <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-[--radix-popover-trigger-width]"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Buscar cargo..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cargo com esse nome.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__ sem cargo"
                        onSelect={() => {
                          form.setValue("position_id", "");
                          setCargoPickerOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            !positionId ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Sem cargo definido
                      </CommandItem>
                      {cargos.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.risk_group ?? ""}`}
                          onSelect={() => {
                            form.setValue("position_id", c.id);
                            setCargoPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              positionId === c.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{c.name}</span>
                          {c.risk_group && (
                            <span className="text-muted-foreground text-xs ml-2">
                              · {c.risk_group}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              O cargo define os documentos exigidos (cadastrados em{" "}
              <strong>Cargos</strong>) e o exame admissional pelo grupo de
              risco.
            </p>
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
          </div>

          {/* Preview do que será pedido */}
          <div className="rounded-lg border border-dashed p-3 space-y-3 bg-muted/30">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Documentos que vão ser pedidos
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {docsToShow.map((d, i) => (
                  <span
                    key={i}
                    title={d.observation ?? undefined}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-background"
                  >
                    {d.label}
                  </span>
                ))}
                {docsToShow.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Cargo sem docs cadastrados.
                  </span>
                )}
              </div>
              {selectedCargo && cargoDocs.length === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cargo sem documentos cadastrados — usando padrão do regime.
                  Pra customizar, edita o cargo em <strong>Cargos</strong>.
                </p>
              )}
            </div>

            {selectedCargo?.risk_group && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Exame ocupacional
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-background">
                    Admissional
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Grupo {selectedCargo.risk_group} ·{" "}
                    {RISK_GROUP_PERIODICITY_LABELS[selectedCargo.risk_group]}
                  </span>
                </div>
              </div>
            )}
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
