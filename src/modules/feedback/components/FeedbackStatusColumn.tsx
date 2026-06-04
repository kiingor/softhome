import { cn } from "@/lib/utils";
import { ColaboradorFeedbackCard } from "./ColaboradorFeedbackCard";
import { FEEDBACK_STATUS_META, type FeedbackColaborador, type FeedbackStatus } from "../types";

export function FeedbackStatusColumn({
  status,
  colaboradores,
  onSelect,
}: {
  status: FeedbackStatus;
  colaboradores: FeedbackColaborador[];
  onSelect: (c: FeedbackColaborador) => void;
}) {
  const meta = FEEDBACK_STATUS_META[status];

  return (
    <div className="flex flex-col min-w-[280px] flex-1 rounded-lg bg-muted/40 p-2">
      <div className="flex items-center justify-between mb-1 px-2 pt-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />
          <h3 className={cn("text-xs font-semibold uppercase tracking-wide", meta.headerClass)}>
            {meta.label}
          </h3>
        </div>
        <span className={cn("text-xs font-medium rounded-full px-2 py-0.5", meta.countClass)}>
          {colaboradores.length}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground px-2 mb-2">{meta.description}</p>
      <div className="flex-1 space-y-2 overflow-y-auto min-h-[160px] max-h-[60vh] pr-1">
        {colaboradores.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">Ninguém por aqui</div>
        ) : (
          colaboradores.map((c) => (
            <ColaboradorFeedbackCard key={c.id} colaborador={c} onClick={() => onSelect(c)} />
          ))
        )}
      </div>
    </div>
  );
}
