import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  columns: number;
  rows?: number;
  showHeader?: boolean;
}

export function TableSkeleton({
  columns,
  rows = 5,
  showHeader = true,
}: TableSkeletonProps) {
  return (
    <Table>
      {showHeader && (
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex} className="animate-pulse">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton
                  className="h-4"
                  style={{
                    width: `${Math.floor(Math.random() * 40) + 60}%`,
                    animationDelay: `${rowIndex * 100}ms`,
                  }}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface CardSkeletonProps {
  lines?: number;
}

export function CardSkeleton({ lines = 3 }: CardSkeletonProps) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{
            width: `${Math.floor(Math.random() * 30) + 60}%`,
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3 rounded-lg border border-border animate-pulse"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}
