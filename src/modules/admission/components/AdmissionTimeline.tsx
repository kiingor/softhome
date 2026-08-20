import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CircleNotch as Loader2,
  Note,
  CheckCircle,
  Warning,
  XCircle,
  Pencil,
  PaperPlaneRight,
  FileText,
  Trophy,
} from "@phosphor-icons/react";
import { useAdmissionEvents } from "../hooks/use-admission-events";
import {
  journeyNoteSchema,
  type JourneyNoteValues,
} from "../schemas/admission.schema";
import type { AdmissionEventKind } from "../types";

interface AdmissionTimelineProps {
  journeyId: string;
  canAddNote: boolean;
}

const KIND_ICON: Record<AdmissionEventKind, typeof Note> = {
  created: Pencil,
  token_sent: PaperPlaneRight,
  docs_submitted: FileText,
  doc_validated: CheckCircle,
  doc_approved: CheckCircle,
  doc_rejected: Warning,
  exam_scheduled: FileText,
  exam_completed: CheckCircle,
  contract_sent: PaperPlaneRight,
  contract_signed: CheckCircle,
  admitted: Trophy,
  cancelled: XCircle,
  note: Note,
};

const KIND_COLOR: Record<AdmissionEventKind, string> = {
  created: "text-muted-foreground bg-muted",
  token_sent: "text-info bg-info/10 dark:text-info dark:bg-info/15",
  docs_submitted: "text-info bg-info/10 dark:text-info dark:bg-info/15",
  doc_validated: "text-primary bg-primary/10 dark:text-primary dark:bg-primary/15",
  doc_approved: "text-primary bg-primary/10 dark:text-primary dark:bg-primary/15",
  doc_rejected: "text-primary bg-primary/10 dark:text-primary dark:bg-primary/15",
  exam_scheduled: "text-info bg-info/10 dark:text-info dark:bg-info/15",
  exam_completed: "text-cyan-700 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-900/30",
  contract_sent: "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/30",
  contract_signed: "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/30",
  admitted: "text-primary bg-primary/10 dark:text-primary dark:bg-primary/15",
  cancelled: "text-destructive bg-destructive/10 dark:text-destructive dark:bg-destructive/15",
  note: "text-muted-foreground bg-muted",
};

export function AdmissionTimeline({ journeyId, canAddNote }: AdmissionTimelineProps) {
  const { events, isLoading, addNote } = useAdmissionEvents(journeyId);
  const [showNoteInput, setShowNoteInput] = useState(false);

  const form = useForm<JourneyNoteValues>({
    resolver: zodResolver(journeyNoteSchema),
    defaultValues: { message: "" },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    await addNote.mutateAsync(values);
    form.reset();
    setShowNoteInput(false);
  });

  return (
    <div className="space-y-4">
      {canAddNote && (
        <div>
          {!showNoteInput ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNoteInput(true)}
            >
              <Note className="w-4 h-4 mr-2" />
              Adicionar nota
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              <Textarea
                {...form.register("message")}
                placeholder="O que você quer registrar?"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    form.reset();
                    setShowNoteInput(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={addNote.isPending}>
                  {addNote.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Adicionar
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem eventos registrados.
        </p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => {
            const Icon = KIND_ICON[event.kind] ?? Note;
            return (
              <li key={event.id} className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    KIND_COLOR[event.kind] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-sm text-foreground">
                    {event.message ?? `Evento: ${event.kind}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(event.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
