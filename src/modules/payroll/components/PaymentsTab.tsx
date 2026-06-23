import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  CircleNotch as Loader2,
  Info,
  Copy,
  MagnifyingGlass,
  X as XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { StatBlock } from "./StatBlock";
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

  // Lista flat de lançamentos pagáveis, com valores LÍQUIDOS após impostos
  // e descontos.
  // Regras:
  // - só proventos (`isEarning`)
  // - benefícios entram só se is_payable=true (categoria 'adicional');
  //   demais benefícios são vouchers/serviços, pagos por outro fluxo
  // - FGTS fora: é encargo do empregador, não desconta do colaborador
  // - **Pagamento Mensal**: salário base + grats recorrentes mescladas em
  //   1 linha. INSS/IRPF regulares + descontos manuais incidem sobre essa
  //   base (já contabilizados no mesmo período mas SEM o prefixo ferias-).
  // - **Pagamento de Férias** (entries com external_id LIKE 'ferias-%'):
  //   linha SEPARADA. Mescla ferias + 1/3 + grat s/Férias + bon s/Férias,
  //   menos INSS s/Férias e IRRF s/Férias (também com prefixo ferias-).
  //   É um cheque distinto (CLT art. 145: D-2 do gozo).
  // - Outros proventos mensais (bonificação fora férias, hora extra,
  //   benefício pagável) continuam como linhas separadas.
  // - estornos: par positivo+negativo do mesmo (collab,tipo) somam ≤ 0 → some
  const { payableEntries, taxBreakdownByEntry } = useMemo(() => {
    const earningOnly = entries.filter(
      (e) =>
        isEarning(e.type) &&
        (e.type !== "beneficio" || e.is_payable === true),
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

    // Helper: entry vem do fluxo de férias? (external_id 'ferias-<reqId>-<kind>')
    const isVacEntry = (e: PayrollEntryWithCollaborator) =>
      (e.external_id ?? "").startsWith("ferias-");

    // INSS/IRPF agregados por colab, SEPARANDO regular (mensal) de férias
    type CollabTaxes = { inss: number; irpf: number };
    const monthlyTaxes = new Map<string, CollabTaxes>();
    const vacationTaxes = new Map<string, CollabTaxes>();
    for (const e of entries) {
      if (e.type !== "inss" && e.type !== "irpf") continue;
      const cid = e.collaborator_id;
      const target = isVacEntry(e) ? vacationTaxes : monthlyTaxes;
      const cur = target.get(cid) ?? { inss: 0, irpf: 0 };
      if (e.type === "inss") cur.inss += Number(e.value);
      else cur.irpf += Number(e.value);
      target.set(cid, cur);
    }

    // Descontos manuais (plano de saúde, adiantamento) — só aplicam ao mensal.
    type Discount = { label: string; value: number };
    const discountsByCollab = new Map<string, Discount[]>();
    for (const e of entries) {
      if (e.type !== "desconto") continue;
      if (isVacEntry(e)) continue; // defensivo: férias não tem desconto
      const v = Number(e.value);
      if (!(v > 0)) continue;
      const arr = discountsByCollab.get(e.collaborator_id) ?? [];
      arr.push({
        label: e.description ?? ENTRY_TYPE_LABELS[e.type] ?? "Desconto",
        value: v,
      });
      discountsByCollab.set(e.collaborator_id, arr);
    }

    type Component = { label: string; value: number };
    type EntryBreakdown = {
      inss: number;
      irpf: number;
      discounts: Discount[];
      components: Component[];
    };
    const breakdownByEntry = new Map<string, EntryBreakdown>();
    const adjustedEntries: PayrollEntryWithCollaborator[] = [];

    // Agrupa survivors por colaborador
    const byCollab = new Map<string, PayrollEntryWithCollaborator[]>();
    for (const e of survivors) {
      const arr = byCollab.get(e.collaborator_id) ?? [];
      arr.push(e);
      byCollab.set(e.collaborator_id, arr);
    }

    for (const [collabId, list] of byCollab) {
      // Particiona: vacation vs monthly
      const vacEntries = list.filter(isVacEntry);
      const monthlyList = list.filter((e) => !isVacEntry(e));

      // ╔══════════════════════════════════════════════════════════════╗
      // ║ MONTHLY: salário + grats merge, outros separados             ║
      // ╚══════════════════════════════════════════════════════════════╝
      const taxes = monthlyTaxes.get(collabId) ?? { inss: 0, irpf: 0 };
      const collabDiscounts = discountsByCollab.get(collabId) ?? [];
      const totalDiscount = collabDiscounts.reduce((s, d) => s + d.value, 0);

      const salary = monthlyList.find((e) => e.type === "salario_base");
      const grats = monthlyList.filter((e) => e.type === "gratificacao");
      const others = monthlyList.filter(
        (e) => e.type !== "salario_base" && e.type !== "gratificacao",
      );

      if (salary || grats.length > 0) {
        const primary = salary ?? grats[0];
        const components: Component[] = [];
        if (salary) {
          components.push({ label: "Salário Base", value: Number(salary.value) });
        }
        for (const g of grats) {
          components.push({
            label: g.description ?? ENTRY_TYPE_LABELS.gratificacao,
            value: Number(g.value),
          });
        }
        const gross = components.reduce((s, c) => s + c.value, 0);
        const adjusted = gross - taxes.inss - taxes.irpf - totalDiscount;
        if (adjusted > 0) {
          const mergedDesc = grats.length > 0
            ? (salary
                ? `Salário Base + ${grats.length === 1 ? "Gratificação" : `${grats.length} gratificações`}`
                : (grats.length === 1 ? "Gratificação" : `${grats.length} gratificações`))
            : "Salário Base";
          adjustedEntries.push({
            ...primary,
            description: mergedDesc,
            value: adjusted,
          } as PayrollEntryWithCollaborator);
          breakdownByEntry.set(primary.id, {
            inss: taxes.inss,
            irpf: taxes.irpf,
            discounts: collabDiscounts,
            components,
          });
        }
      }

      // Outros tipos monthly (bonificação, hora extra, benefício): linhas próprias
      for (const e of others) {
        adjustedEntries.push(e as PayrollEntryWithCollaborator);
        breakdownByEntry.set(e.id, {
          inss: 0,
          irpf: 0,
          discounts: [],
          components: [{
            label: e.description ?? ENTRY_TYPE_LABELS[e.type] ?? e.type,
            value: Number(e.value),
          }],
        });
      }

      // ╔══════════════════════════════════════════════════════════════╗
      // ║ VACATION: todos os entries 'ferias-*' juntos em 1 linha     ║
      // ╚══════════════════════════════════════════════════════════════╝
      if (vacEntries.length > 0) {
        // Âncora: prefere a entry type='ferias' (provento principal),
        // senão pega a primeira disponível.
        const primary = vacEntries.find((e) => e.type === "ferias") ?? vacEntries[0];
        const vacTax = vacationTaxes.get(collabId) ?? { inss: 0, irpf: 0 };

        const components: Component[] = vacEntries.map((e) => ({
          label: e.description ?? ENTRY_TYPE_LABELS[e.type] ?? e.type,
          value: Number(e.value),
        }));
        const gross = components.reduce((s, c) => s + c.value, 0);
        const adjusted = gross - vacTax.inss - vacTax.irpf;

        if (adjusted > 0) {
          adjustedEntries.push({
            ...primary,
            type: "ferias",
            description: "Pagamento de Férias",
            value: adjusted,
          } as PayrollEntryWithCollaborator);
          breakdownByEntry.set(primary.id, {
            inss: vacTax.inss,
            irpf: vacTax.irpf,
            discounts: [],
            components,
          });
        }
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

  const handleCopyPix = async (pixKey: string) => {
    try {
      await navigator.clipboard.writeText(pixKey);
      toast.success("PIX copiado");
    } catch {
      toast.error("Não consegui copiar. Tenta selecionar e copiar manualmente.");
    }
  };

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

  // Busca por nome do colaborador. Normaliza acento pra "joao" achar "João".
  // ̀-ͯ = bloco de combining diacritics (gerados pelo NFD).
  const [searchTerm, setSearchTerm] = useState("");
  const normalized = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filteredEntries = useMemo(() => {
    const q = normalized(searchTerm.trim());
    if (!q) return payableEntries;
    return payableEntries.filter((e) =>
      normalized(e.collaborator?.name ?? "").includes(q),
    );
  }, [payableEntries, searchTerm]);

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
  const isFiltering = searchTerm.trim().length > 0;

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
      {/* KPIs desta aba — totais LÍQUIDOS a pagar (sem FGTS, benefícios, estornos) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBlock label="Pagos" value={`${paidCount}/${total}`} />
        <StatBlock label="Total a pagar" value={formatCurrency(totalAmount)} accent="emerald" />
        <StatBlock label="Pago" value={formatCurrency(paidAmount)} accent="emerald" />
        <StatBlock
          label="Pendente"
          value={formatCurrency(totalAmount - paidAmount)}
          accent={totalAmount - paidAmount > 0 ? "rose" : "emerald"}
        />
      </div>

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

      {/* Busca por colaborador */}
      <div className="relative">
        <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Buscar colaborador..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8 pr-8 h-9"
        />
        {isFiltering && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition focus:outline-none focus:ring-2 focus:ring-primary/40 rounded"
            aria-label="Limpar busca"
            title="Limpar busca"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      {isFiltering && (
        <p className="text-xs text-muted-foreground px-1 -mt-2">
          {filteredEntries.length === 0
            ? "Nenhum colaborador com esse nome."
            : `Mostrando ${filteredEntries.length} de ${total} lançamento(s).`}
        </p>
      )}

      {/* Lista flat de lançamentos */}
      {filteredEntries.length > 0 && (
      <div className="border rounded-md divide-y divide-border">
        {filteredEntries.map((entry) => {
          const rec = paymentByEntry.get(entry.id);
          const isPaid = !!rec?.paid_at;
          const value = Number(entry.value);
          const pixKey = entry.collaborator?.pix_key ?? null;
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
                <div className="flex items-center gap-1.5 text-xs mt-0.5">
                  {pixKey ? (
                    <>
                      <span className="text-muted-foreground">PIX:</span>
                      <span className="font-mono text-foreground/80 truncate max-w-[260px]">
                        {pixKey}
                      </span>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleCopyPix(pixKey);
                        }}
                        className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition focus:outline-none focus:ring-2 focus:ring-primary/40"
                        aria-label="Copiar chave PIX"
                        title="Copiar chave PIX"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground/70 italic">
                      PIX não cadastrado
                    </span>
                  )}
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
                  const totalDiscount = tax?.discounts.reduce((s, d) => s + d.value, 0) ?? 0;
                  const hasMultipleComponents = (tax?.components.length ?? 0) > 1;
                  // Popup só faz sentido quando tem algo a explicar (deduções OU componentes mesclados).
                  if (!tax || (tax.inss === 0 && tax.irpf === 0 && totalDiscount === 0 && !hasMultipleComponents)) {
                    return null;
                  }
                  const grossValue = tax.components.reduce((s, c) => s + c.value, 0);
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
                      <HoverCardContent align="end" className="w-72 text-xs">
                        <div className="space-y-1.5">
                          {/* Componentes brutos (salário + gratificações) */}
                          {tax.components.map((c, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-muted-foreground truncate" title={c.label}>
                                {c.label}
                              </span>
                              <span className="font-mono shrink-0">
                                {formatCurrency(c.value)}
                              </span>
                            </div>
                          ))}
                          {hasMultipleComponents && (
                            <div className="border-t border-border pt-1.5 flex items-center justify-between gap-2 text-muted-foreground">
                              <span>Bruto</span>
                              <span className="font-mono">
                                {formatCurrency(grossValue)}
                              </span>
                            </div>
                          )}
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
                          {tax.discounts.map((d, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2 text-rose-700 dark:text-rose-300"
                            >
                              <span className="truncate" title={d.label}>
                                − {d.label}
                              </span>
                              <span className="font-mono shrink-0">
                                {formatCurrency(d.value)}
                              </span>
                            </div>
                          ))}
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
      )}
    </div>
  );
}
