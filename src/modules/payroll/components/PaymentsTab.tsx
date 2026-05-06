import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import {
  isEarning,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_COLORS,
  type PayrollEntryWithCollaborator,
} from "../types";

interface PaymentsTabProps {
  periodId: string;
  entries: PayrollEntryWithCollaborator[];
  canManage: boolean;
}

interface PaymentRecord {
  id: string;
  period_id: string;
  entry_id: string;
  amount: number;
  paid_at: string | null;
  paid_by: string | null;
}

export function PaymentsTab({ periodId, entries, canManage }: PaymentsTabProps) {
  const queryClient = useQueryClient();

  // Lista flat de lançamentos pagáveis (proventos), ordenada por colaborador
  // e depois por descrição. Cada lançamento é uma linha com seu próprio check.
  const payableEntries = useMemo(() => {
    return entries
      .filter((e) => isEarning(e.type))
      .slice()
      .sort((a, b) => {
        const an = a.collaborator?.name ?? "";
        const bn = b.collaborator?.name ?? "";
        const cmp = an.localeCompare(bn, "pt-BR");
        if (cmp !== 0) return cmp;
        const ad = a.description ?? ENTRY_TYPE_LABELS[a.type] ?? a.type;
        const bd = b.description ?? ENTRY_TYPE_LABELS[b.type] ?? b.type;
        return ad.localeCompare(bd, "pt-BR");
      });
  }, [entries]);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payroll-payments", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments")
        .select("*")
        .eq("period_id", periodId);
      if (error) throw error;
      return (data ?? []) as PaymentRecord[];
    },
    enabled: !!periodId,
  });

  const paymentByEntry = useMemo(() => {
    const map = new Map<string, PaymentRecord>();
    for (const p of payments) map.set(p.entry_id, p);
    return map;
  }, [payments]);

  const togglePayment = useMutation({
    mutationFn: async ({
      entryId,
      amount,
      newPaid,
    }: {
      entryId: string;
      amount: number;
      newPaid: boolean;
    }) => {
      const existing = paymentByEntry.get(entryId);
      const { data: userData } = await supabase.auth.getUser();
      if (existing) {
        const { error } = await supabase
          .from("payroll_payments")
          .update({
            paid_at: newPaid ? new Date().toISOString() : null,
            paid_by: newPaid ? userData?.user?.id ?? null : null,
            amount,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_payments").insert({
          period_id: periodId,
          entry_id: entryId,
          amount,
          paid_at: newPaid ? new Date().toISOString() : null,
          paid_by: newPaid ? userData?.user?.id ?? null : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-payments", periodId] });
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  const total = payableEntries.length;
  const paidCount = payableEntries.filter((e) =>
    paymentByEntry.get(e.id)?.paid_at,
  ).length;
  const totalAmount = payableEntries.reduce((s, e) => s + Number(e.value), 0);
  const paidAmount = payableEntries.reduce((s, e) => {
    const rec = paymentByEntry.get(e.id);
    return rec?.paid_at ? s + Number(e.value) : s;
  }, 0);
  const progressPct = total === 0 ? 0 : Math.round((paidCount / total) * 100);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (payableEntries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">
          Sem lançamentos pagáveis no período. Adicione na aba Lançamentos primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {paidCount}/{total} pagos
            </span>
            <span className="text-muted-foreground">
              · {formatCurrency(paidAmount)} de {formatCurrency(totalAmount)}
            </span>
          </div>
          <span className="text-muted-foreground tabular-nums">
            {progressPct}%
          </span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* Lista flat de lançamentos */}
      <div className="border rounded-md divide-y divide-border">
        {payableEntries.map((entry) => {
          const rec = paymentByEntry.get(entry.id);
          const isPaid = !!rec?.paid_at;
          const value = Number(entry.value);
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                isPaid ? "bg-emerald-50 dark:bg-emerald-950/20" : "hover:bg-muted/30"
              }`}
            >
              <Checkbox
                checked={isPaid}
                disabled={!canManage || togglePayment.isPending}
                onCheckedChange={(checked) =>
                  togglePayment.mutate({
                    entryId: entry.id,
                    amount: value,
                    newPaid: !!checked,
                  })
                }
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={`text-sm truncate ${
                      isPaid ? "text-muted-foreground" : "font-medium text-foreground"
                    }`}
                  >
                    {entry.collaborator?.name ?? "(sem nome)"}
                  </p>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium border shrink-0 ${
                      ENTRY_TYPE_COLORS[entry.type] ??
                      "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {ENTRY_TYPE_LABELS[entry.type] ?? entry.type}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {entry.description ?? "—"}
                  {isPaid && rec?.paid_at && (
                    <span className="ml-2">
                      · pago em{" "}
                      {new Date(rec.paid_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}{" "}
                      {new Date(rec.paid_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`font-mono text-sm font-semibold ${
                    isPaid
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-foreground"
                  }`}
                >
                  {formatCurrency(value)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
