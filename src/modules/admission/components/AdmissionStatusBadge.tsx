import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  JOURNEY_STATUS_LABELS,
  JOURNEY_STATUS_COLORS,
  type AdmissionJourneyStatus,
} from "../types";

interface AdmissionStatusBadgeProps {
  status: AdmissionJourneyStatus;
  className?: string;
}

export function AdmissionStatusBadge({ status, className }: AdmissionStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal border-0",
        JOURNEY_STATUS_COLORS[status],
        className
      )}
    >
      {JOURNEY_STATUS_LABELS[status]}
    </Badge>
  );
}
