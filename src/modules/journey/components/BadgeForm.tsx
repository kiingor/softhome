import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { badgeFormSchema, type BadgeFormValues } from "../schemas/badge.schema";
import { BADGE_CATEGORY_LABELS, type Badge, type BadgeCategory } from "../types";

interface BadgeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: Badge | null;
  onSubmit: (values: BadgeFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const DEFAULT_VALUES: BadgeFormValues = {
  name: "",
  description: "",
  category: "outro",
  weight: 1,
  icon: "",
  is_active: true,
};

export function BadgeForm({ open, onOpenChange, badge, onSubmit, isSubmitting }: BadgeFormProps) {
  const form = useForm<BadgeFormValues>({
    resolver: zodResolver(badgeFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        badge
          ? {
              name: badge.name,
              description: badge.description ?? "",
              category: badge.category,
              weight: badge.weight,
              icon: badge.icon ?? "",
              is_active: badge.is_active,
            }
          : DEFAULT_VALUES
      );
    }
  }, [open, badge, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const isEdit = !!badge;
  const categories = Object.keys(BADGE_CATEGORY_LABELS) as BadgeCategory[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar insígnia" : "Nova insígnia"}</SheetTitle>
          <SheetDescription>
            Insígnias representam conquistas dos colaboradores na Jornada.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...form.register("name")} placeholder="Ex: Primeira Tech Talk" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              {...form.register("description")}
              placeholder="O que essa insígnia representa?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(v) => form.setValue("category", v as BadgeCategory)}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {BADGE_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight">Peso (1-10)</Label>
              <Input
                id="weight"
                type="number"
                min={1}
                max={10}
                {...form.register("weight", { valueAsNumber: true })}
              />
              {form.formState.errors.weight && (
                <p className="text-sm text-destructive">{form.formState.errors.weight.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="is_active" className="text-sm font-medium">
                Ativa
              </Label>
              <p className="text-xs text-muted-foreground">
                Insígnias inativas não aparecem na atribuição.
              </p>
            </div>
            <Switch
              id="is_active"
              checked={form.watch("is_active")}
              onCheckedChange={(v) => form.setValue("is_active", v)}
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
