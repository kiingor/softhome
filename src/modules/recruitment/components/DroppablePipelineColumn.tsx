import { useDroppable } from "@dnd-kit/core";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DraggableApplicationCard } from "./DraggableApplicationCard";
import {
  STAGE_LABELS,
  type ApplicationStage,
  type CandidateApplicationWithCandidate,
} from "../types";

interface Props {
  stage: ApplicationStage;
  applications: CandidateApplicationWithCandidate[];
  onMoveStage: (applicationId: string, stage: ApplicationStage) => void;
  onStartAdmission?: (application: CandidateApplicationWithCandidate) => void;
  onRemoveStage?: () => void;
  canRemove?: boolean;
}

export function DroppablePipelineColumn({
  stage,
  applications,
  onMoveStage,
  onStartAdmission,
  onRemoveStage,
  canRemove,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage:${stage}`,
    data: { stage },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[260px] w-[260px] rounded-lg p-2 transition-colors ${
        isOver ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between mb-2 px-2 pt-1 group">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
          {STAGE_LABELS[stage]}
        </h3>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground bg-background rounded-full px-2 py-0.5">
            {applications.length}
          </span>
          {canRemove && onRemoveStage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
              onClick={onRemoveStage}
              title="Remover etapa"
            >
              <Trash className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto min-h-[420px]">
        {applications.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            —
          </div>
        ) : (
          applications.map((app) => (
            <DraggableApplicationCard
              key={app.id}
              application={app}
              onMoveStage={(s) => onMoveStage(app.id, s)}
              onStartAdmission={
                onStartAdmission ? () => onStartAdmission(app) : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
