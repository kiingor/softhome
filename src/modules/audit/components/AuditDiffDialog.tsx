import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  diffFields,
  formatValue,
  ACTION_LABELS,
  ACTION_COLORS,
} from "../lib/audit-formatters";
import {
  columnLabel,
  tableLabel,
  NOISE_COLUMNS,
} from "../lib/audit-labels";
import type { AuditLogRowWithUser } from "../hooks/use-audit-log";

interface Props {
  row: AuditLogRowWithUser | null;
  onOpenChange: (open: boolean) => void;
}

export function AuditDiffDialog({ row, onOpenChange }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  if (!row) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>—</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const dt = new Date(row.created_at);
  const diff = diffFields(row.before, row.after, NOISE_COLUMNS);
  const insertedFields =
    row.action === "insert" && row.after
      ? Object.entries(row.after)
          .filter(([k]) => !NOISE_COLUMNS.has(k))
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
      : [];

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`border-0 text-xs ${ACTION_COLORS[row.action] ?? ""}`}
            >
              {ACTION_LABELS[row.action] ?? row.action}
            </Badge>
            <span>{tableLabel(row.table_name)}</span>
            <span className="text-xs text-muted-foreground font-mono ml-1">
              #{row.record_id.slice(0, 8)}
            </span>
          </DialogTitle>
          <DialogDescription>
            {row.user_name ?? row.user_email ?? "(sem usuário)"} ·{" "}
            {dt.toLocaleString("pt-BR")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mr-3 pr-3">
          {!showRaw && (
            <div className="space-y-2">
              {row.action === "insert" && (
                <>
                  {insertedFields.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Sem campos preenchidos.
                    </p>
                  )}
                  {insertedFields.map(([col, val]) => (
                    <div
                      key={col}
                      className="grid grid-cols-3 gap-3 text-sm py-1.5 border-b border-border last:border-0"
                    >
                      <span className="text-muted-foreground truncate">
                        {columnLabel(row.table_name, col)}
                      </span>
                      <span className="col-span-2 break-words text-foreground">
                        {formatValue(col, val)}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {row.action === "delete" && (
                <p className="text-sm text-rose-700 dark:text-rose-300">
                  Registro removido. Veja o estado anterior em "Ver JSON
                  completo".
                </p>
              )}

              {row.action === "update" && (
                <>
                  {diff.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Sem alterações detectadas (apenas campos técnicos).
                    </p>
                  )}
                  {diff.map((d) => (
                    <div
                      key={d.column}
                      className="grid grid-cols-3 gap-3 text-sm py-1.5 border-b border-border last:border-0"
                    >
                      <span className="text-muted-foreground truncate">
                        {columnLabel(row.table_name, d.column)}
                      </span>
                      <span className="col-span-2 break-words">
                        <span className="text-rose-700 dark:text-rose-300 line-through decoration-rose-300/60">
                          {formatValue(d.column, d.before)}
                        </span>
                        <span className="text-muted-foreground mx-2">→</span>
                        <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                          {formatValue(d.column, d.after)}
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {showRaw && (
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Antes
                </p>
                <pre className="bg-muted p-3 rounded overflow-auto max-h-[50vh]">
                  {row.before
                    ? JSON.stringify(row.before, null, 2)
                    : "(não havia)"}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Depois
                </p>
                <pre className="bg-muted p-3 rounded overflow-auto max-h-[50vh]">
                  {row.after
                    ? JSON.stringify(row.after, null, 2)
                    : "(removido)"}
                </pre>
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRaw((s) => !s)}
            className="text-xs"
          >
            {showRaw ? "Ver mudanças" : "Ver JSON completo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
