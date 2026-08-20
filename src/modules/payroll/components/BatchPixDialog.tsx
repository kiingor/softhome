import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  CircleNotch as Loader2,
  Warning,
  CheckCircle,
  Users,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import {
  usePixBatch,
  type BatchChallenge,
  type BatchExecuteResult,
} from "../hooks/use-pix-payment";
import type {
  PaymentLineComponent,
  PaymentLineDiscount,
} from "../lib/buildPaymentLines";

// ─────────────────────────────────────────────────────────────────────────────
// Pagamento PIX em LOTE, apresentado como um extrato: todos os selecionados com
// valor e descontos, um código só no WhatsApp, um "Pagar" pro conjunto inteiro.
//
// A conferência (1º passo) mostra o demonstrativo calculado no cliente — o mesmo
// que a linha da lista já usa. O valor que SAI vem do servidor (linha congelada
// na aprovação); os dois batem, e divergência aparece na conferência.
//
// O 2º passo é UM código pro lote: a mensagem do WhatsApp traz contagem e total,
// e a conferência item a item é esta tela. O 3º passo é o resultado por pessoa —
// PIX não é "tudo ou nada": cada um pode liquidar, ser recusado ou ficar em
// conferência, e a tela conta honestamente qual foi qual.
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchSelectedLine {
  entryId: string;
  name: string;
  pixKey: string | null;
  amount: number;
  gross: number;
  inss: number;
  irpf: number;
  components: PaymentLineComponent[];
  discounts: PaymentLineDiscount[];
}

interface BatchPixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  lines: BatchSelectedLine[];
  /** Chamado quando o lote é enviado (pra limpar a seleção na aba). */
  onExecuted?: () => void;
}

type Etapa = "conferencia" | "codigo" | "resultado";

const secondsUntil = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

const STATUS_BADGE: Record<
  string,
  { label: string; variant?: "success" | "warning" | "info"; className?: string }
> = {
  settled: { label: "Pago", variant: "success" },
  confirmed: { label: "Enviado", variant: "info" },
  unknown: { label: "Em conferência", variant: "warning" },
  failed: {
    label: "Recusado",
    className: "border-transparent bg-destructive/12 text-destructive",
  },
};

export function BatchPixDialog({
  open,
  onOpenChange,
  periodId,
  lines,
  onExecuted,
}: BatchPixDialogProps) {
  const { challengeBatch, executeBatch } = usePixBatch(periodId);
  const [etapa, setEtapa] = useState<Etapa>("conferencia");
  const [desafio, setDesafio] = useState<BatchChallenge | null>(null);
  const [codigo, setCodigo] = useState("");
  const [restante, setRestante] = useState(0);
  const [resultado, setResultado] = useState<BatchExecuteResult | null>(null);
  // Congela a lista ao pedir o código: depois do envio a aba limpa a seleção, e
  // sem este snapshot os nomes sumiriam da tela de resultado.
  const [snap, setSnap] = useState<BatchSelectedLine[]>([]);

  const nameByEntry = useMemo(() => {
    const src = snap.length ? snap : lines;
    const m = new Map<string, string>();
    for (const l of src) m.set(l.entryId, l.name);
    return m;
  }, [snap, lines]);

  const total = useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);

  // Reabrir sempre começa do zero: um desafio anterior não vale de novo sem
  // passar pela conferência.
  useEffect(() => {
    if (!open) {
      setEtapa("conferencia");
      setDesafio(null);
      setCodigo("");
      setResultado(null);
      setSnap([]);
    }
  }, [open]);

  useEffect(() => {
    if (etapa !== "codigo" || !desafio?.expires_at) return;
    setRestante(secondsUntil(desafio.expires_at));
    const id = window.setInterval(
      () => setRestante(secondsUntil(desafio.expires_at!)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [etapa, desafio]);

  const pedirCodigo = async () => {
    setSnap(lines);
    try {
      const d = await challengeBatch.mutateAsync(lines.map((l) => l.entryId));
      setDesafio(d);
      // challenge_id null = nada estava pronto pra pagar; fica na conferência
      // mostrando os motivos (errors/skipped), sem abrir o passo do código.
      if (d.challenge_id) setEtapa("codigo");
    } catch (err) {
      toast.error("Não deu pra iniciar o lote. " + (err as Error).message);
    }
  };

  const confirmar = async () => {
    if (!desafio?.challenge_id) return;
    try {
      const r = await executeBatch.mutateAsync({
        challengeId: desafio.challenge_id,
        code: codigo,
      });
      setResultado(r);
      setEtapa("resultado");
      onExecuted?.();
    } catch (err) {
      // Código errado não fecha: tenta de novo.
      toast.error((err as Error).message ?? "Código inválido");
      setCodigo("");
    }
  };

  const foraDoLote = (desafio?.errors?.length ?? 0) + (desafio?.skipped?.length ?? 0);
  const podeConferir = lines.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        {/* ── 1. Conferência: o extrato do lote ─────────────────────────────── */}
        {etapa === "conferencia" && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>Conferir o lote</DialogTitle>
              <DialogDescription>
                {lines.length} colaborador{lines.length === 1 ? "" : "es"} · total{" "}
                <span className="mono font-semibold text-foreground">
                  {formatCurrency(total)}
                </span>
                . PIX não volta — confere a lista antes de mandar o código.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {/* Se um pedido de código voltou dizendo que nada estava pronto,
                  mostramos os motivos aqui em vez de seguir pro código. */}
              {desafio && !desafio.challenge_id && (
                <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
                  <p className="font-medium text-foreground">
                    Nenhum dos selecionados está pronto pra pagar agora.
                  </p>
                  <BatchExclusions desafio={desafio} nameByEntry={nameByEntry} />
                </div>
              )}

              <div className="divide-y divide-border/60">
                {lines.map((l) => {
                  const temDeducao = l.inss > 0 || l.irpf > 0 || l.discounts.length > 0;
                  const totalDesc = l.discounts.reduce((s, d) => s + d.value, 0);
                  return (
                    <div
                      key={l.entryId}
                      className="flex items-baseline justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate" title={l.name}>
                          {l.name}
                        </p>
                        {temDeducao ? (
                          <p className="mono text-[11px] text-muted-foreground tabular-nums">
                            bruto {formatCurrency(l.gross)}
                            {l.inss > 0 ? ` · −INSS ${formatCurrency(l.inss)}` : ""}
                            {l.irpf > 0 ? ` · −IRPF ${formatCurrency(l.irpf)}` : ""}
                            {totalDesc > 0 ? ` · −desc ${formatCurrency(totalDesc)}` : ""}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            {l.pixKey ?? "sem chave"}
                          </p>
                        )}
                      </div>
                      <span className="mono text-sm font-semibold tabular-nums shrink-0 text-foreground">
                        {formatCurrency(l.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border px-5 py-3">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm font-medium text-foreground">
                  Total do lote
                </span>
                <span className="mono text-lg font-semibold text-primary">
                  {formatCurrency(total)}
                </span>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={pedirCodigo}
                  disabled={!podeConferir || challengeBatch.isPending}
                >
                  {challengeBatch.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Enviar código
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {/* ── 2. Código: um pro lote inteiro ────────────────────────────────── */}
        {etapa === "codigo" && desafio?.challenge_id && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>Digite o código</DialogTitle>
              <DialogDescription>
                Mandei um código pro seu WhatsApp ●●●● {desafio.last4}. Confere se
                a contagem e o total na mensagem batem com o que você vai pagar.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 px-5 py-6">
              <div className="w-full rounded-lg border border-border bg-muted/30 p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" weight="duotone" />
                  {desafio.count} colaborador{desafio.count === 1 ? "" : "es"}
                </div>
                <p className="mono mt-1 text-2xl font-semibold text-primary">
                  {formatCurrency(desafio.total_amount)}
                </p>
              </div>

              {foraDoLote > 0 && (
                <div className="w-full rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs">
                  <p className="font-medium text-foreground">
                    {foraDoLote} ficaram de fora deste lote.
                  </p>
                  <BatchExclusions desafio={desafio} nameByEntry={nameByEntry} />
                </div>
              )}

              <InputOTP maxLength={6} value={codigo} onChange={setCodigo} autoFocus>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              <p className="text-xs text-muted-foreground">
                {restante > 0
                  ? `Vale por mais ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}`
                  : "O código expirou. Fecha e começa de novo."}
              </p>
            </div>

            <DialogFooter className="border-t border-border px-5 py-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={confirmar}
                disabled={codigo.length !== 6 || executeBatch.isPending || restante === 0}
              >
                {executeBatch.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Pagar {desafio.count}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── 3. Resultado por pessoa ───────────────────────────────────────── */}
        {etapa === "resultado" && resultado && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle className="flex items-center gap-2">
                {resultado.counts.failed === 0 && resultado.counts.unknown === 0 ? (
                  <CheckCircle className="w-5 h-5 text-success" weight="fill" />
                ) : (
                  <Warning className="w-5 h-5 text-warning" weight="fill" />
                )}
                Lote enviado
              </DialogTitle>
              <DialogDescription>
                <span className="text-success">{resultado.counts.settled} pago(s)</span>
                {resultado.counts.confirmed > 0 &&
                  ` · ${resultado.counts.confirmed} enviado(s)`}
                {resultado.counts.unknown > 0 && (
                  <span className="text-warning">
                    {" "}· {resultado.counts.unknown} em conferência
                  </span>
                )}
                {resultado.counts.failed > 0 && (
                  <span className="text-destructive">
                    {" "}· {resultado.counts.failed} recusado(s)
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <div className="divide-y divide-border/60">
                {resultado.results.map((r) => {
                  const badge = STATUS_BADGE[r.status] ?? {
                    label: r.status,
                    variant: "info" as const,
                  };
                  return (
                    <div key={r.transfer_id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {nameByEntry.get(r.entry_id) ?? "Colaborador"}
                        </p>
                        {(r.status === "failed" || r.status === "unknown") && (
                          <p className="text-[11px] text-muted-foreground">
                            {r.detail ?? r.message}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={badge.variant}
                        className={cn("shrink-0", badge.className)}
                      >
                        {badge.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>

              {resultado.budget_hit && resultado.remaining_count > 0 && (
                <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-foreground">
                  {resultado.remaining_count} não deu tempo de processar neste lote
                  e ficaram pendentes. Seleciona eles de novo e gera um novo código
                  pra concluir — nada foi reenviado.
                </div>
              )}

              {resultado.counts.unknown > 0 && (
                <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                  Os "em conferência" não foram reenviados — o resultado aparece na
                  própria lista em alguns minutos.
                </p>
              )}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3">
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lista compacta de quem ficou de fora do lote (erro ou já em processamento). */
function BatchExclusions({
  desafio,
  nameByEntry,
}: {
  desafio: BatchChallenge;
  nameByEntry: Map<string, string>;
}) {
  const items = [
    ...(desafio.errors ?? []).map((e) => ({ entry_id: e.entry_id, message: e.message })),
    ...(desafio.skipped ?? []).map((s) => ({ entry_id: s.entry_id, message: s.message })),
  ];
  if (items.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
      {items.slice(0, 8).map((it, i) => (
        <li key={i} className="truncate">
          • {nameByEntry.get(it.entry_id) ?? "Colaborador"} — {it.message}
        </li>
      ))}
      {items.length > 8 && <li>• e mais {items.length - 8}…</li>}
    </ul>
  );
}
