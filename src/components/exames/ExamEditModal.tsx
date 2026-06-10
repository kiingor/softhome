import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateFieldBR } from "@/components/ui/date-field-br";
import { useExams, type OccupationalExam } from "@/hooks/useExams";
import { EXAM_TYPE_LABELS, EXAM_STATUS_LABELS } from "@/lib/riskGroupDefaults";

const EXAM_TYPES = Object.keys(EXAM_TYPE_LABELS);
const EXAM_STATUSES = ["pendente", "agendado", "realizado", "cancelado", "arquivado"];

interface ExamEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: OccupationalExam | null;
}

export function ExamEditModal({ open, onOpenChange, exam }: ExamEditModalProps) {
  const { updateExam, isUpdating } = useExams();
  const [form, setForm] = useState({
    exam_type: "",
    status: "",
    due_date: "",
    scheduled_date: "",
    completed_date: "",
    notes: "",
  });

  useEffect(() => {
    if (exam) {
      setForm({
        exam_type: exam.exam_type,
        status: exam.status,
        due_date: exam.due_date ?? "",
        scheduled_date: exam.scheduled_date ?? "",
        completed_date: exam.completed_date ?? "",
        notes: exam.notes ?? "",
      });
    }
  }, [exam]);

  const handleSave = () => {
    if (!exam || !form.due_date) return;
    updateExam(
      {
        id: exam.id,
        exam_type: form.exam_type,
        status: form.status,
        due_date: form.due_date,
        scheduled_date: form.scheduled_date || null,
        completed_date: form.completed_date || null,
        notes: form.notes || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const markedRealizado =
    form.status === "realizado" && exam?.status !== "realizado";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar exame</DialogTitle>
          {exam?.collaborator?.name && (
            <DialogDescription>{exam.collaborator.name}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.exam_type}
                onValueChange={(v) => setForm((p) => ({ ...p, exam_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{EXAM_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{EXAM_STATUS_LABELS[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data limite *</Label>
              <DateFieldBR
                value={form.due_date}
                onChange={(iso) => setForm((p) => ({ ...p, due_date: iso }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Data agendada</Label>
              <DateFieldBR
                value={form.scheduled_date}
                onChange={(iso) => setForm((p) => ({ ...p, scheduled_date: iso }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data de realização</Label>
            <DateFieldBR
              value={form.completed_date}
              onChange={(iso) => setForm((p) => ({ ...p, completed_date: iso }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          {markedRealizado && (
            <p className="text-xs text-muted-foreground">
              Ao salvar como <strong>Realizado</strong>, o próximo exame periódico
              é criado automaticamente pela periodicidade do cargo.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isUpdating || !form.due_date}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
