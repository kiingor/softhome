import { Badge } from "@/components/ui/badge";
import { CaretRight } from "@phosphor-icons/react";
import { fmtDate } from "../lib";
import type { FeedbackColaborador } from "../types";

export function ColaboradorFeedbackCard({
  colaborador,
  onClick,
}: {
  colaborador: FeedbackColaborador;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-lg border bg-card px-3 py-2.5 hover:border-primary/50 hover:shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">
          {colaborador.nome ?? `#${colaborador.id}`}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="secondary" title="Feedbacks">
            {colaborador.feedbacks}
          </Badge>
          <CaretRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      {(colaborador.setor || colaborador.empresa) && (
        <p className="text-[11px] text-muted-foreground mt-1 truncate">
          {[colaborador.setor, colaborador.empresa].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {colaborador.dataUltimoFeedback
          ? `Último feedback: ${fmtDate(colaborador.dataUltimoFeedback)}`
          : "Ainda sem feedback"}
      </p>
    </button>
  );
}
