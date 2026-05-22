import { useEffect, useMemo, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  CircleNotch as Loader2,
  ArrowUp,
  ArrowDown,
  CaretUpDown,
  Check,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  newEntrySchema,
  type NewEntryValues,
} from "../schemas/payroll.schema";
import {
  ENTRY_TYPE_LABELS,
  MANUAL_CREDIT_TYPES,
  MANUAL_DEBIT_TYPES,
  entryTypeNature,
  type ActiveEntryType,
  type ManualEntryNature,
} from "../types";
import {
  formatCurrencyForInput,
  parseCurrencyInput,
} from "@/lib/formatters";

interface NewEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NewEntryValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const DEFAULT_NATURE: ManualEntryNature = "credit";
const DEFAULT_CREDIT_TYPE: ActiveEntryType = MANUAL_CREDIT_TYPES[0];
const DEFAULT_DEBIT_TYPE: ActiveEntryType = MANUAL_DEBIT_TYPES[0];

const DEFAULTS: NewEntryValues = {
  collaborator_id: "",
  type: DEFAULT_CREDIT_TYPE,
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
  const [nature, setNature] = useState<ManualEntryNature>(DEFAULT_NATURE);
  const [collabPopoverOpen, setCollabPopoverOpen] = useState(false);
  /** Display do valor em moeda BR ("R$ 1.234,56"). Sincronizado com form.value. */
  const [valueDisplay, setValueDisplay] = useState("");

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

  // Tipos disponíveis pra natureza atual
  const availableTypes = useMemo(
    () => (nature === "credit" ? MANUAL_CREDIT_TYPES : MANUAL_DEBIT_TYPES),
    [nature],
  );

  // Ao trocar Crédito/Débito, ajusta o tipo selecionado pro primeiro válido
  // da nova natureza (mantém o atual se já for compatível).
  useEffect(() => {
    const currentType = form.getValues("type");
    const currentNature = entryTypeNature(currentType);
    if (currentNature !== nature) {
      form.setValue(
        "type",
        nature === "credit" ? DEFAULT_CREDIT_TYPE : DEFAULT_DEBIT_TYPE,
      );
    }
  }, [nature, form]);

  // Reset ao abrir (volta pra Crédito + tipo padrão + value display vazio)
  useEffect(() => {
    if (open) {
      setNature(DEFAULT_NATURE);
      setValueDisplay("");
      setCollabPopoverOpen(false);
      form.reset(DEFAULTS);
    }
  }, [open, form]);

  const selectedCollab = collaborators.find(
    (c) => c.id === form.watch("collaborator_id"),
  );

  const handleValueChange = (raw: string) => {
    // Digitando: formata o display em BR, persiste o número parseado no form
    const formatted = formatCurrencyForInput(raw);
    setValueDisplay(formatted);
    const parsed = parseCurrencyInput(formatted);
    form.setValue("value", parsed, { shouldValidate: true });
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
          <DialogDescription>
            Lançamento avulso na folha aberta. Escolhe se é a receber (crédito)
            ou a descontar (débito).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Crédito / Débito */}
          <div className="space-y-2">
            <Label>Natureza</Label>
            <ToggleGroup
              type="single"
              value={nature}
              onValueChange={(v) => {
                if (v === "credit" || v === "debit") setNature(v);
              }}
              className="grid grid-cols-2 gap-2"
            >
              <ToggleGroupItem
                value="credit"
                aria-label="Crédito (a receber)"
                className="data-[state=on]:bg-emerald-50 data-[state=on]:text-emerald-700 data-[state=on]:border-emerald-300 dark:data-[state=on]:bg-emerald-950/40 dark:data-[state=on]:text-emerald-300 dark:data-[state=on]:border-emerald-900/60 border h-auto py-2.5 justify-start gap-2 px-3"
              >
                <ArrowUp className="w-4 h-4" weight="bold" />
                <div className="text-left leading-tight">
                  <div className="font-semibold text-sm">Crédito</div>
                  <div className="text-[11px] text-muted-foreground">
                    a receber
                  </div>
                </div>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="debit"
                aria-label="Débito (a descontar)"
                className="data-[state=on]:bg-rose-50 data-[state=on]:text-rose-700 data-[state=on]:border-rose-300 dark:data-[state=on]:bg-rose-950/40 dark:data-[state=on]:text-rose-300 dark:data-[state=on]:border-rose-900/60 border h-auto py-2.5 justify-start gap-2 px-3"
              >
                <ArrowDown className="w-4 h-4" weight="bold" />
                <div className="text-left leading-tight">
                  <div className="font-semibold text-sm">Débito</div>
                  <div className="text-[11px] text-muted-foreground">
                    a descontar
                  </div>
                </div>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Combobox com busca pra Colaborador */}
          <div className="space-y-2">
            <Label htmlFor="collaborator_id">Colaborador</Label>
            <Popover open={collabPopoverOpen} onOpenChange={setCollabPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={collabPopoverOpen}
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedCollab && "text-muted-foreground",
                  )}
                >
                  <span className="truncate">
                    {selectedCollab ? selectedCollab.name : "Quem é?"}
                  </span>
                  <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Buscar colaborador..." />
                  <CommandList>
                    <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                    <CommandGroup>
                      {collaborators.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            form.setValue("collaborator_id", c.id, {
                              shouldValidate: true,
                            });
                            setCollabPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedCollab?.id === c.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ENTRY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor</Label>
              <Input
                id="value"
                type="text"
                inputMode="decimal"
                value={valueDisplay}
                onChange={(e) => handleValueChange(e.target.value)}
                placeholder="R$ 0,00"
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
              placeholder={
                nature === "credit"
                  ? "Ex: HE noturna 03/04..."
                  : "Ex: Adiantamento quinzena..."
              }
              rows={2}
            />
          </div>

          {/* Switch "Fixo" — só faz sentido pra gratificação/bonificação,
              que são os tipos que viram adicional recorrente na agenda.
              Quando ligado: além de gravar local, faz POST pra agenda
              criando o adicional (vai aparecer nas próximas folhas via sync). */}
          {(form.watch("type") === "gratificacao" ||
            form.watch("type") === "bonificacao") && (
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="is_fixed" className="text-sm font-medium">
                  Fixo (recorrente)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Adiciona como adicional na agenda — vai aparecer nas
                  próximas folhas automaticamente.
                </p>
              </div>
              <Switch
                id="is_fixed"
                checked={form.watch("is_fixed")}
                onCheckedChange={(v) =>
                  form.setValue("is_fixed", v, { shouldValidate: true })
                }
              />
            </div>
          )}

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
