import { useMemo } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  CurrencyDollar as DollarSign,
  TrendUp as TrendingUp,
  UserPlus,
  Briefcase,
  Gift,
  Cake,
  Stethoscope,
  Airplane as Vacation,
  Buildings as Building2,
  Warning,
  CheckCircle,
  Clock,
  CalendarBlank as CalendarIcon,
  ArrowRight,
  Bell,
  Sparkle,
  IdentificationCard,
  ChartBar,
  FileText,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  format,
  parseISO,
  differenceInDays,
  addDays,
  startOfDay,
  setYear,
  isWithinInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMultiplePermissions } from "@/hooks/useMultiplePermissions";
import { ModuleType } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Devolve a próxima ocorrência do aniversário a partir de hoje. */
function nextBirthday(birthIso: string, today: Date): Date {
  const birth = parseISO(birthIso);
  let next = setYear(birth, today.getFullYear());
  if (next < startOfDay(today)) next = setYear(birth, today.getFullYear() + 1);
  return next;
}

/** "Hoje", "Amanhã", "em N dias" — string curta pra timeline */
function daysLeftLabel(date: Date, today: Date): string {
  const d = differenceInDays(startOfDay(date), startOfDay(today));
  if (d === 0) return "Hoje";
  if (d === 1) return "Amanhã";
  if (d < 0) return `há ${Math.abs(d)} ${Math.abs(d) === 1 ? "dia" : "dias"}`;
  return `em ${d} dias`;
}

// Admissões "em andamento" — qualquer status que não é admitido nem cancelado
const ADMISSION_IN_PROGRESS_STATUSES = [
  "created",
  "tests_pending",
  "tests_in_review",
  "docs_pending",
  "docs_in_review",
  "docs_needs_adjustment",
  "docs_approved",
  "exam_scheduled",
  "exam_done",
  "contract_signed",
];

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares dos cards
// ─────────────────────────────────────────────────────────────────────────────

type AlertPriority = "critical" | "warn" | "info" | "ok";

interface DashAlert {
  id: string;
  priority: AlertPriority;
  icon: React.ComponentType<{ className?: string; weight?: "regular" | "fill" }>;
  title: string;
  desc: string;
  cta?: { label: string; route: string };
}

type TimelineKind = "ferias" | "exame" | "admissao" | "aniversario" | "folha";

interface TimelineEntry {
  id: string;
  date: Date;
  kind: TimelineKind;
  title: string;
  subtitle: string;
}

const TIMELINE_KIND_META: Record<
  TimelineKind,
  { icon: React.ComponentType<{ className?: string; weight?: "regular" | "fill" }>; bg: string; fg: string }
> = {
  ferias: { icon: Vacation, bg: "bg-emerald-100 dark:bg-emerald-950/40", fg: "text-emerald-700 dark:text-emerald-300" },
  exame: { icon: Stethoscope, bg: "bg-amber-100 dark:bg-amber-950/40", fg: "text-amber-700 dark:text-amber-300" },
  admissao: { icon: UserPlus, bg: "bg-primary/15", fg: "text-primary" },
  aniversario: { icon: Cake, bg: "bg-pink-100 dark:bg-pink-950/40", fg: "text-pink-600 dark:text-pink-300" },
  folha: { icon: DollarSign, bg: "bg-blue-100 dark:bg-blue-950/40", fg: "text-blue-700 dark:text-blue-300" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

const DashboardHome = () => {
  const { profile, currentCompany } = useDashboard();
  const navigate = useNavigate();
  const today = startOfDay(new Date());
  const horizon = addDays(today, 30);

  const { canViewModule, isLoading: permissionsLoading, isAdmin } = useMultiplePermissions([
    "colaboradores",
    "folha",
    "relatorios",
    "beneficios",
    "setores",
    "cargos",
    "empresas",
    "ferias",
    "exames",
  ] as ModuleType[]);

  const hasAnyManagementPermission =
    isAdmin ||
    canViewModule("colaboradores") ||
    canViewModule("folha") ||
    canViewModule("relatorios");

  // ───── Queries ─────

  const { data: collaborators = [], isLoading: loadingCollaborators } = useQuery({
    queryKey: ["dashboard-collaborators", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name, status, position_id, store_id, team_id, admission_date, birth_date")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["dashboard-teams", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, is_active")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  const { data: payrollEntries = [], isLoading: loadingPayroll } = useQuery({
    queryKey: ["dashboard-payroll", currentCompany?.id, today.getMonth(), today.getFullYear()],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("id, value, type")
        .eq("company_id", currentCompany.id)
        .eq("month", today.getMonth() + 1)
        .eq("year", today.getFullYear());
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Férias dos próximos 30 dias
  const { data: vacations = [] } = useQuery({
    queryKey: ["dashboard-vacations", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("vacation_periods")
        .select("id, start_date, end_date, status, collaborator_id, collaborators(name)")
        .eq("company_id", currentCompany.id)
        .gte("start_date", format(today, "yyyy-MM-dd"))
        .lte("start_date", format(horizon, "yyyy-MM-dd"))
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Exames a vencer nos próximos 30 dias (pendentes) — só futuros, não vencidos
  const { data: exams = [] } = useQuery({
    queryKey: ["dashboard-exams", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("occupational_exams")
        .select("id, due_date, exam_type, status, collaborator_id, collaborators(name)")
        .eq("company_id", currentCompany.id)
        .neq("status", "realizado")
        .gte("due_date", format(today, "yyyy-MM-dd"))
        .lte("due_date", format(horizon, "yyyy-MM-dd"))
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Exames vencidos (pra mostrar como alerta crítico separado)
  const { data: overdueExams = [] } = useQuery({
    queryKey: ["dashboard-exams-overdue", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("occupational_exams")
        .select("id, due_date, exam_type, status, collaborator_id, collaborators(name)")
        .eq("company_id", currentCompany.id)
        .neq("status", "realizado")
        .lt("due_date", format(today, "yyyy-MM-dd"))
        .order("due_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Admissões em andamento (qualquer status pré-admissão)
  const { data: admissions = [] } = useQuery({
    queryKey: ["dashboard-admissions", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("admission_journeys")
        .select("id, candidate_name, status, created_at, token_expires_at, position_id")
        .eq("company_id", currentCompany.id)
        .in("status", ADMISSION_IN_PROGRESS_STATUSES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Vagas abertas no funil
  const { data: jobOpenings = [] } = useQuery({
    queryKey: ["dashboard-job-openings", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("job_openings")
        .select("id, title, status, vacancies_count, opened_at")
        .eq("company_id", currentCompany.id)
        .eq("status", "open");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  const isLoading = permissionsLoading || loadingCollaborators || loadingPayroll;

  // ───── Métricas derivadas ─────

  const activeCollaborators = collaborators.filter((c) => c.status === "ativo").length;

  // Novos colaboradores nos últimos 30 dias (proxy de "vs. mês anterior")
  const newCollaboratorsLast30 = collaborators.filter((c) => {
    if (!c.admission_date) return false;
    const d = parseISO(c.admission_date);
    return differenceInDays(today, d) >= 0 && differenceInDays(today, d) <= 30;
  }).length;

  const totalPayroll = payrollEntries.reduce((sum, e) => {
    const v = Number(e.value);
    // Descontos entram com sinal negativo no totalizador
    return sum + (e.type === "desconto" ? -v : v);
  }, 0);

  // Próximos aniversariantes (até 30 dias)
  const upcomingBirthdays = useMemo(() => {
    return collaborators
      .filter((c) => c.status === "ativo" && c.birth_date)
      .map((c) => {
        const next = nextBirthday(c.birth_date!, today);
        return { collab: c, date: next, days: differenceInDays(next, today) };
      })
      .filter((b) => b.days >= 0 && b.days <= 30)
      .sort((a, b) => a.days - b.days);
  }, [collaborators, today]);

  // Headcount por setor (teams)
  const headcountByTeam = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const t of teams) {
      map.set(t.id, { name: t.name, count: 0 });
    }
    let semSetor = 0;
    for (const c of collaborators) {
      if (c.status !== "ativo") continue;
      if (c.team_id && map.has(c.team_id)) {
        map.get(c.team_id)!.count += 1;
      } else {
        semSetor += 1;
      }
    }
    const rows = Array.from(map.values())
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    if (semSetor > 0) rows.push({ name: "Sem setor definido", count: semSetor });
    return rows;
  }, [collaborators, teams]);

  const maxTeamCount = headcountByTeam[0]?.count ?? 1;

  // Exames críticos (até 7 dias) vs atenção (8-30 dias)
  const examsCritical = useMemo(
    () => exams.filter((e) => differenceInDays(parseISO(e.due_date), today) <= 7),
    [exams, today],
  );

  // Aniversariantes hoje
  const birthdaysToday = upcomingBirthdays.filter((b) => b.days === 0);
  // Aniversariantes esta semana (próx 7 dias incluindo hoje)
  const birthdaysThisWeek = upcomingBirthdays.filter((b) => b.days <= 7);

  // ───── Alertas dinâmicos ─────
  const alerts = useMemo<DashAlert[]>(() => {
    const list: DashAlert[] = [];

    // Crítico: exames já vencidos
    if (overdueExams.length > 0) {
      list.push({
        id: "exams-overdue",
        priority: "critical",
        icon: Warning,
        title: `${overdueExams.length} exame${overdueExams.length === 1 ? "" : "s"} vencido${
          overdueExams.length === 1 ? "" : "s"
        }`,
        desc: "Exames com prazo expirado — agendar imediatamente pra regularizar.",
        cta: { label: "Ver exames", route: "/dashboard/exames" },
      });
    }

    // Crítico: exames vencendo em <= 7 dias
    if (examsCritical.length > 0) {
      const names = examsCritical
        .slice(0, 2)
        .map((e) => (e.collaborators as { name: string } | null)?.name ?? "—")
        .join(" e ");
      list.push({
        id: "exams-critical",
        priority: "critical",
        icon: Warning,
        title: `${examsCritical.length} exame${examsCritical.length === 1 ? "" : "s"} vence${
          examsCritical.length === 1 ? "" : "m"
        } em até 7 dias`,
        desc: examsCritical.length <= 2 ? names : `${names} e mais ${examsCritical.length - 2}`,
        cta: { label: "Ver exames", route: "/dashboard/exames" },
      });
    }

    // Atenção: exames vencendo em 8-30 dias (só se não tiver crítico ou pra reforçar)
    const examsWarn = exams.filter((e) => {
      const d = differenceInDays(parseISO(e.due_date), today);
      return d > 7 && d <= 30;
    });
    if (examsWarn.length > 0) {
      list.push({
        id: "exams-warn",
        priority: "warn",
        icon: Stethoscope,
        title: `${examsWarn.length} exame${examsWarn.length === 1 ? "" : "s"} a vencer nos próximos 30 dias`,
        desc: "Programe agendamentos pra não ficar no limite.",
        cta: { label: "Ver exames", route: "/dashboard/exames" },
      });
    }

    // Atenção: admissões há mais de 5 dias sem progressão
    const admissionsStuck = admissions.filter((a) => {
      const d = differenceInDays(today, parseISO(a.created_at));
      return d >= 5 && ["docs_pending", "tests_pending", "docs_needs_adjustment"].includes(a.status);
    });
    if (admissionsStuck.length > 0) {
      list.push({
        id: "admissions-stuck",
        priority: "warn",
        icon: IdentificationCard,
        title: `${admissionsStuck.length} admissã${
          admissionsStuck.length === 1 ? "o parada" : "ões paradas"
        } há mais de 5 dias`,
        desc: "Candidatos podem perder o engajamento. Reabrir ou cobrar pendência.",
        cta: { label: "Ver admissões", route: "/dashboard/admissoes" },
      });
    }

    // Atenção: férias começando em <= 7 dias
    const vacSoon = vacations.filter(
      (v) => differenceInDays(parseISO(v.start_date), today) <= 7,
    );
    if (vacSoon.length > 0) {
      const names = vacSoon
        .slice(0, 2)
        .map((v) => (v.collaborators as { name: string } | null)?.name ?? "—")
        .join(", ");
      list.push({
        id: "vacations-soon",
        priority: "info",
        icon: Vacation,
        title: `${vacSoon.length} colaborador${vacSoon.length === 1 ? "" : "es"} entr${
          vacSoon.length === 1 ? "a" : "am"
        } de férias esta semana`,
        desc: vacSoon.length <= 2 ? names : `${names} e mais ${vacSoon.length - 2}`,
        cta: { label: "Ver férias", route: "/dashboard/ferias" },
      });
    }

    // Info: aniversariantes hoje
    if (birthdaysToday.length > 0) {
      const names = birthdaysToday.map((b) => b.collab.name.split(" ")[0]).join(", ");
      list.push({
        id: "birthdays-today",
        priority: "info",
        icon: Cake,
        title: `${birthdaysToday.length} aniversariante${
          birthdaysToday.length === 1 ? "" : "s"
        } hoje`,
        desc: names,
      });
    }

    // Folha: aviso se passamos do dia 20 e ainda tem zero entries
    const dayOfMonth = today.getDate();
    if (dayOfMonth >= 20 && payrollEntries.length === 0 && activeCollaborators > 0) {
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const daysLeft = differenceInDays(endOfMonth, today);
      list.push({
        id: "payroll-empty",
        priority: "warn",
        icon: DollarSign,
        title: "Folha do mês ainda não foi iniciada",
        desc: `${daysLeft} dia${daysLeft === 1 ? "" : "s"} até o fim do mês.`,
        cta: { label: "Ir para folha", route: "/dashboard/folha" },
      });
    }

    // Ok: tudo em dia (só mostra se lista está vazia)
    if (list.length === 0 && !isLoading) {
      list.push({
        id: "all-good",
        priority: "ok",
        icon: CheckCircle,
        title: "Tudo em dia",
        desc: "Sem alertas pendentes neste momento.",
      });
    }

    return list;
  }, [exams, examsCritical, overdueExams, admissions, vacations, birthdaysToday, payrollEntries, activeCollaborators, today, isLoading]);

  // ───── Timeline próximos 30 dias ─────
  // Estratégia: priorizar operacional (férias, exames, folha) e adicionar
  // aniversariantes só pra completar o espaço (máx 2 entradas), pra não
  // dominar a lista quando tem muito colab.
  const timeline = useMemo<TimelineEntry[]>(() => {
    const operational: TimelineEntry[] = [];

    for (const v of vacations) {
      operational.push({
        id: `vac-${v.id}`,
        date: parseISO(v.start_date),
        kind: "ferias",
        title: `Férias: ${(v.collaborators as { name: string } | null)?.name ?? "—"}`,
        subtitle: `${differenceInDays(parseISO(v.end_date), parseISO(v.start_date)) + 1} dias`,
      });
    }

    for (const e of exams) {
      operational.push({
        id: `exam-${e.id}`,
        date: parseISO(e.due_date),
        kind: "exame",
        title: `Exame ${e.exam_type ?? "ocupacional"}: ${
          (e.collaborators as { name: string } | null)?.name ?? "—"
        }`,
        subtitle: "Vencimento previsto",
      });
    }

    // Folha: dia 25 do mês corrente é o "marco" sugerido
    const folhaDate = new Date(today.getFullYear(), today.getMonth(), 25);
    if (
      isWithinInterval(folhaDate, { start: today, end: horizon }) &&
      activeCollaborators > 0
    ) {
      operational.push({
        id: "folha-fechamento",
        date: folhaDate,
        kind: "folha",
        title: "Fechamento sugerido da folha",
        subtitle: `Competência ${format(today, "MMMM/yyyy", { locale: ptBR })}`,
      });
    }

    // Aniversariantes — só os próximos 2 pra não dominar
    const birthdayEntries: TimelineEntry[] = upcomingBirthdays.slice(0, 2).map((b) => ({
      id: `bday-${b.collab.id}`,
      date: b.date,
      kind: "aniversario",
      title: `Aniversário: ${b.collab.name}`,
      subtitle: format(b.date, "dd 'de' MMMM", { locale: ptBR }),
    }));

    return [...operational, ...birthdayEntries]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 8);
  }, [vacations, exams, upcomingBirthdays, today, horizon, activeCollaborators]);

  // ───── KPIs ─────
  const kpis = [
    {
      id: "active",
      label: "Colaboradores ativos",
      value: activeCollaborators.toString(),
      icon: Users,
      featured: true,
      meta:
        newCollaboratorsLast30 > 0 ? (
          <span>
            <span className="text-emerald-500 font-semibold">+{newCollaboratorsLast30}</span> nos últimos 30 dias
          </span>
        ) : (
          <span>sem novas admissões em 30 dias</span>
        ),
      route: "/dashboard/colaboradores",
    },
    {
      id: "admissions",
      label: "Admissões em andamento",
      value: admissions.length.toString(),
      icon: IdentificationCard,
      meta: admissions.length > 0 ? "Acompanhar pendências" : "Nenhuma em curso",
      route: "/dashboard/admissoes",
    },
    {
      id: "vacations",
      label: "Férias próximos 30 dias",
      value: vacations.length.toString(),
      icon: Vacation,
      meta:
        vacations.filter((v) => v.status === "pendente").length > 0
          ? `${vacations.filter((v) => v.status === "pendente").length} aguardando aprovação`
          : "Sem pendências de aprovação",
      route: "/dashboard/ferias",
    },
    {
      id: "exams",
      label: "Exames a vencer",
      value: exams.length.toString(),
      icon: Stethoscope,
      meta:
        examsCritical.length > 0 ? (
          <span className="text-amber-600 dark:text-amber-400 font-semibold">
            {examsCritical.length} crítico{examsCritical.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span>nenhum crítico</span>
        ),
      route: "/dashboard/exames",
    },
    {
      id: "openings",
      label: "Vagas abertas",
      value: jobOpenings.length.toString(),
      icon: Briefcase,
      meta: `${jobOpenings.reduce((s, j) => s + (j.vacancies_count ?? 1), 0)} posiçã${
        jobOpenings.reduce((s, j) => s + (j.vacancies_count ?? 1), 0) === 1 ? "o" : "ões"
      } no funil`,
      route: "/dashboard/vagas",
    },
    {
      id: "payroll",
      label: `Folha ${format(today, "MMMM", { locale: ptBR })}`,
      value:
        totalPayroll >= 1000
          ? `R$ ${(totalPayroll / 1000).toLocaleString("pt-BR", {
              maximumFractionDigits: 0,
            })}k`
          : `R$ ${totalPayroll.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
      icon: DollarSign,
      meta: payrollEntries.length > 0 ? `${payrollEntries.length} lançamentos` : "Folha vazia",
      route: "/dashboard/folha",
    },
  ];

  // ───── Quick actions ─────
  const allQuickActions = !hasAnyManagementPermission
    ? [
        { label: "Meus Documentos", icon: FileText, action: () => navigate("/colaborador/contracheques"), module: null },
        { label: "Meus Benefícios", icon: Gift, action: () => navigate("/colaborador/beneficios"), module: null },
      ]
    : [
        {
          label: "Nova admissão",
          icon: UserPlus,
          action: () => navigate("/dashboard/admissoes"),
          module: "colaboradores" as ModuleType,
          primary: true,
        },
        { label: "Lançar férias", icon: Vacation, action: () => navigate("/dashboard/ferias"), module: "ferias" as ModuleType },
        { label: "Abrir vaga", icon: Briefcase, action: () => navigate("/dashboard/vagas"), module: "colaboradores" as ModuleType },
        { label: "Relatórios", icon: ChartBar, action: () => navigate("/dashboard/relatorios"), module: "relatorios" as ModuleType },
      ];

  const quickActions = allQuickActions.filter((action) => {
    if (action.module === null) return true;
    if (isAdmin) return true;
    return canViewModule(action.module);
  });

  const totalAttentionCount = alerts.filter(
    (a) => a.priority === "critical" || a.priority === "warn",
  ).length;

  // ───── Loading skeleton ─────
  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <div className="h-9 w-64 bg-muted rounded animate-pulse mb-2" />
          <div className="h-5 w-80 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="border border-border">
              <CardContent className="p-4">
                <div className="h-8 w-8 rounded-lg bg-muted animate-pulse mb-3" />
                <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
                <div className="h-7 w-12 bg-muted rounded animate-pulse mb-1" />
                <div className="h-3 w-24 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <TableSkeleton columns={4} rows={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ───── Welcome ───── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 animate-slide-up">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            {getGreeting()}
            {profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
            <span className="text-primary"> 👋</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-3 flex-wrap">
            <span className="capitalize">
              {format(today, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
            {totalAttentionCount > 0 && (
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 gap-1.5"
              >
                <Bell className="w-3 h-3" weight="fill" />
                {totalAttentionCount} açã{totalAttentionCount === 1 ? "o requer" : "ões requerem"} sua atenção
              </Badge>
            )}
          </p>
        </div>
      </div>

      {/* ───── KPI Row ───── */}
      {hasAnyManagementPermission && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((kpi, idx) => (
            <Card
              key={kpi.id}
              onClick={() => navigate(kpi.route)}
              className={cn(
                "border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 animate-scale-in",
                kpi.featured
                  ? "bg-primary/5 border-primary/30 hover:border-primary/50 hover:shadow-soft"
                  : "border-border hover:border-primary/30 hover:shadow-soft",
              )}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <CardContent className="p-4">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center mb-3",
                    kpi.featured ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  <kpi.icon className="w-[18px] h-[18px]" weight="regular" />
                </div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="text-2xl font-bold leading-none mb-1.5 text-foreground">
                  {kpi.value}
                </p>
                <p className="text-[11px] text-muted-foreground">{kpi.meta}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ───── Quick Actions ───── */}
      <Card className="bg-gradient-to-br from-primary/[0.06] via-card to-card border-primary/20 overflow-hidden relative">
        <div className="absolute -top-1/2 -right-10 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <CardContent className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8 relative">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkle className="w-5 h-5 text-primary" weight="fill" />
            </div>
            <div>
              <h2 className="font-semibold text-lg leading-tight text-foreground">Ações rápidas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Os processos mais executados pelo seu time
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:ml-auto">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant={action.primary ? "default" : "outline"}
                size="sm"
                onClick={action.action}
                className="gap-2"
              >
                <action.icon className="w-4 h-4" weight="regular" />
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ───── Grid Main: Alertas + Próximos 30 dias ───── */}
      {hasAnyManagementPermission && (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* Central de Alertas */}
          <Card className="border border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" weight="regular" />
                Central de alertas
                {alerts.filter((a) => a.priority !== "ok").length > 0 && (
                  <Badge className="bg-primary text-primary-foreground border-0 text-[10px] h-5 px-1.5">
                    {alerts.filter((a) => a.priority !== "ok").length}
                  </Badge>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => navigate("/dashboard")}>
                Ver todos <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {alerts.length === 0 ? (
                <div className="px-6 py-10 text-center text-muted-foreground text-sm">
                  Carregando alertas...
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {alerts.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} onAction={(route) => navigate(route)} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Próximos 30 dias */}
          <Card className="border border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary" weight="regular" />
                Próximos 30 dias
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {timeline.length === 0 ? (
                <div className="px-6 py-10 text-center text-muted-foreground text-sm">
                  <CalendarIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Nada agendado pros próximos 30 dias.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {timeline.map((entry) => (
                    <TimelineRow key={entry.id} entry={entry} today={today} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ───── Grid Bottom: Headcount + Aniversariantes ───── */}
      {hasAnyManagementPermission && (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* Headcount por Setor */}
          <Card className="border border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" weight="regular" />
                Headcount por setor
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground gap-1"
                onClick={() => navigate("/dashboard/setores")}
              >
                Ver setores <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {headcountByTeam.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Nenhum setor cadastrado ainda.
                </div>
              ) : (
                <>
                  <div className="max-h-[320px] overflow-y-auto pr-2 -mr-2">
                    <ul className="space-y-2.5">
                      {headcountByTeam.map((row) => (
                        <li
                          key={row.name}
                          className="grid grid-cols-[140px_1fr_40px] items-center gap-3"
                        >
                          <span className="text-sm text-foreground/80 truncate" title={row.name}>
                            {row.name}
                          </span>
                          <Progress value={(row.count / maxTeamCount) * 100} className="h-2" />
                          <span className="text-sm font-semibold tabular-nums text-right">
                            {row.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3 text-right">
                    {headcountByTeam.length} setor
                    {headcountByTeam.length === 1 ? "" : "es"} com colaboradores
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Aniversariantes (próximos) */}
          <Card className="border border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <Cake className="w-5 h-5 text-pink-500" weight="regular" />
                Aniversariantes
              </CardTitle>
              {birthdaysThisWeek.length > 0 && (
                <Badge variant="secondary" className="bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 border-0">
                  {birthdaysThisWeek.length} esta semana
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {upcomingBirthdays.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Cake className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Sem aniversariantes nos próximos 30 dias.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {upcomingBirthdays.slice(0, 6).map((b) => (
                    <li key={b.collab.id} className="flex items-center gap-3 px-6 py-3">
                      <div className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-950/30 ring-2 ring-pink-200 dark:ring-pink-900/40 grid place-items-center text-sm font-bold text-pink-700 dark:text-pink-300 shrink-0">
                        {getInitials(b.collab.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{b.collab.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(b.date, "dd 'de' MMM", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            b.days === 0 ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {b.days === 0 ? "Hoje" : b.days === 1 ? "Amanhã" : `em ${b.days}d`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ───── Empty state (sem colaboradores) ───── */}
      {(isAdmin || canViewModule("colaboradores")) && collaborators.length === 0 && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5 animate-scale-in">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Comece a usar o DNA Softcom
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Cadastre seus colaboradores para desbloquear todos os recursos do sistema.
            </p>
            <Button variant="hero" size="lg" onClick={() => navigate("/dashboard/colaboradores")}>
              <UserPlus className="w-5 h-5 mr-2" />
              Cadastrar primeiro colaborador
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onAction,
}: {
  alert: DashAlert;
  onAction: (route: string) => void;
}) {
  const iconColors: Record<AlertPriority, { bg: string; fg: string; chip: string; chipLabel: string }> = {
    critical: {
      bg: "bg-red-100 dark:bg-red-950/40",
      fg: "text-red-600 dark:text-red-400",
      chip: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
      chipLabel: "Crítico",
    },
    warn: {
      bg: "bg-amber-100 dark:bg-amber-950/40",
      fg: "text-amber-700 dark:text-amber-400",
      chip: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
      chipLabel: "Atenção",
    },
    info: {
      bg: "bg-blue-100 dark:bg-blue-950/40",
      fg: "text-blue-700 dark:text-blue-400",
      chip: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
      chipLabel: "Info",
    },
    ok: {
      bg: "bg-emerald-100 dark:bg-emerald-950/40",
      fg: "text-emerald-700 dark:text-emerald-400",
      chip: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
      chipLabel: "Tudo certo",
    },
  };
  const c = iconColors[alert.priority];
  const Icon = alert.icon;

  return (
    <li className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors">
      <div className={cn("w-9 h-9 rounded-lg grid place-items-center shrink-0", c.bg, c.fg)}>
        <Icon className="w-[18px] h-[18px]" weight="regular" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded", c.chip)}>
            {c.chipLabel}
          </span>
          <span className="truncate">{alert.title}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.desc}</p>
      </div>
      {alert.cta ? (
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 gap-1"
          onClick={() => onAction(alert.cta!.route)}
        >
          {alert.cta.label} <ArrowRight className="w-3 h-3" />
        </Button>
      ) : (
        <span />
      )}
    </li>
  );
}

function TimelineRow({ entry, today }: { entry: TimelineEntry; today: Date }) {
  const meta = TIMELINE_KIND_META[entry.kind];
  const Icon = meta.icon;
  const day = format(entry.date, "dd");
  const month = format(entry.date, "MMM", { locale: ptBR });

  return (
    <li className="grid grid-cols-[50px_36px_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">
      <div className="text-center">
        <div className="text-xl font-bold leading-none text-foreground tabular-nums">{day}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mt-0.5">
          {month}
        </div>
      </div>
      <div className={cn("w-9 h-9 rounded-full grid place-items-center", meta.bg, meta.fg)}>
        <Icon className="w-4 h-4" weight="regular" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
        <p className="text-xs text-muted-foreground truncate">{entry.subtitle}</p>
      </div>
      <span className="text-xs text-muted-foreground font-medium tabular-nums shrink-0">
        {daysLeftLabel(entry.date, today)}
      </span>
    </li>
  );
}

export default DashboardHome;
