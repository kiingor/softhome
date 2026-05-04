import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DayAbbrev, dayLabels, defaultWorkingDays, countWorkingDays } from "@/lib/workingDays";
import { formatCurrencyForInput, parseCurrencyInput, formatNumberAsCurrency, formatCurrency, getCurrentCompetencia } from "@/lib/formatters";
import { useState, useEffect } from "react";

export type BenefitCategory =
  | "meal"
  | "transport"
  | "health"
  | "daycare"
  | "bonus"
  | "other";

export const BENEFIT_CATEGORY_LABELS: Record<BenefitCategory, string> = {
  meal: "Alimentação (VR/VA)",
  transport: "Transporte (VT)",
  health: "Saúde (Plano/Odonto)",
  daycare: "Auxílio Creche",
  bonus: "Bônus / PLR",
  other: "Outro",
};

const benefitSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  value: z.string().min(1, "Valor é obrigatório"),
  value_type: z.enum(["monthly", "daily"]),
  category: z.enum(["meal", "transport", "health", "daycare", "bonus", "other"]),
  applicable_days: z.array(z.string()).optional(),
});

type BenefitFormData = z.infer<typeof benefitSchema>;

interface BenefitFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    value: number;
    value_type: "monthly" | "daily";
    category: BenefitCategory;
    applicable_days: string[];
  }) => Promise<void>;
  initialData?: {
    name: string;
    description?: string | null;
    value?: number;
    value_type?: "monthly" | "daily";
    category?: BenefitCategory;
    applicable_days?: string[];
  };
  isLoading?: boolean;
}

const weekDays: { id: DayAbbrev; label: string }[] = [
  { id: "mon", label: dayLabels.mon },
  { id: "tue", label: dayLabels.tue },
  { id: "wed", label: dayLabels.wed },
  { id: "thu", label: dayLabels.thu },
  { id: "fri", label: dayLabels.fri },
  { id: "sat", label: dayLabels.sat },
  { id: "sun", label: dayLabels.sun },
];

const BenefitForm = ({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading,
}: BenefitFormProps) => {
  const [valueDisplay, setValueDisplay] = useState("");

  const form = useForm<BenefitFormData>({
    resolver: zodResolver(benefitSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      value: "",
      value_type: initialData?.value_type || "monthly",
      category: initialData?.category || "other",
      applicable_days: initialData?.applicable_days || defaultWorkingDays,
    },
  });

  const valueType = form.watch("value_type");
  const applicableDays = form.watch("applicable_days") || defaultWorkingDays;
  const { month: currentMonth, year: currentYear } = getCurrentCompetencia();

  // Calculate preview of monthly value for daily benefits
  const getMonthlyPreview = () => {
    if (valueType !== "daily" || !valueDisplay) return null;
    const dailyValue = parseCurrencyInput(valueDisplay);
    if (dailyValue <= 0) return null;
    const workingDays = countWorkingDays(currentMonth, currentYear, applicableDays as DayAbbrev[]);
    const total = dailyValue * workingDays;
    return { workingDays, total };
  };

  const monthlyPreview = getMonthlyPreview();
  useEffect(() => {
    if (open) {
      const initialValue = initialData?.value
        ? formatNumberAsCurrency(initialData.value)
        : "";
      setValueDisplay(initialValue);
      form.reset({
        name: initialData?.name || "",
        description: initialData?.description || "",
        value: initialValue,
        value_type: initialData?.value_type || "monthly",
        category: initialData?.category || "other",
        applicable_days: initialData?.applicable_days || defaultWorkingDays,
      });
    }
  }, [open, initialData, form]);

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyForInput(e.target.value);
    setValueDisplay(formatted);
    form.setValue("value", formatted, { shouldValidate: true });
  };

  const handleSubmit = async (data: BenefitFormData) => {
    const numericValue = parseCurrencyInput(data.value);
    await onSubmit({
      name: data.name,
      description: data.description,
      value: numericValue,
      value_type: data.value_type,
      category: data.category,
      applicable_days: data.value_type === "daily" ? (data.applicable_days || defaultWorkingDays) : defaultWorkingDays,
    });
    form.reset();
    setValueDisplay("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Editar Benefício" : "Novo Benefício"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Benefício</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Vale Transporte" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(BENEFIT_CATEGORY_LABELS) as BenefitCategory[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {BENEFIT_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Usado em relatórios e regras específicas (ex: VT desconta 6% do salário).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descrição do benefício..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="R$ 0,00"
                        value={valueDisplay}
                        onChange={handleValueChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo do Cálculo</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="daily">Diário</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Monthly preview for daily benefits */}
            {valueType === "daily" && monthlyPreview && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm text-muted-foreground">
                  Previsão para {currentMonth.toString().padStart(2, "0")}/{currentYear}:
                </p>
                <p className="font-medium text-primary">
                  {formatCurrency(parseCurrencyInput(valueDisplay))} × {monthlyPreview.workingDays} dias = <strong>{formatCurrency(monthlyPreview.total)}</strong>
                </p>
              </div>
            )}

            {valueType === "daily" && (
              <FormField
                control={form.control}
                name="applicable_days"
                render={() => (
                  <FormItem>
                    <FormLabel>Dias Aplicáveis</FormLabel>
                    <FormDescription>
                      Selecione os dias da semana em que o benefício se aplica
                    </FormDescription>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {weekDays.map((day) => (
                        <FormField
                          key={day.id}
                          control={form.control}
                          name="applicable_days"
                          render={({ field }) => (
                            <FormItem
                              key={day.id}
                              className="flex items-center space-x-2 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(day.id)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    return checked
                                      ? field.onChange([...current, day.id])
                                      : field.onChange(
                                          current.filter((d) => d !== day.id)
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal cursor-pointer">
                                {day.label}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BenefitForm;
