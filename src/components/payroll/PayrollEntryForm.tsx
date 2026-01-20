import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Loader2 } from "lucide-react";
import { getCurrentCompetencia, monthNames } from "@/lib/formatters";

const entrySchema = z.object({
  type: z.enum(["salario", "vale", "custo", "despesa", "adicional"]),
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
});

type EntryFormData = z.infer<typeof entrySchema>;

interface Collaborator {
  id: string;
  name: string;
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
    },
  });

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
      });
    } else {
      form.reset({
        type: "salario",
        description: "",
        value: "",
        month: defaultMonth || currentComp.month,
        year: defaultYear || currentComp.year,
        is_fixed: false,
        collaborator_id: "",
      });
    }
  }, [editingEntry, open, defaultMonth, defaultYear]);

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
      const value = parseFloat(data.value.replace(",", "."));

      const entryData = {
        type: data.type as "salario" | "vale" | "custo" | "despesa" | "adicional",
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

        toast({
          title: "Lançamento criado!",
          description: "O lançamento foi registrado com sucesso.",
        });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
                    <FormLabel>Valor (R$) *</FormLabel>
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
                    <FormLabel>Mês *</FormLabel>
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

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="hero" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingEntry ? "Salvar alterações" : "Criar Lançamento"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PayrollEntryForm;
