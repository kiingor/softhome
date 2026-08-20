import { useMemo, useState } from "react";
import {
  Bank,
  ArrowClockwise,
  Eye,
  EyeSlash,
  CaretDown,
  CircleNotch as Loader2,
  ArrowUp,
  ArrowDown,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import {
  useAccountBalance,
  useAccountStatement,
  type StatementEntry,
} from "../hooks/use-pix-account";

// ─────────────────────────────────────────────────────────────────────────────
// Card de saldo + extrato da conta pagadora, no topo da aba Pagamentos.
//
// Só renderizado pra quem pode pagar (o gate real é no servidor). Saldo é dado
// sensível em tela compartilhada, então nasce OCULTO — o operador revela com o
// olho. O extrato é sob demanda: cada consulta bate no banco de verdade.
// ─────────────────────────────────────────────────────────────────────────────

function toNumber(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** YYYY-MM-DD no fuso local, sem passar por toISOString (que joga pra UTC e pode
 *  virar o dia). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AccountBalanceCard({ companyId }: { companyId: string | undefined }) {
  const [reveal, setReveal] = useState(false);
  const [showStatement, setShowStatement] = useState(false);

  const balance = useAccountBalance(companyId, true);
  const statement = useAccountStatement(companyId);

  const available = toNumber(balance.data?.available ?? null);
  const blocked = toNumber(balance.data?.blocked ?? null);
  const invested = toNumber(balance.data?.invested ?? null);

  const accountLabel = useMemo(() => {
    const b = balance.data?.branch;
    const a = balance.data?.account;
    if (!b && !a) return "Conta Santander";
    return `Ag. ${b ?? "—"} · Conta ${a ?? "—"}`;
  }, [balance.data?.branch, balance.data?.account]);

  const loadRange = (days: number | "month") => {
    const to = new Date();
    const from = new Date();
    if (days === "month") from.setDate(1);
    else from.setDate(to.getDate() - days);
    setShowStatement(true);
    statement.mutate({ from: ymd(from), to: ymd(to) });
  };

  const hidden = "••••••";

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary shrink-0">
            <Bank className="w-5 h-5" weight="duotone" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{accountLabel}</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold font-mono tabular-nums text-foreground">
                {balance.isLoading ? (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground font-sans">
                    <Loader2 className="w-4 h-4 animate-spin" /> consultando…
                  </span>
                ) : balance.isError ? (
                  <span className="text-sm text-muted-foreground font-sans">saldo indisponível</span>
                ) : available == null ? (
                  <span className="text-sm text-muted-foreground font-sans">—</span>
                ) : reveal ? (
                  formatCurrency(available)
                ) : (
                  hidden
                )}
              </p>
              {!balance.isLoading && !balance.isError && available != null && (
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  className="text-muted-foreground hover:text-foreground transition focus:outline-none focus:ring-2 focus:ring-primary/40 rounded"
                  aria-label={reveal ? "Ocultar saldo" : "Mostrar saldo"}
                  title={reveal ? "Ocultar saldo" : "Mostrar saldo"}
                >
                  {reveal ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
            {reveal && !balance.isLoading && !balance.isError && (blocked || invested) ? (
              <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                {blocked ? `bloqueado ${formatCurrency(blocked)}` : ""}
                {blocked && invested ? " · " : ""}
                {invested ? `investido ${formatCurrency(invested)}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8"
            disabled={balance.isFetching}
            onClick={() => void balance.refetch()}
            title="Atualizar saldo"
          >
            {balance.isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowClockwise className="w-4 h-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => {
              if (showStatement) setShowStatement(false);
              else loadRange("month");
            }}
          >
            Extrato
            <CaretDown
              className={`w-3.5 h-3.5 transition-transform ${showStatement ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
      </div>

      {balance.isError && (
        <p className="text-xs text-muted-foreground mt-2">
          {(balance.error as Error)?.message ?? "Não deu pra consultar o saldo agora."}
        </p>
      )}

      {showStatement && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs text-muted-foreground mr-1">Período:</span>
            {([["Este mês", "month"], ["7 dias", 7], ["30 dias", 30]] as const).map(
              ([label, v]) => (
                <Button
                  key={label}
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={statement.isPending}
                  onClick={() => loadRange(v)}
                >
                  {label}
                </Button>
              ),
            )}
          </div>

          {statement.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> carregando extrato…
            </div>
          ) : statement.isError ? (
            <p className="text-xs text-muted-foreground py-3">
              {(statement.error as Error)?.message ?? "Não deu pra carregar o extrato."}
            </p>
          ) : statement.data ? (
            <StatementList entries={statement.data.entries} hasMore={statement.data.hasMore} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatementList({
  entries,
  hasMore,
}: {
  entries: StatementEntry[];
  hasMore: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground py-3">Sem lançamentos no período.</p>;
  }
  return (
    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
      {entries.map((e, i) => {
        const isCredit = String(e.creditDebit ?? "").toUpperCase().startsWith("CRED");
        const amount = Number(String(e.amount ?? "0").replace(",", "."));
        return (
          <div
            key={e.transactionId ?? i}
            className="flex items-center gap-2 text-xs py-1.5 border-b border-border/50 last:border-0"
          >
            <div
              className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
                isCredit
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isCredit ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-foreground/90" title={e.name ?? undefined}>
                {e.name ?? e.type ?? "Lançamento"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {e.type ?? "—"}
                {e.date ? ` · ${e.date}` : ""}
              </p>
            </div>
            <span
              className={`font-mono tabular-nums shrink-0 ${
                isCredit ? "text-success" : "text-foreground"
              }`}
            >
              {isCredit ? "+" : "−"}
              {formatCurrency(Math.abs(amount))}
            </span>
          </div>
        );
      })}
      {hasMore && (
        <p className="text-[10px] text-muted-foreground/70 pt-1 text-center italic">
          Mostrando os primeiros lançamentos do período.
        </p>
      )}
    </div>
  );
}
