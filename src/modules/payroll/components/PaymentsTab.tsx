import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { CircleNotch as Loader2, Info } from "@phosphor-icons/react";
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

  // Lista flat de lançamentos pagáveis, com valores LÍQUIDOS após impostos.
  // Regras:
  // - só proventos (`isEarning`)
  // - benefícios fora (`type === 'beneficio'`): pagamento por outro fluxo
  // - FGTS fora: é encargo do empregador, não desconta do colaborador
  // - INSS/IRPF descontam do que vai pra mão do colaborador:
  //     · INSS desconta integralmente do salário base
  //     · IRPF distribui proporcionalmente entre salário base + gratificações
  // - estornos: par positivo+negativo do mesmo (collab,tipo) somam ≤ 0 → some
  const { payableEntries, taxBreakdownByEntry } = useMemo(() => {
    const earningOnly = entries.filter(
      (e) => isEarning(e.type) && e.type !== "beneficio",
    );

    // Detecta pares estornados (positivo + negativo cancelam)
    const groupSum = new Map<string, number>();
    for (const e of earningOnly) {
      const key = `${e.collaborator_id}::${e.type}`;
      groupSum.set(key, (groupSum.get(key) ?? 0) + Number(e.value));
    }

    const survivors = earningOnly.filter((e) => {
      const sum = groupSum.get(`${e.collaborator_id}::${e.type}`) ?? 0;
      if (sum <= 0) return false;
      return Number(e.value) > 0;
    });

    // Calcula impostos por colaborador a partir das entradas de IRPF/INSS
    // do próprio período (não recalcula — usa o que está em payroll_entries,
    // que veio do botão "Recalcular encargos" pela tabela 2026).
    type CollabTaxes = { inss: number; irpf: number };
    const taxesByCollab = new Map<string, CollabTaxes>();
    for (const e of entries) {
      if (e.type !== "inss" && e.type !== "irpf") continue;
      const cid = e.collaborator_id;
      const cur = taxesByCollab.get(cid) ?? { inss: 0, irpf: 0 };
      if (e.type === "inss") cur.inss += Number(e.value);
      else cur.irpf += Number(e.value);
      taxesByCollab.set(cid, cur);
    }

    // Aplica deduções nas entries:
    //   salary base: bruto − INSS − IRPF_share_salary
    //   gratificação: bruto − IRPF_share_grat
    // IRPF_share = irpf × bruto_dele / (bruto_salary + sum_grats)
    type EntryTax = { inss: number; irpf: number };
    const breakdownByEntry = new Map<string, EntryTax>();
    const adjustedEntries: PayrollEntryWithCollaborator[] = [];

    // Agrupa survivors por colaborador
    const byCollab = new Map<string, PayrollEntryWithCollaborator[]>();
    for (const e of survivors) {
      const arr = byCollab.get(e.collaborator_id) ?? [];
      arr.push(e);
      byCollab.set(e.collaborator_id, arr);
    }

    for (const [collabId, list] of byCollab) {
      const taxes = taxesByCollab.get(collabId) ?? { inss: 0, irpf: 0 };
      const salary = list.find((e) => e.type === "salario_base");
      const grats = list.filter((e) => e.type === "gratificacao");
      const irpfBase =
        (salary ? Number(salary.value) : 0) +
        grats.reduce((s, e) => s + Number(e.value), 0);

      // Distribui IRPF proporcional ao bruto de cada linha
      const irpfShares = new Map<string, number>();
      if (taxes.irpf > 0 && irpfBase > 0) {
        const targets = [
          ...(salary ? [salary] : []),
          ...grats,
        ];
        let allocated = 0;
        targets.forEach((t, i) => {
          const isLast = i === targets.length - 1;
          const share = isLast
            ? taxes.irpf - allocated
            : Math.round(((taxes.irpf * Number(t.value)) / irpfBase) * 100) / 100;
          allocated += share;
          irpfShares.set(t.id, share);
        });
      }

      for (const e of list) {
        const irpfShare = irpfShares.get(e.id) ?? 0;
        let inssShare = 0;
        if (e.type === "salario_base") inssShare = taxes.inss;
        const adjusted = Number(e.value) - inssShare - irpfShare;
        if (adjusted <= 0) continue; // não exibe linhas zeradas/negativas
        adjustedEntries.push({
          ...e,
          value: adjusted,
        } as PayrollEntryWithCollaborator);
        breakdownByEntry.set(e.id, { inss: inssShare, irpf: irpfShare });
      }
    }

    adjustedEntries.sort((a, b) => {
      const an = a.collaborator?.name ?? "";
      const bn = b.collaborator?.name ?? "";
      const cmp = an.localeCompare(bn, "pt-BR");
      if (cmp !== 0) return cmp;
      const ad = a.description ?? ENTRY_TYPE_LABELS[a.type] ?? a.type;
      const bd = b.description ?? ENTRY_TYPE_LABELS[b.type] ?? b.type;
      return ad.localeCompare(bd, "pt-BR");
    });

    return { payableEntries: adjustedEntries, taxBreakdownByEntry: breakdownByEntry };
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
              <div className="text-right shrink-0 flex items-center gap-1.5">
                {(() => {
                  const tax = taxBreakdownByEntry.get(entry.id);
                  if (!tax || (tax.inss === 0 && tax.irpf === 0)) return null;
                  const grossValue = Number(entry.value) + tax.inss + tax.irpf;
                  return (
                    <HoverCard openDelay={150} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                          aria-label="Ver detalhes do líquido"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Info className="w-3.5 h-3.5" weight="fill" />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent align="end" className="w-60 text-xs">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Bruto</span>
                            <span className="font-mono">
                              {formatCurrency(grossValue)}
                            </span>
                          </div>
                          {tax.inss > 0 && (
                            <div className="flex items-center justify-between gap-2 text-rose-700 dark:text-rose-300">
                              <span>− INSS</span>
                              <span className="font-mono">
                                {formatCurrency(tax.inss)}
                              </span>
                            </div>
                          )}
                          {tax.irpf > 0 && (
                            <div className="flex items-center justify-between gap-2 text-rose-700 dark:text-rose-300">
                              <span>− IRPF</span>
                              <span className="font-mono">
                                {formatCurrency(tax.irpf)}
                              </span>
                            </div>
                          )}
                          <div className="border-t border-border pt-1.5 flex items-center justify-between gap-2 font-medium">
                            <span>Líquido</span>
                            <span className="font-mono text-orange-700 dark:text-orange-300">
                              {formatCurrency(value)}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground/80 pt-1 italic">
                            FGTS é encargo do empregador — não desconta do
                            valor pago.
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  );
                })()}
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
