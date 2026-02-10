import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { VacationRequest } from "@/hooks/useVacations";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, addMonths, subMonths, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VacationCalendarProps {
  requests: VacationRequest[];
}

const colors = [
  "bg-primary/70",
  "bg-accent/70",
  "bg-blue-400/70",
  "bg-purple-400/70",
  "bg-pink-400/70",
  "bg-emerald-400/70",
  "bg-amber-400/70",
];

const VacationCalendar = ({ requests }: VacationCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Filter requests that overlap with this month (approved or in_progress)
  const activeRequests = useMemo(() => {
    return requests.filter(r => {
      if (r.status !== "approved" && r.status !== "in_progress") return false;
      const start = parseISO(r.start_date);
      const end = parseISO(r.end_date);
      return start <= monthEnd && end >= monthStart;
    });
  }, [requests, monthStart, monthEnd]);

  // Group by collaborator
  const collaboratorRequests = useMemo(() => {
    const map = new Map<string, { name: string; requests: VacationRequest[] }>();
    activeRequests.forEach(r => {
      const key = r.collaborator_id;
      if (!map.has(key)) {
        map.set(key, { name: r.collaborator?.name || "—", requests: [] });
      }
      map.get(key)!.requests.push(r);
    });
    return Array.from(map.entries());
  }, [activeRequests]);

  const dayHeaders = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const firstDayOfWeek = getDay(monthStart);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Calendário de Férias</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {dayHeaders.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-8" />
          ))}
          {daysInMonth.map(day => {
            const dayStr = format(day, "yyyy-MM-dd");
            const isVacation = activeRequests.some(r => {
              const start = parseISO(r.start_date);
              const end = parseISO(r.end_date);
              return isWithinInterval(day, { start, end });
            });
            const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

            return (
              <div
                key={dayStr}
                className={`h-8 flex items-center justify-center text-xs rounded ${
                  isVacation ? "bg-primary/20 text-primary font-bold" : ""
                } ${isToday ? "ring-1 ring-primary" : ""}`}
              >
                {format(day, "d")}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        {collaboratorRequests.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Colaboradores em férias:</p>
            <div className="flex flex-wrap gap-2">
              {collaboratorRequests.map(([id, data], i) => (
                <div key={id} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${colors[i % colors.length]}`} />
                  <span className="text-xs">{data.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {collaboratorRequests.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-4">
            Nenhuma férias agendada para este mês.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default VacationCalendar;
