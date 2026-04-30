import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge as BadgeUI } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, CircleNotch as Loader2, Plus, MagnifyingGlass as Search, Gear as Settings, Trophy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useBadges } from "../hooks/use-badges";
import { useCollaboratorBadges } from "../hooks/use-collaborator-badges";
import { BadgeAssignmentForm } from "../components/BadgeAssignmentForm";
import { BADGE_CATEGORY_LABELS } from "../types";
import type { BadgeAssignmentValues } from "../schemas/badge.schema";
import {
  exportJourneyExcel,
  exportJourneyPDF,
} from "../services/journey-export.service";
import { useDashboard } from "@/contexts/DashboardContext";

export default function JornadaPage() {
  const { currentCompany } = useDashboard();
  const { badges, isLoading: badgesLoading } = useBadges();
  const { assignments, isLoading: assignmentsLoading, assignBadge } =
    useCollaboratorBadges();
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Agrupa atribuições por colaborador
  const collaboratorRows = useMemo(() => {
    const byCollab = new Map<
      string,
      { id: string; name: string; count: number; latest: string }
    >();
    for (const a of assignments) {
      const key = a.collaborator_id;
      const name = a.collaborator?.name ?? "(sem nome)";
      const existing = byCollab.get(key);
      if (existing) {
        existing.count += 1;
        if (a.awarded_at > existing.latest) existing.latest = a.awarded_at;
      } else {
        byCollab.set(key, { id: key, name, count: 1, latest: a.awarded_at });
      }
    }
    const list = Array.from(byCollab.values());
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.count - a.count);
  }, [assignments, search]);

  const handleAssign = async (values: BadgeAssignmentValues) => {
    await assignBadge.mutateAsync(values);
    setIsAssignOpen(false);
  };

  // Lista de colaboradores derivada das próprias atribuições (já vêm
  // com join de collaborators no useCollaboratorBadges).
  const collaboratorsForExport = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const a of assignments) {
      if (!seen.has(a.collaborator_id)) {
        seen.set(a.collaborator_id, {
          id: a.collaborator_id,
          name: a.collaborator?.name ?? "(sem nome)",
        });
      }
    }
    return Array.from(seen.values());
  }, [assignments]);

  const companyName = currentCompany?.company_name ?? "SoftHouse";
  const canExport = assignments.length > 0;

  const handleExportExcel = () => {
    try {
      exportJourneyExcel(assignments, badges, collaboratorsForExport, companyName);
      toast.success("Pronto ✓");
    } catch {
      toast.error("Não rolou. Tenta de novo?");
    }
  };

  const handleExportPDF = () => {
    try {
      exportJourneyPDF(assignments, badges, collaboratorsForExport, companyName);
      toast.success("Pronto ✓");
    } catch {
      toast.error("Não rolou. Tenta de novo?");
    }
  };

  // Estatísticas leves
  const totalBadges = badges.length;
  const activeBadges = badges.filter((b) => b.is_active).length;
  const totalAwards = assignments.length;
  const peopleWithBadges = collaboratorRows.length;

  const isLoading = badgesLoading || assignmentsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jornada de Conhecimento</h1>
          <p className="text-muted-foreground">
            Acompanhe as conquistas do time.
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!canExport}>
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleExportExcel}
                disabled={!canExport}
              >
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportPDF}
                disabled={!canExport}
              >
                PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild variant="outline">
            <Link to="/dashboard/jornada/badges">
              <Settings className="w-4 h-4 mr-2" />
              Catálogo
            </Link>
          </Button>
          <Button onClick={() => setIsAssignOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Atribuir insígnia
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Insígnias no catálogo" value={totalBadges} hint={`${activeBadges} ativas`} />
        <StatCard label="Atribuições totais" value={totalAwards} />
        <StatCard label="Pessoas reconhecidas" value={peopleWithBadges} />
        <StatCard
          label="Categorias"
          value={Object.keys(BADGE_CATEGORY_LABELS).length}
          hint="técnica, comportamental..."
        />
      </div>

      {/* Recent awards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Conquistas recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                Ninguém conquistou insígnia ainda. Bora reconhecer alguém?
              </p>
              <Button onClick={() => setIsAssignOpen(true)} disabled={activeBadges === 0}>
                <Plus className="w-4 h-4 mr-2" />
                {activeBadges === 0 ? "Cadastra uma insígnia primeiro" : "Atribuir agora"}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.slice(0, 10).map((a) => (
                <li key={a.id} className="py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {a.collaborator?.name ?? "(sem nome)"}
                      <span className="font-normal text-muted-foreground"> ganhou </span>
                      {a.badge?.name ?? "(insígnia removida)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.awarded_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {a.badge && (
                        <>
                          {" · "}
                          <span>{BADGE_CATEGORY_LABELS[a.badge.category]}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Per collaborator */}
      <Card>
        <CardHeader>
          <CardTitle>Por colaborador</CardTitle>
          <div className="relative max-w-sm mt-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar pelo nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {collaboratorRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? "Ninguém com esse nome encontrado." : "Sem dados ainda."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {collaboratorRows.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/dashboard/jornada/colaborador/${c.id}`}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Última conquista{" "}
                        {new Date(c.latest).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <BadgeUI variant="secondary" className="shrink-0">
                      {c.count} {c.count === 1 ? "insígnia" : "insígnias"}
                    </BadgeUI>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <BadgeAssignmentForm
        open={isAssignOpen}
        onOpenChange={setIsAssignOpen}
        onSubmit={handleAssign}
        isSubmitting={assignBadge.isPending}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-light text-foreground mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
