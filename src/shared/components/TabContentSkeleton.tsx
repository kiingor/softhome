import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TabContentSkeletonProps {
  rows?: number;
  className?: string;
}

export function TabContentSkeleton({
  rows = 4,
  className,
}: TabContentSkeletonProps) {
  return (
    <div className={cn("space-y-3 min-h-[320px]", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border bg-card p-4 flex items-start gap-3"
        >
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
