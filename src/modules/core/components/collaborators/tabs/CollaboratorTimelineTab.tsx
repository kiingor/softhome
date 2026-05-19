import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "@phosphor-icons/react";
import { EmptyState } from "@/shared/components/EmptyState";
import { TabContentSkeleton } from "@/shared/components/TabContentSkeleton";

interface Props {
  collaboratorId: string;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  from_value: Record<string, unknown> | null;
  to_value: Record<string, unknown> | null;
  reason: string | null;
  effective_date: string;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  admission: "Admissão",
  termination: "Desligamento",
  reactivation: "Reativação",
  store_change: "Mudou de loja",
  position_change: "Mudou de cargo",
  team_change: "Mudou de time",
  regime_change: "Mudou de regime",
  salary_change: "Mudou de salário",
  migration: "Migrou de empresa",
  manual: "Anotação manual",
};

const EVENT_COLORS: Record<string, string> = {
  admission: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  termination: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  reactivation: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  store_change: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  position_change: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  team_change: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  regime_change: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  migration: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
};

const REGIME_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  estagiario: "Estagiário",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  aguardando_documentacao: "Aguardando documentação",
  validacao_pendente: "Validação pendente",
  reprovado: "Reprovado",
};

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Humaniza o JSON cru de from_value/to_value baseado no tipo de evento.
 * Cada event_type tem um shape conhecido; fallback amigável quando não bate.
 */
function humanizeValue(
  eventType: string,
  raw: Record<string, unknown> | null,
): string {
  if (!raw) return "—";
  const v = raw as Record<string, unknown>;

  switch (eventType) {
    case "store_change":
      return (
        (v.store_name as string) ||
        (v.name as string) ||
        (v.store_code as string) ||
        "—"
      );
    case "position_change":
      return (
        (v.position_name as string) ||
        (v.position as string) ||
        (v.name as string) ||
        "—"
      );
    case "team_change":
      return (v.team_name as string) || (v.name as string) || "—";
    case "regime_change":
      return REGIME_LABELS[v.regime as string] || (v.regime as string) || "—";
    case "salary_change": {
      const n = Number(v.salary ?? v.amount ?? v.value);
      return Number.isFinite(n) ? fmtBRL(n) : "—";
    }
    case "migration":
      return (
        (v.company_name as string) ||
        (v.cnpj as string) ||
        (v.name as string) ||
        "—"
      );
    case "admission":
    case "termination":
    case "reactivation":
      return (
        STATUS_LABELS[v.status as string] || (v.status as string) || "—"
      );
    default: {
      // fallback: junta valores legíveis (string/number) ignorando ids/timestamps
      const parts = Object.entries(v)
        .filter(
          ([k, val]) =>
            !k.endsWith("_id") &&
            !k.endsWith("_at") &&
            (typeof val === "string" || typeof val === "number") &&
            String(val).trim() !== "",
        )
        .map(([, val]) => String(val));
      return parts.length > 0 ? parts.join(" · ") : "—";
    }
  }
}

export function CollaboratorTimelineTab({ collaboratorId }: Props) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["collaborator-timeline", collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_timeline_events")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TimelineEvent[];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <TabContentSkeleton rows={4} />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-8 h-8 text-primary" />}
        title="Histórico ainda em branco"
        description="Mudanças de loja, cargo, time, regime e salário aparecem aqui automaticamente."
      />
    );
  }

  return (
    <div className="space-y-3">
      {events.map((evt) => {
        const label = EVENT_LABELS[evt.event_type] ?? evt.event_type;
        const colorClass =
          EVENT_COLORS[evt.event_type] ??
          "bg-muted text-muted-foreground";
        return (
          <Card key={evt.id} className="card-hover">
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`${colorClass} border-0 text-xs`}>
                    {label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(evt.effective_date).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {(evt.from_value || evt.to_value) && (
                  <div className="text-sm flex items-center gap-1.5 flex-wrap mt-0.5">
                    {evt.from_value && (
                      <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                        {humanizeValue(evt.event_type, evt.from_value)}
                      </span>
                    )}
                    {evt.from_value && evt.to_value && (
                      <span className="text-muted-foreground">→</span>
                    )}
                    {evt.to_value && (
                      <span className="text-foreground font-medium">
                        {humanizeValue(evt.event_type, evt.to_value)}
                      </span>
                    )}
                  </div>
                )}
                {evt.reason && (
                  <p className="text-sm text-muted-foreground mt-1">{evt.reason}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
