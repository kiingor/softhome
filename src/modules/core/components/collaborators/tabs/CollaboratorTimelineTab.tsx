import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CircleNotch as Loader2, Clock } from "@phosphor-icons/react";

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
  store_change: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  position_change: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  team_change: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  regime_change: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  migration: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
};

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
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Sem eventos registrados.</p>
        <p className="text-xs mt-1">
          Mudanças de loja, cargo, time ou regime aparecem aqui automaticamente.
        </p>
      </div>
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
                  <div className="text-sm text-muted-foreground">
                    {evt.from_value && (
                      <span className="text-foreground/70">
                        De: <code className="text-xs">{JSON.stringify(evt.from_value)}</code>
                      </span>
                    )}
                    {evt.from_value && evt.to_value && <span> → </span>}
                    {evt.to_value && (
                      <span className="text-foreground/70">
                        Para: <code className="text-xs">{JSON.stringify(evt.to_value)}</code>
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
