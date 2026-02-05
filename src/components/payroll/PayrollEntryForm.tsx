import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Loader2, Gift, Calculator } from "lucide-react";
import { getCurrentCompetencia, monthNames, formatCurrency } from "@/lib/formatters";

const entrySchema = z.object({
   type: z.enum(["salario", "vale", "custo", "despesa", "adicional", "inss", "fgts", "irpf"]),
  description: z.string().optional(),
  value: z.string().refine(
    (val) => {
      const num = parseFloat(val.replace(",", "."));
      return !isNaN(num) && num > 0;
    },
    { message: "Valor deve ser maior que zero" }
  ),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
  is_fixed: z.boolean(),
  collaborator_id: z.string().min(1, "Selecione um colaborador"),
  // Installment fields
  is_installment: z.boolean(),
  installment_count: z.number().min(2).max(24).optional(),
});

type EntryFormData = z.infer<typeof entrySchema>;

interface Collaborator {
  id: string;
  name: string;
}

interface Benefit {
  id: string;
  name: string;
  value: number;
  value_type: string;
}

interface PayrollEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  collaborators: Collaborator[];
  editingEntry?: any;
  defaultMonth?: number;
  defaultYear?: number;
}

const typeLabels: Record<string, string> = {
  salario: "Salário",
  vale: "Vale",
  custo: "Custo",
  despesa: "Despesa",
  adicional: "Adicional",
   inss: "INSS",
   fgts: "FGTS",
   irpf: "IRPF",
};

const PayrollEntryForm = ({
  open,
  onOpenChange,
  onSuccess,
  collaborators,
  editingEntry,
  defaultMonth,
  defaultYear,
}: PayrollEntryFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isBenefitMode, setIsBenefitMode] = useState(false);
  const [selectedBenefitId, setSelectedBenefitId] = useState<string>("");
  const { toast } = useToast();
  const { currentCompany, user } = useDashboard();

  const currentComp = getCurrentCompetencia();

  const form = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      type: editingEntry?.type || "salario",
      description: editingEntry?.description || "",
      value: editingEntry?.value?.toString().replace(".", ",") || "",
      month: editingEntry?.month || defaultMonth || currentComp.month,
      year: editingEntry?.year || defaultYear || currentComp.year,
      is_fixed: editingEntry?.is_fixed || false,
      collaborator_id: editingEntry?.collaborator_id || "",
      is_installment: false,
      installment_count: 2,
    },
  });

  const watchIsFixed = form.watch("is_fixed");
  const watchIsInstallment = form.watch("is_installment");
  const watchValue = form.watch("value");
  const watchInstallmentCount = form.watch("installment_count");
  const watchMonth = form.watch("month");
  const watchYear = form.watch("year");
  const watchCollaboratorId = form.watch("collaborator_id");

   // Fetch collaborator with position data for tax calculation
   const { data: collaboratorWithPosition } = useQuery({
     queryKey: ["collaborator-position", watchCollaboratorId],
     queryFn: async () => {
       if (!watchCollaboratorId) return null;
       const { data, error } = await supabase
         .from("collaborators")
         .select(`
           id, name, position_id,
           position:positions(id, name, salary, inss_percent, fgts_percent, irpf_percent)
         `)
         .eq("id", watchCollaboratorId)
         .single();
       if (error) throw error;
       return data;
     },
     enabled: !!watchCollaboratorId && open,
   });
 
  // Fetch available benefits for the company
  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits-for-form", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("benefits")
        .select("id, name, value, value_type")
        .eq("company_id", currentCompany.id)
        .order("name");
      if (error) throw error;
      return data as Benefit[];
    },
    enabled: !!currentCompany?.id && open,
  });

  // Fetch existing benefit assignments for selected collaborator
  const { data: existingAssignments = [] } = useQuery({
    queryKey: ["existing-benefit-assignments", watchCollaboratorId],
    queryFn: async () => {
      if (!watchCollaboratorId) return [];
      const { data, error } = await supabase
        .from("benefits_assignments")
        .select("benefit_id")
        .eq("collaborator_id", watchCollaboratorId);
      if (error) throw error;
      return data.map((d) => d.benefit_id);
    },
    enabled: !!watchCollaboratorId && isBenefitMode && open,
  });

  // Filter benefits to show only those not already assigned
  const availableBenefits = useMemo(() => {
    return benefits.filter((b) => !existingAssignments.includes(b.id));
  }, [benefits, existingAssignments]);

  // Calculate installment value
  const installmentValue = useMemo(() => {
    if (!watchIsInstallment || !watchValue || !watchInstallmentCount) return null;
    const totalValue = parseFloat(watchValue.replace(",", "."));
    if (isNaN(totalValue) || totalValue <= 0) return null;
    return totalValue / watchInstallmentCount;
  }, [watchIsInstallment, watchValue, watchInstallmentCount]);

  useEffect(() => {
    if (editingEntry) {
      form.reset({
        type: editingEntry.type,
        description: editingEntry.description || "",
        value: editingEntry.value?.toString().replace(".", ",") || "",
        month: editingEntry.month,
        year: editingEntry.year,
        is_fixed: editingEntry.is_fixed,
        collaborator_id: editingEntry.collaborator_id,
        is_installment: false,
        installment_count: 2,
      });
      setIsBenefitMode(false);
      setSelectedBenefitId("");
    } else {
      form.reset({
        type: "salario",
        description: "",
        value: "",
        month: defaultMonth || currentComp.month,
        year: defaultYear || currentComp.year,
        is_fixed: false,
        collaborator_id: "",
        is_installment: false,
        installment_count: 2,
      });
      setIsBenefitMode(false);
      setSelectedBenefitId("");
    }
  }, [editingEntry, open, defaultMonth, defaultYear]);

  // Disable installment when fixed is enabled
  useEffect(() => {
    if (watchIsFixed && watchIsInstallment) {
      form.setValue("is_installment", false);
    }
  }, [watchIsFixed]);

  const onSubmit = async (data: EntryFormData) => {
    if (!currentCompany) {
      toast({
        title: "Erro",
        description: "Nenhuma empresa selecionada",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Handle benefit assignment mode
      if (isBenefitMode && selectedBenefitId) {
        const { error } = await supabase.from("benefits_assignments").insert({
          collaborator_id: data.collaborator_id,
          benefit_id: selectedBenefitId,
        });

        if (error) throw error;

        toast({
          title: "Benefício atribuído!",
          description: "O benefício foi vinculado ao colaborador.",
        });

        form.reset();
        onSuccess();
        onOpenChange(false);
        return;
      }

      const value = parseFloat(data.value.replace(",", "."));

      // Handle installment mode
      if (data.is_installment && !data.is_fixed && data.installment_count && data.installment_count >= 2) {
        const installmentGroupId = crypto.randomUUID();
        const perInstallmentValue = value / data.installment_count;
        const entries = [];

        let currentMonth = data.month;
        let currentYear = data.year;

        for (let i = 1; i <= data.installment_count; i++) {
          entries.push({
            type: data.type as "salario" | "vale" | "custo" | "despesa" | "adicional",
            description: data.description ? `${data.description} (${i}/${data.installment_count})` : `Parcela ${i}/${data.installment_count}`,
            value: perInstallmentValue,
            month: currentMonth,
            year: currentYear,
            is_fixed: false,
            collaborator_id: data.collaborator_id,
            company_id: currentCompany.id,
            created_by: user?.id,
            installment_group_id: installmentGroupId,
            installment_number: i,
            installment_total: data.installment_count,
          });

          // Increment month/year for next installment
          if (currentMonth === 12) {
            currentMonth = 1;
            currentYear++;
          } else {
            currentMonth++;
          }
        }

        const { error } = await supabase.from("payroll_entries").insert(entries);

        if (error) throw error;

        toast({
          title: "Parcelas criadas!",
          description: `${data.installment_count} parcelas de ${formatCurrency(perInstallmentValue)} foram criadas.`,
        });
      } else {
        // Standard single entry
        const entryData = {
           type: data.type as "salario" | "vale" | "custo" | "despesa" | "adicional" | "inss" | "fgts" | "irpf",
          description: data.description || null,
          value,
          month: data.month,
          year: data.year,
          is_fixed: data.is_fixed,
          collaborator_id: data.collaborator_id,
          company_id: currentCompany.id,
          created_by: user?.id,
        };

        if (editingEntry) {
          const { error } = await supabase
            .from("payroll_entries")
            .update(entryData)
            .eq("id", editingEntry.id);

          if (error) throw error;

          toast({
            title: "Lançamento atualizado!",
            description: "O lançamento foi atualizado com sucesso.",
          });
        } else {
          const { error } = await supabase
            .from("payroll_entries")
            .insert(entryData);

          if (error) throw error;

           // Auto-create tax entries when creating a salary entry
           if (data.type === "salario" && collaboratorWithPosition?.position) {
             const position = collaboratorWithPosition.position as any;
             const taxEntries: any[] = [];
 
             if (position.inss_percent && position.inss_percent > 0) {
               const inssValue = value * (position.inss_percent / 100);
               taxEntries.push({
                 type: "inss" as const,
                 description: `INSS ${position.inss_percent}%`,
                 value: inssValue,
                 month: data.month,
                 year: data.year,
                 is_fixed: data.is_fixed,
                 collaborator_id: data.collaborator_id,
                 company_id: currentCompany.id,
                 created_by: user?.id,
               });
             }
 
             if (position.fgts_percent && position.fgts_percent > 0) {
               const fgtsValue = value * (position.fgts_percent / 100);
               taxEntries.push({
                 type: "fgts" as const,
                 description: `FGTS ${position.fgts_percent}%`,
                 value: fgtsValue,
                 month: data.month,
                 year: data.year,
                 is_fixed: data.is_fixed,
                 collaborator_id: data.collaborator_id,
                 company_id: currentCompany.id,
                 created_by: user?.id,
               });
             }
 
             if (position.irpf_percent && position.irpf_percent > 0) {
               const irpfValue = value * (position.irpf_percent / 100);
               taxEntries.push({
                 type: "irpf" as const,
                 description: `IRPF ${position.irpf_percent}%`,
                 value: irpfValue,
                 month: data.month,
                 year: data.year,
                 is_fixed: data.is_fixed,
                 collaborator_id: data.collaborator_id,
                 company_id: currentCompany.id,
                 created_by: user?.id,
               });
             }
 
             if (taxEntries.length > 0) {
               const { error: taxError } = await supabase
                 .from("payroll_entries")
                 .insert(taxEntries);
 
               if (taxError) {
                 console.error("Error creating tax entries:", taxError);
               }
             }
           }
 
          toast({
            title: "Lançamento criado!",
             description: data.type === "salario" && collaboratorWithPosition?.position
               ? "O lançamento e impostos foram calculados automaticamente."
               : "O lançamento foi registrado com sucesso.",
          });
        }
      }

      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate year options (current year and 2 years before/after)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Generate installment count options
  const installmentOptions = Array.from({ length: 23 }, (_, i) => i + 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingEntry ? "Editar Lançamento" : "Novo Lançamento"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="collaborator_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Colaborador *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um colaborador" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {collaborators.map((collab) => (
                        <SelectItem key={collab.id} value={collab.id}>
                          {collab.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Benefit Mode Toggle - only show when creating */}
            {!editingEntry && (
              <div className="flex items-center justify-between rounded-lg border p-4 bg-teal-50/50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800">
                <div className="flex items-center gap-3">
                  <Gift className="w-5 h-5 text-teal-600" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Lançar Benefício</p>
                    <p className="text-xs text-muted-foreground">
                      Atribuir um benefício cadastrado ao colaborador
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isBenefitMode}
                  onCheckedChange={(checked) => {
                    setIsBenefitMode(checked);
                    setSelectedBenefitId("");
                  }}
                  disabled={!watchCollaboratorId}
                />
              </div>
            )}

            {/* Benefit Selection */}
            {isBenefitMode && !editingEntry && (
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <FormLabel>Selecione o Benefício</FormLabel>
                {availableBenefits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {!watchCollaboratorId
                      ? "Selecione um colaborador primeiro"
                      : "Nenhum benefício disponível para atribuir"}
                  </p>
                ) : (
                  <Select value={selectedBenefitId} onValueChange={setSelectedBenefitId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um benefício" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBenefits.map((benefit) => (
                        <SelectItem key={benefit.id} value={benefit.id}>
                          {benefit.name} - {formatCurrency(benefit.value)}
                          {benefit.value_type === "daily" && "/dia"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Standard Entry Fields */}
            {!isBenefitMode && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(typeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{watchIsInstallment ? "Valor Total (R$) *" : "Valor (R$) *"}</FormLabel>
                        <FormControl>
                          <Input placeholder="0,00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Input placeholder="Descrição opcional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="month"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{watchIsInstallment ? "Primeira Parcela - Mês *" : "Mês *"}</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          value={field.value.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {monthNames.map((name, index) => (
                              <SelectItem key={index} value={(index + 1).toString()}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ano *</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          value={field.value.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {yearOptions.map((year) => (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="is_fixed"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Lançamento Fixo</FormLabel>
                        <FormDescription>
                          Lançamentos fixos são recorrentes todo mês
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Installment Option - only for non-fixed entries and new entries */}
                {!editingEntry && !watchIsFixed && (
                  <FormField
                    control={form.control}
                    name="is_installment"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                          <Calculator className="w-5 h-5 text-blue-600" />
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Parcelado</FormLabel>
                            <FormDescription>
                              Dividir o valor em parcelas mensais
                            </FormDescription>
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {/* Installment Count */}
                {watchIsInstallment && !watchIsFixed && !editingEntry && (
                  <div className="space-y-4 p-4 rounded-lg border bg-blue-50/30 dark:bg-blue-900/5">
                    <FormField
                      control={form.control}
                      name="installment_count"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número de Parcelas</FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(parseInt(val))}
                            value={field.value?.toString() || "2"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {installmentOptions.map((num) => (
                                <SelectItem key={num} value={num.toString()}>
                                  {num}x
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {installmentValue && (
                      <div className="p-3 rounded-md bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          {watchInstallmentCount}x de {formatCurrency(installmentValue)}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                          Primeira parcela: {monthNames[(watchMonth || 1) - 1]}/{watchYear}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="hero"
                disabled={isLoading || (isBenefitMode && !selectedBenefitId)}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isBenefitMode
                  ? "Atribuir Benefício"
                  : editingEntry
                  ? "Salvar alterações"
                  : watchIsInstallment
                  ? "Criar Parcelas"
                  : "Criar Lançamento"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PayrollEntryForm;