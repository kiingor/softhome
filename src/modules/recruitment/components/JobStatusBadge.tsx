import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, type JobOpeningStatus } from "../types";

interface JobStatusBadgeProps {
  status: JobOpeningStatus;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal border-0", JOB_STATUS_COLORS[status], className)}
    >
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}
