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
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_COLORS,
  type PayrollEntryWithCollaborator,
} from "../types";
import {
  buildPaymentLines,
  type PaymentLineComponent,
  type PaymentLineDiscount,
} from "../lib/buildPaymentLines";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PixPaymentDialog } from "./PixPaymentDialog";
import { usePixTransfers, usePixPayment, type PixTransfer } from "../hooks/use-pix-payment";
import { usePermissions } from "@/hooks/usePermissions";
import { useDashboard } from "@/contexts/DashboardContext";

interface PaymentsTabProps {
  periodId: string;
  entries: PayrollEntryWithCollaborator[];
  canManage: boolean;
  /** Status da folha. PIX só existe a partir de 'aprovado_diretoria'. */
  periodStatus?: string;
}

interface PaymentRecord {
  id: string;
  period_id: string;
  entry_id: string;
  amount: number;
  paid_at: string | null;
  paid_by: string | null;
  /** 'manual' = marcado na mão; 'pix_santander' = saiu por PIX e não se desmarca. */
  method?: string | null;
}

export function PaymentsTab({
  periodId,
  entries,
  canManage,
  periodStatus,
}: PaymentsTabProps) {
  const queryClient = useQueryClient();

  // Gate do PIX: papel restrito E módulo. É o padrão registrado em
  // PeriodDetailPage.tsx:131-134 — o toggle "Acesso total" da tela de
  // Permissões liga todos os módulos de uma vez, então módulo sozinho
  // transformaria qualquer acesso total em pagador. O terceiro fator
  // (dispositivo 2FA ativo) é validado no servidor, onde não dá pra burlar.
  const { hasAnyRole } = useDashboard();
  const execPermission = usePermissions("folha_pagamento_exec");
  const podePagar =
    hasAnyRole(["admin_gc", "diretoria"]) &&
    (execPermission.canCreate || execPermission.isAdmin);
  // A folha congela em 'aprovado_diretoria': antes disso o valor ainda muda, e
  // pagar um número que pode mudar é assinar cheque em branco.
  const folhaLiberada =
    periodStatus === "aprovado_diretoria" ||
    periodStatus === "closed" ||
    periodStatus === "exported";

  const { data: pixTransfers = [] } = usePixTransfers(periodId);
  const { checkNow, cancel } = usePixPayment(periodId);

  const handleCheckNow = async (entryId: string) => {
    try {
      await checkNow.mutateAsync(entryId);
      toast.info("Conferido com o banco. Se ainda estiver validando, o estado atualiza sozinho.");
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra conferir agora.");
    }
  };

  const handleCancel = async (entryId: string) => {
    try {
      await cancel.mutateAsync(entryId);
      toast.success("Transferência cancelada. O lançamento voltou a ficar disponível pra pagar.");
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra cancelar.");
    }
  };

  const transferByEntry = useMemo(() => {
    const m = new Map<string, PixTransfer>();
    // A query já vem por created_at DESC: a primeira de cada lançamento é a
    // tentativa mais recente, que é a que a linha deve refletir.
    for (const t of pixTransfers) if (!m.has(t.entry_id)) m.set(t.entry_id, t);
    return m;
  }, [pixTransfers]);

  const [pagando, setPagando] = useState<string | null>(null);

  // A fórmula do líquido vive em ../lib/buildPaymentLines.ts — extraída daqui
  // porque o servidor precisa da MESMA conta pra mandar o valor ao banco, e
  // porque as regras (estorno, partição de férias, mescla, clamp) só existiam
  // como comentário, sem teste. Aqui sobrou só a adaptação para as formas que
  // este componente já renderiza.
  const { payableEntries, taxBreakdownByEntry } = useMemo(() => {
    const lines = buildPaymentLines(entries);
    const sourceById = new Map(entries.map((e) => [e.id, e]));

    interface EntryBreakdown {
      inss: number;
      irpf: number;
      discounts: PaymentLineDiscount[];
      components: PaymentLineComponent[];
      /** Tipos que a linha somou — viram as tags na listagem. */
      types: string[];
    }

    const adjustedEntries: PayrollEntryWithCollaborator[] = [];
    const breakdownByEntry = new Map<string, EntryBreakdown>();

    for (const line of lines) {
      const source = sourceById.get(line.entryId);
      if (!source) continue;

      if (line.kind === "avulso") {
        // Linha própria (bonificação, carro agregado, benefício pagável…):
        // vai como está, sem imposto nem desconto aplicados.
        adjustedEntries.push(source);
      } else {
        adjustedEntries.push({
          ...source,
          ...(line.kind === "ferias" ? { type: "ferias" } : {}),
          description: line.description,
          value: line.amount,
        } as PayrollEntryWithCollaborator);
      }

      breakdownByEntry.set(line.entryId, {
        inss: line.inss,
        irpf: line.irpf,
        discounts: line.discounts,
        components: line.components,
        types: line.types,
      });
    }

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
      // Escrita direta em payroll_payments foi revogada na migration
      // 20260818120400: enquanto o navegador pudesse gravar ali, o 2FA do
      // pagamento seria contornável com três linhas no console. Agora a
      // marcação passa por uma função no servidor, que carimba quem marcou e
      // quando — antes esses dois campos vinham do relógio e da palavra do
      // cliente.
      const { error } = await supabase.rpc("payroll_payment_set_manual_paid", {
        p_entry_id: entryId,
        p_paid: newPaid,
        p_amount: amount,
      });
      if (error) throw error;
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
        <StatBlock label="Total a pagar" value={formatCurrency(totalAmount)} tom="positivo" />
        <StatBlock label="Pago" value={formatCurrency(paidAmount)} tom="positivo" />
        <StatBlock
          label="Pendente"
          value={formatCurrency(totalAmount - paidAmount)}
          tom={totalAmount - paidAmount > 0 ? "negativo" : "positivo"}
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
          const tx = transferByEntry.get(entry.id);
          const emVoo =
            !!tx && ["created", "sent", "confirmed", "unknown"].includes(tx.status);
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                isPaid ? "bg-success/5 dark:bg-success/15" : "hover:bg-muted/30"
              }`}
            >
              {/* Pagamento liquidado por PIX não se desmarca: o dinheiro saiu.
                  O servidor recusa de qualquer forma — desabilitar aqui é pra o
                  RH entender antes de clicar, em vez de receber um toast de
                  erro. */}
              <Checkbox
                checked={isPaid}
                disabled={
                  !canManage ||
                  togglePayment.isPending ||
                  (rec?.method === "pix_santander" && !!rec?.paid_at)
                }
                title={
                  rec?.method === "pix_santander" && rec?.paid_at
                    ? "Pago por PIX — não dá pra desmarcar"
                    : undefined
                }
                onCheckedChange={(checked) =>
                  togglePayment.mutate({
                    entryId: entry.id,
                    amount: value,
                    newPaid: !!checked,
                  })
                }
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={`text-sm truncate ${
                      isPaid ? "text-muted-foreground" : "font-medium text-foreground"
                    }`}
                  >
                    {entry.collaborator?.name ?? "(sem nome)"}
                  </p>
                  {/* Uma tag por tipo que a linha somou — o valor à direita é o
                      líquido do conjunto, então precisa ficar claro o que entrou. */}
                  {(taxBreakdownByEntry.get(entry.id)?.types ?? [entry.type]).map(
                    (type) => (
                      <span
                        key={type}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium border shrink-0 ${
                          ENTRY_TYPE_COLORS[type] ??
                          "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {ENTRY_TYPE_LABELS[type] ?? type}
                      </span>
                    ),
                  )}
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
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-warning hover:bg-warning/15 dark:hover:bg-warning/15 transition focus:outline-none focus:ring-2 focus:ring-warning/30"
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
                            <div className="border-t border-border pt-1.5 flex items-center justify-between gap-2 font-medium">
                              <span>Soma (bruto)</span>
                              <span className="font-mono">
                                {formatCurrency(grossValue)}
                              </span>
                            </div>
                          )}
                          {tax.inss > 0 && (
                            <div className="flex items-center justify-between gap-2 text-destructive dark:text-destructive">
                              <span>− INSS</span>
                              <span className="font-mono">
                                {formatCurrency(tax.inss)}
                              </span>
                            </div>
                          )}
                          {tax.irpf > 0 && (
                            <div className="flex items-center justify-between gap-2 text-destructive dark:text-destructive">
                              <span>− IRPF</span>
                              <span className="font-mono">
                                {formatCurrency(tax.irpf)}
                              </span>
                            </div>
                          )}
                          {tax.discounts.map((d, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2 text-destructive dark:text-destructive"
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
                            <span className="font-mono text-primary dark:text-primary">
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
                      ? "text-success dark:text-success"
                      : "text-foreground"
                  }`}
                >
                  {formatCurrency(value)}
                </p>

                {/* Estado do PIX, quando existe tentativa pra esta linha. */}
                {tx && tx.status !== "settled" && (
                  <Badge
                    variant="outline"
                    className={
                      tx.status === "failed"
                        ? "border-destructive/40 text-destructive"
                        : tx.status === "unknown"
                          ? "border-warning/40 text-warning"
                          : "border-info/40 text-info"
                    }
                    title={tx.error_message ?? undefined}
                  >
                    {tx.status === "failed"
                      ? "Recusado"
                      : tx.status === "unknown"
                        ? "Em conferência"
                        : "Enviando…"}
                  </Badge>
                )}

                {/* Transferência travada em voo: dá ao operador como conferir
                    agora (sem esperar o cron) e como cancelar pra destravar o
                    lançamento. No sandbox o banco-fake nunca finaliza, então é
                    por aqui que o teste sai do "Enviando…". */}
                {podePagar && emVoo && (
                  <div className="flex items-center gap-1.5">
                    {tx && tx.status !== "created" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={checkNow.isPending || cancel.isPending}
                        onClick={() => void handleCheckNow(entry.id)}
                        title="Perguntar ao banco o estado agora"
                      >
                        {checkNow.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MagnifyingGlass className="w-4 h-4" />
                        )}
                        Conferir
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={checkNow.isPending || cancel.isPending}
                      onClick={() => void handleCancel(entry.id)}
                      title="Cancelar e liberar o lançamento"
                    >
                      {cancel.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <XIcon className="w-4 h-4" />
                      )}
                      Cancelar
                    </Button>
                  </div>
                )}

                {/* Botão Pagar. Só aparece pra quem pode pagar, em folha
                    aprovada, e some quando o pagamento já foi feito ou já tem
                    tentativa em voo — abrir uma segunda o servidor recusaria de
                    qualquer forma. */}
                {podePagar && folhaLiberada && !isPaid && !emVoo && (
                  <Button
                    size="sm"
                    variant={tx?.status === "failed" ? "outline" : "default"}
                    disabled={!pixKey}
                    title={pixKey ? undefined : "Colaborador sem chave PIX cadastrada"}
                    onClick={() => setPagando(entry.id)}
                  >
                    {tx?.status === "failed" ? "Tentar de novo" : "Pagar"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Diálogo de pagamento — montado fora da lista pra não remontar a cada
          re-render das linhas. */}
      {pagando && (() => {
        const entry = filteredEntries.find((e) => e.id === pagando);
        if (!entry) return null;
        const bd = taxBreakdownByEntry.get(entry.id);
        return (
          <PixPaymentDialog
            open
            onOpenChange={(o) => !o && setPagando(null)}
            periodId={periodId}
            entryId={entry.id}
            collaboratorName={entry.collaborator?.name ?? ""}
            pixKey={entry.collaborator?.pix_key ?? null}
            amount={Number(entry.value)}
            gross={(bd?.components ?? []).reduce((s, c) => s + c.value, 0)}
            inss={bd?.inss ?? 0}
            irpf={bd?.irpf ?? 0}
            components={bd?.components ?? []}
            discounts={bd?.discounts ?? []}
          />
        );
      })()}
    </div>
  );
}
