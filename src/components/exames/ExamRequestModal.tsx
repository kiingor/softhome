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

interface ExamRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ExamRequestModal = ({ open, onOpenChange }: ExamRequestModalProps) => {
  const { currentCompany } = useDashboard();
  const { createExam, isCreating } = useExams();
  const [form, setForm] = useState({
    collaborator_id: "",
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
    createExam(
      {
        collaborator_id: form.collaborator_id,
        exam_type: "avulso",
        due_date: form.due_date,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setForm({ collaborator_id: "", due_date: "", notes: "" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Novo Exame Avulso
            <Badge variant="secondary">Avulso</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
