import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge as BadgeUI } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CircleNotch as Loader2,
  Trophy,
  Calendar,
  CheckCircle,
  Warning,
  Clock,
} from "@phosphor-icons/react";
import { useCollaboratorBadges } from "../hooks/use-collaborator-badges";
import { useJourneyMilestones } from "../hooks/use-journey-milestones";
import {
  BADGE_CATEGORY_LABELS,
  MILESTONE_KIND_LABELS,
  MILESTONE_STATUS_LABELS,
  type JourneyMilestone,
  type JourneyMilestoneStatus,
} from "../types";

export default function CollaboratorJourneyPage() {
  const { id } = useParams<{ id: string }>();
  const { assignments, isLoading: badgesLoading } = useCollaboratorBadges({
    collaboratorId: id,
  });
  const { milestones, isLoading: milestonesLoading, completeMilestone } =
    useJourneyMilestones({ collaboratorId: id });

  const isLoading = badgesLoading || milestonesLoading;

  // Pega name + admission_date a partir dos joins
  const collaboratorInfo = useMemo(() => {
    const fromAssignment = assignments[0]?.collaborator;
    const fromMilestone = milestones[0]?.collaborator;
    if (fromMilestone) {
      return {
        name: fromMilestone.name,
        admission_date: fromMilestone.admission_date,
      };
    }
    if (fromAssignment) {
      return { name: fromAssignment.name, admission_date: null };
    }
    return null;
  }, [assignments, milestones]);

  const milestonesByKind = useMemo(() => {
    const map = new Map<string, JourneyMilestone>();
    for (const m of milestones) map.set(m.kind, m);
    return map;
  }, [milestones]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!collaboratorInfo) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">
          Esse colaborador não tem nada na jornada ainda.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard/jornada">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Link>
        </Button>
      </div>
    );
  }

  const totalBadges = assignments.length;
  const overdueCount = milestones.filter((m) => m.status === "overdue").length;
  const dueCount = milestones.filter((m) => m.status === "due").length;
  const completedCount = milestones.filter((m) => m.status === "completed").length;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/dashboard/jornada">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar pra jornada
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {collaboratorInfo.name}
        </h1>
        <p className="text-muted-foreground">
          {collaboratorInfo.admission_date ? (
            <>
              Admitido em{" "}
              {new Date(collaboratorInfo.admission_date).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </>
          ) : (
            "Sem data de admissão registrada"
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Insígnias" value={totalBadges} icon={Trophy} />
        <StatCard label="Marcos avaliados" value={completedCount} icon={CheckCircle} />
        <StatCard
          label="Pra avaliar"
          value={dueCount}
          icon={Calendar}
          tone={dueCount > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Atrasados"
          value={overdueCount}
          icon={Warning}
          tone={overdueCount > 0 ? "danger" : undefined}
        />
      </div>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marcos da jornada</CardTitle>
        </CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Sem marcos calculados ainda. O snapshot diário cuida disso —
              roda automaticamente todo dia às 03h UTC.
            </p>
          ) : (
            <ul className="space-y-3">
              {(["d30", "d60", "d90", "d180", "annual"] as const).map((kind) => {
                const m = milestonesByKind.get(kind);
                return (
                  <MilestoneRow
                    key={kind}
                    kindLabel={MILESTONE_KIND_LABELS[kind]}
                    milestone={m}
                    onComplete={(notes) =>
                      m && completeMilestone.mutate({ id: m.id, notes })
                    }
                    isCompleting={completeMilestone.isPending}
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Badges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Insígnias conquistadas</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Sem insígnias ainda. Bora reconhecer alguma conquista?
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.map((a) => (
                <li key={a.id} className="py-3 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">
                        {a.badge?.name ?? "(insígnia removida)"}
                      </p>
                      {a.badge && (
                        <BadgeUI variant="outline" className="text-xs font-normal">
                          {BADGE_CATEGORY_LABELS[a.badge.category]}
                        </BadgeUI>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(a.awarded_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {a.notes && <> · {a.notes}</>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function MilestoneRow({
  kindLabel,
  milestone,
  onComplete,
  isCompleting,
}: {
  kindLabel: string;
  milestone: JourneyMilestone | undefined;
  onComplete: (notes?: string) => void;
  isCompleting: boolean;
}) {
  if (!milestone) {
    return (
      <li className="flex items-center gap-3 py-2 text-muted-foreground text-sm">
        <Clock className="w-4 h-4" />
        <span className="font-medium">{kindLabel}</span>
        <span className="text-xs">— ainda não calculado</span>
      </li>
    );
  }

  const tone = STATUS_TONES[milestone.status];
  const Icon = tone.icon;

  return (
    <li
      className={cn(
        "border rounded-md p-3 flex items-start gap-3",
        tone.bg,
        tone.border,
      )}
    >
      <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0", tone.iconBg)}>
        <Icon className={cn("w-4 h-4", tone.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-medium text-foreground">{kindLabel}</p>
            <p className="text-xs text-muted-foreground">
              Vencimento{" "}
              {new Date(milestone.due_date).toLocaleDateString("pt-BR")}
              {" · "}
              {milestone.badges_count}{" "}
              {milestone.badges_count === 1 ? "insígnia" : "insígnias"} até lá
            </p>
          </div>
          <BadgeUI variant="outline" className={cn("text-xs", tone.badgeClass)}>
            {MILESTONE_STATUS_LABELS[milestone.status]}
          </BadgeUI>
        </div>

        {milestone.evaluated_at && (
          <p className="text-xs text-muted-foreground mt-2">
            Avaliado em{" "}
            {new Date(milestone.evaluated_at).toLocaleDateString("pt-BR")}
            {milestone.notes && <> — "{milestone.notes}"</>}
          </p>
        )}

        {milestone.status !== "completed" && milestone.status !== "pending" && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => onComplete()}
            disabled={isCompleting}
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Marcar como avaliado
          </Button>
        )}
      </div>
    </li>
  );
}

const STATUS_TONES: Record<
  JourneyMilestoneStatus,
  {
    icon: typeof CheckCircle;
    iconColor: string;
    iconBg: string;
    bg: string;
    border: string;
    badgeClass: string;
  }
> = {
  pending: {
    icon: Clock,
    iconColor: "text-muted-foreground",
    iconBg: "bg-muted",
    bg: "bg-card",
    border: "border-border",
    badgeClass: "",
  },
  due: {
    icon: Calendar,
    iconColor: "text-amber-700 dark:text-amber-300",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    bg: "bg-amber-50 dark:bg-amber-900/10",
    border: "border-amber-200 dark:border-amber-800",
    badgeClass:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  },
  completed: {
    icon: CheckCircle,
    iconColor: "text-emerald-700 dark:text-emerald-300",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
    bg: "bg-emerald-50 dark:bg-emerald-900/10",
    border: "border-emerald-200 dark:border-emerald-800",
    badgeClass:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  },
  overdue: {
    icon: Warning,
    iconColor: "text-rose-700 dark:text-rose-300",
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
    bg: "bg-rose-50 dark:bg-rose-900/10",
    border: "border-rose-200 dark:border-rose-800",
    badgeClass:
      "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
  },
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Trophy;
  tone?: "warning" | "danger";
}) {
  const valueClass = tone === "danger"
    ? "text-rose-700 dark:text-rose-300"
    : tone === "warning"
    ? "text-amber-700 dark:text-amber-300"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className={cn("text-3xl font-light mt-1", valueClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}
