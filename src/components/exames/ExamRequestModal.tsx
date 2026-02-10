import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useExams } from "@/hooks/useExams";
import { EXAM_TYPE_LABELS } from "@/lib/riskGroupDefaults";

const EXAM_TYPES = [
  { value: "admissional", label: "Admissional" },
  { value: "periodico", label: "Periódico" },
  { value: "mudanca_funcao", label: "Mudança de Função" },
  { value: "retorno_trabalho", label: "Retorno ao Trabalho" },
  { value: "demissional", label: "Demissional" },
  { value: "avulso", label: "Avulso" },
];

interface ExamRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ExamRequestModal = ({ open, onOpenChange }: ExamRequestModalProps) => {
  const { currentCompany } = useDashboard();
  const { createExam, isCreating } = useExams();
  const [form, setForm] = useState({
    collaborator_id: "",
    exam_type: "avulso",
    custom_name: "",
    due_date: "",
    notes: "",
  });

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-for-exam", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name, position_id")
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id && open,
  });

  const handleSubmit = () => {
    if (!form.collaborator_id || !form.due_date) return;
    const notes = form.exam_type === "avulso" && form.custom_name
      ? `[${form.custom_name}] ${form.notes || ""}`.trim()
      : form.notes || undefined;
    createExam(
      {
        collaborator_id: form.collaborator_id,
        exam_type: form.exam_type,
        due_date: form.due_date,
        notes,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setForm({ collaborator_id: "", exam_type: "avulso", custom_name: "", due_date: "", notes: "" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Novo Exame
            <Badge variant="secondary">{EXAM_TYPE_LABELS[form.exam_type] || form.exam_type}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Exame *</Label>
            <Select value={form.exam_type} onValueChange={(v) => setForm((p) => ({ ...p, exam_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXAM_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.exam_type === "avulso" && (
            <div className="space-y-2">
              <Label>Nome do Exame</Label>
              <Input
                value={form.custom_name}
                onChange={(e) => setForm((p) => ({ ...p, custom_name: e.target.value }))}
                placeholder="Ex: Audiometria, Espirometria..."
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Colaborador *</Label>
            <Select value={form.collaborator_id} onValueChange={(v) => setForm((p) => ({ ...p, collaborator_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data Limite *</Label>
            <Input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Motivo ou detalhes do exame" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isCreating || !form.collaborator_id || !form.due_date}>Criar Exame</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
