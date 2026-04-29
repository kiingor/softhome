import { ApplicationCard } from "./ApplicationCard";
import {
  STAGE_LABELS,
  type ApplicationStage,
  type CandidateApplicationWithCandidate,
} from "../types";

interface PipelineColumnProps {
  stage: ApplicationStage;
  applications: CandidateApplicationWithCandidate[];
  onMoveStage: (applicationId: string, stage: ApplicationStage) => void;
  onStartAdmission?: (application: CandidateApplicationWithCandidate) => void;
}

export function PipelineColumn({
  stage,
  applications,
  onMoveStage,
  onStartAdmission,
}: PipelineColumnProps) {
  return (
    <div className="flex flex-col min-w-[260px] w-[260px] bg-muted/40 rounded-lg p-2">
      <div className="flex items-center justify-between mb-2 px-2 pt-1">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {STAGE_LABELS[stage]}
        </h3>
        <span className="text-xs font-medium text-muted-foreground bg-background rounded-full px-2 py-0.5">
          {applications.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto min-h-[200px]">
        {applications.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            —
          </div>
        ) : (
          applications.map((app) => (
            <ApplicationCard
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
