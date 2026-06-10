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
import { DateFieldBR } from "@/components/ui/date-field-br";
import { useExams, type OccupationalExam } from "@/hooks/useExams";

type Mode = "realizar" | "agendar";

interface ExamDateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: OccupationalExam | null;
  mode: Mode;
}

const todayIso = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

export function ExamDateModal({ open, onOpenChange, exam, mode }: ExamDateModalProps) {
  const { updateExam, isUpdating } = useExams();
  const [date, setDate] = useState("");

  useEffect(() => {
    if (open) {
      // Realizar usa hoje como padrão; agendar parte da data agendada existente.
      setDate(
        mode === "realizar"
          ? exam?.completed_date ?? todayIso()
          : exam?.scheduled_date ?? "",
      );
    }
  }, [open, mode, exam]);

  const handleSave = () => {
    if (!exam || !date) return;
    if (mode === "realizar") {
      updateExam(
        { id: exam.id, status: "realizado", completed_date: date },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      updateExam(
        { id: exam.id, status: "agendado", scheduled_date: date },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  const title = mode === "realizar" ? "Realizar exame" : "Agendar exame";
  const label = mode === "realizar" ? "Data de realização" : "Data agendada";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {exam?.collaborator?.name && (
            <DialogDescription>{exam.collaborator.name}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-2">
          <Label>{label}</Label>
          <DateFieldBR value={date} onChange={setDate} />
          {mode === "realizar" && (
            <p className="text-xs text-muted-foreground pt-1">
              O próximo exame periódico é criado automaticamente pela
              periodicidade do cargo.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isUpdating || !date}>
            {mode === "realizar" ? "Confirmar realização" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
