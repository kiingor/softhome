import { useDraggable } from "@dnd-kit/core";
import { ApplicationCard } from "./ApplicationCard";
import type {
  ApplicationStage,
  CandidateApplicationWithCandidate,
} from "../types";

interface Props {
  application: CandidateApplicationWithCandidate;
  onMoveStage: (stage: ApplicationStage) => void;
  onStartAdmission?: () => void;
}

export function DraggableApplicationCard({
  application,
  onMoveStage,
  onStartAdmission,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: application.id,
    data: { applicationId: application.id, fromStage: application.stage },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-none cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <ApplicationCard
        application={application}
        onMoveStage={onMoveStage}
        onStartAdmission={onStartAdmission}
      />
    </div>
  );
}
