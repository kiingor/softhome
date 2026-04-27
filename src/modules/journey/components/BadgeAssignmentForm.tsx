import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { badgeAssignmentSchema, type BadgeAssignmentValues } from "../schemas/badge.schema";
import { useBadges } from "../hooks/use-badges";

interface BadgeAssignmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCollaboratorId?: string;
  onSubmit: (values: BadgeAssignmentValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function BadgeAssignmentForm({
  open,
  onOpenChange,
  defaultCollaboratorId,
  onSubmit,
  isSubmitting,
}: BadgeAssignmentFormProps) {
  const { currentCompany } = useDashboard();
  const { badges } = useBadges();
  const activeBadges = badges.filter((b) => b.is_active);

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-for-badge-assignment", currentCompany?.id],
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

  const form = useForm<BadgeAssignmentValues>({
    resolver: zodResolver(badgeAssignmentSchema),
    defaultValues: {
      collaborator_id: defaultCollaboratorId ?? "",
      badge_id: "",
      awarded_at: todayISO(),
      evidence: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        collaborator_id: defaultCollaboratorId ?? "",
        badge_id: "",
        awarded_at: todayISO(),
        evidence: "",
        notes: "",
      });
    }
  }, [open, defaultCollaboratorId, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Atribuir insígnia</DialogTitle>
          <DialogDescription>
            Reconheça uma conquista do colaborador na Jornada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="collaborator_id">Colaborador</Label>
            <Select
              value={form.watch("collaborator_id")}
              onValueChange={(v) => form.setValue("collaborator_id", v)}
              disabled={!!defaultCollaboratorId}
            >
              <SelectTrigger id="collaborator_id">
                <SelectValue placeholder="Quem conquistou?" />
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

          <div className="space-y-2">
            <Label htmlFor="badge_id">Insígnia</Label>
            <Select
              value={form.watch("badge_id")}
              onValueChange={(v) => form.setValue("badge_id", v)}
            >
              <SelectTrigger id="badge_id">
                <SelectValue placeholder="Qual insígnia?" />
              </SelectTrigger>
              <SelectContent>
                {activeBadges.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeBadges.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhuma insígnia ativa. Cadastra uma primeiro?
              </p>
            )}
            {form.formState.errors.badge_id && (
              <p className="text-sm text-destructive">
                {form.formState.errors.badge_id.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="awarded_at">Quando foi conquistada</Label>
            <Input
              id="awarded_at"
              type="date"
              {...form.register("awarded_at")}
              max={todayISO()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evidence">Evidência (opcional)</Label>
            <Textarea
              id="evidence"
              {...form.register("evidence")}
              placeholder="Link, descrição, contexto da conquista..."
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || activeBadges.length === 0}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Atribuir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
