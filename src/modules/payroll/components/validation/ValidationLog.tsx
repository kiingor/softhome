import {
  usePayrollValidationLogs,
  useProfilesMap,
} from "../../hooks/use-payroll-validation";
import {
  SealCheck,
  Check,
  Prohibit,
  ArrowCounterClockwise,
  ClockCounterClockwise,
} from "@phosphor-icons/react";

const ACTION: Record<string, { label: string; Icon: typeof Check; cls: string }> = {
  started: { label: "iniciou a validação", Icon: SealCheck, cls: "text-primary" },
  marked_corrected: { label: "marcou como corrigido", Icon: Check, cls: "text-emerald-600" },
  marked_ignored: { label: "marcou como ignorado", Icon: Prohibit, cls: "text-muted-foreground" },
  reopened: { label: "reabriu", Icon: ArrowCounterClockwise, cls: "text-amber-600" },
};

export function ValidationLog({ validationId }: { validationId: string }) {
  const { data: logs = [], isLoading } = usePayrollValidationLogs(validationId);
  const { data: names } = useProfilesMap();

  if (isLoading) return <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>;
  if (logs.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem eventos ainda.</p>;

  return (
    <ol className="space-y-3">
      {logs.map((log) => {
        const a = ACTION[log.action] ?? { label: log.action, Icon: ClockCounterClockwise, cls: "text-muted-foreground" };
        const who = log.user_id ? names?.get(log.user_id) ?? "Usuário" : "Sistema";
        const when = new Date(log.created_at).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return (
          <li key={log.id} className="flex gap-3">
            <div className={`mt-0.5 ${a.cls}`}>
              <a.Icon className="w-4 h-4" weight="bold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <b>{who}</b> {a.label}
              </p>
              {log.notes && <p className="text-xs text-muted-foreground italic">“{log.notes}”</p>}
              <p className="text-[11px] text-muted-foreground">{when}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
