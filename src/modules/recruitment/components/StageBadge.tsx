import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, STAGE_COLORS, type ApplicationStage } from "../types";

interface StageBadgeProps {
  stage: ApplicationStage;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal border-0", STAGE_COLORS[stage], className)}
    >
      {STAGE_LABELS[stage]}
    </Badge>
  );
}
