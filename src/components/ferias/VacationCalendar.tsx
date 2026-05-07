import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
} from "@phosphor-icons/react";
import { VacationRequest } from "@/hooks/useVacations";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWithinInterval,
  getDay,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  isSameDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface VacationCalendarProps {
  requests: VacationRequest[];
}

// Paleta determinística com 14 cores distintas — pra que cada colaborador
// tenha sempre a MESMA cor independente da ordem de renderização.
const PALETTE = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
];

// Hash estável (FNV-1a 32-bit). Mesmo collaborator_id → mesmo índice.
function colorFor(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

type View = "year" | "month";

const VacationCalendar = ({ requests }: VacationCalendarProps) => {
  const [view, setView] = useState<View>("year");
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Filtra só pedidos relevantes (aprovados ou em andamento)
  const visibleRequests = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "approved" || r.status === "in_progress",
      ),
    [requests],
  );

  // Mapa de colaboradores únicos pra legenda
  const collaboratorsList = useMemo(() => {
    const map = new Map<string, string>();
    visibleRequests.forEach((r) => {
      if (!map.has(r.collaborator_id)) {
        map.set(r.collaborator_id, r.collaborator?.name ?? "—");
      }
    });
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "pt-BR"),
    );
  }, [visibleRequests]);

  // Helper: pra um dia, retorna lista de pedidos cobrindo aquela data
  function getRequestsForDay(day: Date): VacationRequest[] {
    return visibleRequests.filter((r) => {
      const start = parseISO(r.start_date);
      const end = parseISO(r.end_date);
      return isWithinInterval(day, { start, end });
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Calendário de Férias</CardTitle>
          <div className="flex items-center gap-2">
            {/* Toggle Mês/Ano */}
            <div className="flex items-center rounded-md border border-input bg-background overflow-hidden">
              <button
                type="button"
                onClick={() => setView("year")}
                className={`px-3 h-8 text-xs font-medium transition-colors ${
                  view === "year"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Ano
              </button>
              <button
                type="button"
                onClick={() => setView("month")}
                className={`px-3 h-8 text-xs font-medium transition-colors ${
                  view === "month"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Mês
              </button>
            </div>

            {/* Navegação */}
            {view === "year" ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentYear((y) => y - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium min-w-[60px] text-center tabular-nums">
                  {currentYear}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentYear((y) => y + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    const d = new Date(currentMonth);
                    d.setMonth(d.getMonth() - 1);
                    setCurrentMonth(d);
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium min-w-[120px] text-center capitalize">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    const d = new Date(currentMonth);
                    d.setMonth(d.getMonth() + 1);
                    setCurrentMonth(d);
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === "year" ? (
          <YearGrid
            year={currentYear}
            getRequestsForDay={getRequestsForDay}
          />
        ) : (
          <MonthGrid
            month={currentMonth}
            getRequestsForDay={getRequestsForDay}
          />
        )}

        {/* Legenda */}
        {collaboratorsList.length > 0 ? (
          <div className="mt-5 pt-4 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Colaboradores em férias:
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {collaboratorsList.map(([id, name]) => (
                <div key={id} className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${colorFor(id)}`}
                  />
                  <span className="text-xs">{name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center mt-6">
            Nenhuma férias agendada {view === "year" ? "neste ano" : "neste mês"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Year view: 12 mini-meses (4 cols × 3 rows). Cada dia com pedidos mostra
// até 3 pontinhos coloridos; +N se houver mais.
// ─────────────────────────────────────────────────────────────────────────────

function YearGrid({
  year,
  getRequestsForDay,
}: {
  year: number;
  getRequestsForDay: (day: Date) => VacationRequest[];
}) {
  const months = eachMonthOfInterval({
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 11, 31)),
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {months.map((month) => (
        <MiniMonth
          key={month.getTime()}
          month={month}
          getRequestsForDay={getRequestsForDay}
        />
      ))}
    </div>
  );
}

function MiniMonth({
  month,
  getRequestsForDay,
}: {
  month: Date;
  getRequestsForDay: (day: Date) => VacationRequest[];
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = getDay(monthStart);
  const today = new Date();

  return (
    <div className="rounded-lg border border-border p-2.5 bg-card">
      <p className="text-xs font-semibold text-foreground mb-2 capitalize">
        {format(month, "MMMM", { locale: ptBR })}
      </p>
      <div className="grid grid-cols-7 gap-0.5 text-[9px] font-medium text-muted-foreground mb-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="h-7" />
        ))}
        {days.map((day) => {
          const reqs = getRequestsForDay(day);
          const isToday = isSameDay(day, today);
          return (
            <DayCell
              key={day.getTime()}
              day={day}
              requests={reqs}
              isToday={isToday}
              compact
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Month view: visual maior, mesma lógica de pontinhos
// ─────────────────────────────────────────────────────────────────────────────

function MonthGrid({
  month,
  getRequestsForDay,
}: {
  month: Date;
  getRequestsForDay: (day: Date) => VacationRequest[];
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = getDay(monthStart);
  const today = new Date();

  return (
    <>
      <div className="grid grid-cols-7 gap-px mb-1">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="h-14" />
        ))}
        {days.map((day) => {
          const reqs = getRequestsForDay(day);
          const isToday = isSameDay(day, today);
          return (
            <DayCell
              key={day.getTime()}
              day={day}
              requests={reqs}
              isToday={isToday}
            />
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DayCell: mostra dia + pontinhos coloridos por colaborador em férias
// ─────────────────────────────────────────────────────────────────────────────

function DayCell({
  day,
  requests,
  isToday,
  compact = false,
}: {
  day: Date;
  requests: VacationRequest[];
  isToday: boolean;
  compact?: boolean;
}) {
  const hasVacation = requests.length > 0;
  const maxDots = compact ? 3 : 4;
  const visibleDots = requests.slice(0, maxDots);
  const overflow = requests.length - visibleDots.length;

  const cell = (
    <div
      className={`flex flex-col items-center justify-start ${
        compact ? "h-7 py-0.5" : "h-14 py-1.5"
      } rounded transition-colors ${
        hasVacation ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
      } ${
        isToday
          ? "ring-1 ring-primary text-primary font-bold"
          : "text-foreground"
      }`}
    >
      <span
        className={`${compact ? "text-[10px] leading-none" : "text-xs"} ${
          isToday ? "font-bold" : ""
        }`}
      >
        {format(day, "d")}
      </span>
      {hasVacation && (
        <div className="flex items-center justify-center gap-[2px] mt-0.5 flex-wrap max-w-full">
          {visibleDots.map((r) => (
            <span
              key={r.id}
              className={`${compact ? "w-1 h-1" : "w-1.5 h-1.5"} rounded-full ${colorFor(r.collaborator_id)}`}
            />
          ))}
          {overflow > 0 && (
            <span
              className={`text-muted-foreground tabular-nums ${
                compact ? "text-[7px] leading-none" : "text-[9px]"
              }`}
            >
              +{overflow}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (!hasVacation) return cell;

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <button type="button" className="block w-full">
          {cell}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 text-xs" align="center">
        <p className="font-medium text-foreground mb-1.5">
          {format(day, "dd 'de' MMMM", { locale: ptBR })}
        </p>
        <ul className="space-y-1">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${colorFor(r.collaborator_id)}`}
              />
              <span className="truncate flex-1">{r.collaborator?.name}</span>
              <span className="text-muted-foreground text-[10px] tabular-nums shrink-0">
                {format(parseISO(r.start_date), "dd/MM")}–
                {format(parseISO(r.end_date), "dd/MM")}
              </span>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}

export default VacationCalendar;
