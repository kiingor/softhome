import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  CircleNotch as Loader2,
  Warning,
  CheckCircle,
  Copy,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { usePixPayment, type PixChallenge } from "../hooks/use-pix-payment";
import type { PaymentLineComponent, PaymentLineDiscount } from "../lib/buildPaymentLines";

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  entryId: string;
  collaboratorName: string;
  /** Chave PIX do cadastro — só pra conferência visual antes de disparar. */
  pixKey: string | null;
  amount: number;
  gross: number;
  inss: number;
  irpf: number;
  components: PaymentLineComponent[];
  discounts: PaymentLineDiscount[];
}

type Etapa = "conferencia" | "codigo" | "resultado";

const secondsUntil = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

/**
 * Linha do comprovante. A regra que faltava e quebrava o diálogo: num flex, o
 * `truncate` só corta se o item puder encolher (`min-w-0`). Sem isso, uma
 * descrição longa ("GRATIFICAÇÃO ESPONTÂNEA — 300,00 …") empurra o valor pra
 * fora do card. Aqui o rótulo encolhe/trunca e o valor nunca sai do lugar.
 */
function ReceiptRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "debit" | "total";
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          "min-w-0 truncate " +
          (tone === "debit"
            ? "text-destructive"
            : strong || tone === "total"
              ? "text-foreground font-medium"
              : "text-muted-foreground")
        }
        title={label}
      >
        {label}
      </span>
      <span
        className={
          "mono shrink-0 tabular-nums " +
          (tone === "debit"
            ? "text-destructive"
            : tone === "total"
              ? "text-primary font-semibold"
              : "")
        }
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Confirmação de um PIX da folha, em dois passos, apresentada como comprovante.
 *
 * O primeiro passo existe pra que a pessoa VEJA o destinatário e o valor antes
 * de qualquer coisa sair — PIX não volta, e "confirma que é essa pessoa" é a
 * última barreira que depende de gente. O segundo passo é o código que chega no
 * WhatsApp dela, com o mesmo nome e o mesmo valor na mensagem: se o que está na
 * tela e o que está no celular divergirem, algo está muito errado.
 */
export function PixPaymentDialog({
  open,
  onOpenChange,
  periodId,
  entryId,
  collaboratorName,
  pixKey,
  amount,
  gross,
  inss,
  irpf,
  components,
  discounts,
}: PixPaymentDialogProps) {
  const { challenge, execute } = usePixPayment(periodId);
  const [etapa, setEtapa] = useState<Etapa>("conferencia");
  const [desafio, setDesafio] = useState<PixChallenge | null>(null);
  const [codigo, setCodigo] = useState("");
  const [restante, setRestante] = useState(0);
  const [resultado, setResultado] = useState<{
    status: string;
    endToEnd?: string | null;
    mensagem: string;
    motivo?: string | null;
  } | null>(null);

  // Reabrir o diálogo sempre começa do zero: um desafio de uma tentativa
  // anterior não pode ser reaproveitado sem passar pela conferência de novo.
  useEffect(() => {
    if (!open) {
      setEtapa("conferencia");
      setDesafio(null);
      setCodigo("");
      setResultado(null);
    }
  }, [open]);

  useEffect(() => {
    if (etapa !== "codigo" || !desafio) return;
    setRestante(secondsUntil(desafio.expires_at));
    const id = window.setInterval(
      () => setRestante(secondsUntil(desafio.expires_at)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [etapa, desafio]);

  const pedirCodigo = async () => {
    try {
      const d = await challenge.mutateAsync(entryId);
      setDesafio(d);
      setEtapa("codigo");
    } catch (err) {
      toast.error("Não deu pra iniciar o pagamento. " + (err as Error).message);
    }
  };

  const confirmar = async () => {
    try {
      const r = await execute.mutateAsync({
        entryId,
        code: codigo,
        challengeId: desafio?.challenge_id,
      });
      setResultado({
        status: r.status,
        endToEnd: r.end_to_end_id,
        // A função já devolve a frase pronta; não prefixar nada em cima dela.
        motivo: r.detail ?? null,
        mensagem:
          r.status === "settled"
            ? "O pagamento foi concluído."
            : r.status === "unknown"
              ? "O banco não respondeu a tempo. O pagamento NÃO foi reenviado — estamos conferindo com o Santander e o resultado aparece na lista em alguns minutos."
              : r.status === "failed"
                ? r.message ?? "O banco recusou o pagamento."
                : "Enviado. Aguardando a confirmação do banco.",
      });
      setEtapa("resultado");
    } catch (err) {
      // Código errado não fecha o diálogo: a pessoa tenta de novo.
      toast.error((err as Error).message ?? "Código inválido");
      setCodigo("");
    }
  };

  const copiarComprovante = async () => {
    if (!resultado?.endToEnd) return;
    try {
      await navigator.clipboard.writeText(resultado.endToEnd);
      toast.success("Comprovante copiado");
    } catch {
      toast.error("Não consegui copiar.");
    }
  };

  const totalDescontos = discounts.reduce((s, d) => s + d.value, 0);
  const temDeducao = inss > 0 || irpf > 0 || totalDescontos > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* flex-col + max-h: o corpo do comprovante rola por dentro; cabeçalho e
          rodapé ficam fixos. Sem isso, uma folha com muitos componentes
          empurrava o conteúdo pra fora do diálogo. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]">
        {etapa === "conferencia" && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>Confirma que é essa pessoa?</DialogTitle>
              <DialogDescription>
                PIX não volta. Confere o destinatário e o valor antes de seguir.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
              {/* Favorecido */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-semibold text-foreground break-words">
                  {collaboratorName}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Chave PIX
                </p>
                <p className="mono break-all text-[13px] text-foreground">
                  {pixKey ?? "—"}
                </p>
              </div>

              {/* Demonstrativo, estilo comprovante */}
              <div className="mt-4 space-y-1.5">
                {components.map((c, i) => (
                  <ReceiptRow key={`c${i}`} label={c.label} value={formatCurrency(c.value)} />
                ))}

                {components.length > 1 && (
                  <div className="border-t border-dashed border-border pt-1.5">
                    <ReceiptRow label="Bruto" value={formatCurrency(gross)} strong />
                  </div>
                )}

                {inss > 0 && (
                  <ReceiptRow label="INSS" value={"− " + formatCurrency(inss)} tone="debit" />
                )}
                {irpf > 0 && (
                  <ReceiptRow label="IRPF" value={"− " + formatCurrency(irpf)} tone="debit" />
                )}
                {discounts.map((d, i) => (
                  <ReceiptRow
                    key={`d${i}`}
                    label={d.label}
                    value={"− " + formatCurrency(d.value)}
                    tone="debit"
                  />
                ))}

                <div className="mt-1 border-t border-border pt-2 text-base">
                  <ReceiptRow label="Vai sair" value={formatCurrency(amount)} tone="total" />
                </div>

                {temDeducao && (
                  <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
                    FGTS é encargo do empregador — não desconta do valor pago.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border px-5 py-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={pedirCodigo} disabled={challenge.isPending || !pixKey}>
                {challenge.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enviar código
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === "codigo" && desafio && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle>Digite o código</DialogTitle>
              <DialogDescription>
                Mandei um código pro seu WhatsApp ●●●● {desafio.last4}. Confere se
                o nome e o valor na mensagem batem com o que você vai pagar.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 px-5 py-6">
              <div className="w-full rounded-lg border border-border bg-muted/30 p-3 text-center text-sm">
                <p className="font-semibold text-foreground break-words">
                  {desafio.payee_name}
                </p>
                <p className="mono mt-0.5 text-lg font-semibold text-primary">
                  {formatCurrency(desafio.amount)}
                </p>
              </div>

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
                disabled={codigo.length !== 6 || execute.isPending || restante === 0}
              >
                {execute.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar e pagar
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === "resultado" && resultado && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle className="flex items-center gap-2">
                {resultado.status === "settled" ? (
                  <CheckCircle className="w-5 h-5 text-success" weight="fill" />
                ) : (
                  <Warning className="w-5 h-5 text-warning" weight="fill" />
                )}
                {resultado.status === "settled"
                  ? "Comprovante de pagamento"
                  : resultado.status === "failed"
                    ? "O banco recusou"
                    : "Aguardando o banco"}
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
              {resultado.status === "settled" ? (
                <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                  <p className="text-xs text-muted-foreground">Pago para</p>
                  <p className="font-semibold text-foreground break-words">
                    {collaboratorName}
                  </p>
                  <p className="mono mt-3 text-2xl font-semibold text-success">
                    {formatCurrency(amount)}
                  </p>
                  {resultado.endToEnd && (
                    <div className="mt-3 border-t border-dashed border-success/30 pt-3">
                      <p className="text-xs text-muted-foreground">
                        Identificador da transação (E2E)
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="mono break-all text-[12px] text-foreground">
                          {resultado.endToEnd}
                        </span>
                        <button
                          type="button"
                          onClick={copiarComprovante}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Copiar comprovante"
                          title="Copiar"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={
                    "rounded-lg border p-4 " +
                    (resultado.status === "failed"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-warning/30 bg-warning/5")
                  }
                >
                  <p className="font-medium text-foreground break-words">
                    {collaboratorName} · {formatCurrency(amount)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {resultado.mensagem}
                  </p>
                  {/* Motivo do banco na recusa — o que o operador precisa pra
                      resolver (chave errada, conta inexistente, etc.). */}
                  {resultado.status === "failed" && resultado.motivo && (
                    <div className="mt-3 rounded border border-destructive/20 bg-background/60 p-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Motivo do banco
                      </p>
                      <p className="mono break-words text-[12px] text-destructive">
                        {resultado.motivo}
                      </p>
                    </div>
                  )}
                  {resultado.status === "unknown" && (
                    <p className="mt-2 text-xs text-warning">
                      Nada foi reenviado. Acompanha o estado na própria lista.
                    </p>
                  )}
                </div>
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
