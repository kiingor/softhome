import { useMemo, useState } from "react";
import {
  Bank,
  ArrowClockwise,
  Eye,
  EyeSlash,
  CaretDown,
  CircleNotch as Loader2,
  ArrowDownLeft,
  ArrowUpRight,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Segmented } from "./Segmented";
import {
  useAccountBalance,
  useAccountStatement,
  type StatementEntry,
} from "../hooks/use-pix-account";

// ─────────────────────────────────────────────────────────────────────────────
// Card de saldo + extrato da conta pagadora, no topo da aba Pagamentos.
//
// Segue o mesmo padrão de card do resumo (border + bg-card + shadow-soft), com
// eyebrow no rótulo e mono nos números. Saldo é dado sensível em tela
// compartilhada, então nasce OCULTO — o operador revela com o olho. O extrato é
// sob demanda (cada consulta bate no banco) e usa o mesmo segmented control da
// toolbar, pra a tela não ter cada filtro de um jeito.
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
  const [period, setPeriod] = useState<"month" | "7" | "30">("month");

  const balance = useAccountBalance(companyId, true);
  const statement = useAccountStatement(companyId);

  const available = toNumber(balance.data?.available ?? null);
  const blocked = toNumber(balance.data?.blocked ?? null);
  const invested = toNumber(balance.data?.invested ?? null);

  const accountLabel = useMemo(() => {
    const b = balance.data?.branch;
    const a = balance.data?.account;
    if (!b && !a) return "Conta Santander";
    return `Ag ${b ?? "—"} · ${a ?? "—"}`;
  }, [balance.data?.branch, balance.data?.account]);

  const loadRange = (p: "month" | "7" | "30") => {
    setPeriod(p);
    const to = new Date();
    const from = new Date();
    if (p === "month") from.setDate(1);
    else from.setDate(to.getDate() - Number(p));
    statement.mutate({ from: ymd(from), to: ymd(to) });
  };

  const openStatement = () => {
    if (showStatement) {
      setShowStatement(false);
    } else {
      setShowStatement(true);
      loadRange(period);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        {/* Conta + saldo */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary shrink-0">
            <Bank className="w-5 h-5" weight="duotone" />
          </div>
          <div className="min-w-0">
            <p className="label-eyebrow truncate">Conta Santander · {accountLabel}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {balance.isLoading ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> consultando…
                </span>
              ) : balance.isError ? (
                <span className="text-sm text-muted-foreground">saldo indisponível</span>
              ) : available == null ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                <>
                  <p className="mono text-xl font-semibold leading-none tracking-[-0.02em] text-foreground">
                    {reveal ? formatCurrency(available) : "••••••"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    className="text-muted-foreground hover:text-foreground transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                    aria-label={reveal ? "Ocultar saldo" : "Mostrar saldo"}
                    title={reveal ? "Ocultar saldo" : "Mostrar saldo"}
                  >
                    {reveal ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </>
              )}
            </div>
            {reveal && !balance.isLoading && !balance.isError && (blocked || invested) ? (
              <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                {blocked ? `bloqueado ${formatCurrency(blocked)}` : ""}
                {blocked && invested ? " · " : ""}
                {invested ? `investido ${formatCurrency(invested)}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            disabled={balance.isFetching}
            onClick={() => void balance.refetch()}
            title="Atualizar saldo"
            aria-label="Atualizar saldo"
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
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={openStatement}
          >
            Extrato
            <CaretDown
              className={cn("w-3.5 h-3.5 transition-transform", showStatement && "rotate-180")}
            />
          </Button>
        </div>
      </div>

      {balance.isError && (
        <p className="mt-2 text-xs text-muted-foreground">
          {(balance.error as Error)?.message ?? "Não deu pra consultar o saldo agora."}
        </p>
      )}

      {showStatement && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <span className="label-eyebrow">Extrato</span>
            <Segmented
              ariaLabel="Período do extrato"
              value={period}
              onChange={(v) => loadRange(v as "month" | "7" | "30")}
              options={[
                { value: "month", label: "Este mês" },
                { value: "7", label: "7 dias" },
                { value: "30", label: "30 dias" },
              ]}
            />
          </div>

          {statement.isPending ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
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
    return <p className="text-xs text-muted-foreground py-3 text-center">Sem lançamentos no período.</p>;
  }
  return (
    <div className="max-h-72 overflow-y-auto -mx-1 px-1">
      {entries.map((e, i) => {
        const isCredit = String(e.creditDebit ?? "").toUpperCase().startsWith("CRED");
        const amount = Number(String(e.amount ?? "0").replace(",", "."));
        return (
          <div
            key={e.transactionId ?? i}
            className="flex items-center gap-3 py-2 border-b border-border/60 last:border-0"
          >
            <div
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded-md shrink-0",
                isCredit ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {isCredit ? (
                <ArrowDownLeft className="w-3.5 h-3.5" />
              ) : (
                <ArrowUpRight className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/90 truncate" title={e.name ?? undefined}>
                {e.name ?? e.type ?? "Lançamento"}
              </p>
              <p className="text-[10px] text-muted-foreground mono">
                {e.type ?? "—"}
                {e.date ? ` · ${e.date}` : ""}
              </p>
            </div>
            <span
              className={cn(
                "mono text-xs font-medium tabular-nums shrink-0",
                isCredit ? "text-success" : "text-foreground",
              )}
            >
              {isCredit ? "+" : "−"}
              {formatCurrency(Math.abs(amount))}
            </span>
          </div>
        );
      })}
      {hasMore && (
        <p className="text-[10px] text-muted-foreground/70 pt-2 text-center italic">
          Mostrando os primeiros lançamentos do período.
        </p>
      )}
    </div>
  );
}
