// Cadastro do 2º fator de LOGIN (telefone nativo do GoTrue) — dois passos.
//
//   Passo 1 (telefone): cria o fator e dispara o código pelo WhatsApp.
//   Passo 2 (código): confirma a posse do aparelho e verifica o fator.
//
// Depois de verificado, a RLS passa a exigir AAL2 desse usuário nos dados
// sensíveis. Esta tela nunca mostra o código nem o número completo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  CircleNotch as Loader2,
  WhatsappLogo,
  Warning,
  ShieldCheck,
  ArrowLeft,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatPhoneInput } from "@/lib/validators";
import {
  enrollPhoneStart,
  challengeFactor,
  verifyFactor,
  useInvalidateMfaGate,
  type EnrollStarted,
} from "@/hooks/useLoginMfa";

const RESEND_SECONDS = 40;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após verificar o fator com sucesso. */
  onEnrolled?: () => void;
}

function humanize(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (/already exists|already enrolled|exceeded|maximum/i.test(msg))
    return "Já existe um cadastro em andamento pra esse número. Recarrega a página e tenta de novo.";
  if (/rate|too many|frequency/i.test(msg)) return "Muitas tentativas seguidas. Espera um pouco e tenta de novo.";
  if (/invalid|incorrect|code/i.test(msg)) return "Código inválido. Confere e tenta de novo.";
  if (/expired/i.test(msg)) return "O código expirou. Pede um novo pra continuar.";
  if (/unavailable|whatsapp|send/i.test(msg)) return "Não deu pra enviar o código pelo WhatsApp. Fala com o admin.";
  return msg || "Algo não foi bem aqui. Tenta de novo?";
}

export function MfaEnrollDialog({ open, onOpenChange, onEnrolled }: Props) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [enroll, setEnroll] = useState<EnrollStarted | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const invalidateGate = useInvalidateMfaGate();

  const digits = phone.replace(/\D/g, "");
  const phoneLooksValid = digits.length === 10 || digits.length === 11;

  const secondsToResend = useMemo(() => {
    if (!sentAt) return 0;
    return Math.ceil((sentAt + RESEND_SECONDS * 1000 - now) / 1000);
  }, [sentAt, now]);
  const canResend = !busy && secondsToResend <= 0;

  const resetAll = useCallback(() => {
    setStep("phone");
    setPhone("");
    setCode("");
    setEnroll(null);
    setSentAt(0);
    setBusy(false);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!open || step !== "code") return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, step]);

  const handleOpenChange = (next: boolean) => {
    if (!next) resetAll();
    onOpenChange(next);
  };

  const start = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await enrollPhoneStart(digits);
      setEnroll(result);
      setSentAt(Date.now());
      setCode("");
      setStep("code");
      toast.success(`Código enviado pro WhatsApp do final ${result.phoneLast4}`);
    } catch (err) {
      setErrorMessage(humanize(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!enroll) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const challengeId = await challengeFactor(enroll.factorId);
      setEnroll({ ...enroll, challengeId });
      setSentAt(Date.now());
      setCode("");
      toast.success(`Mandamos outro código pro final ${enroll.phoneLast4}`);
    } catch (err) {
      setErrorMessage(humanize(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value: string) => {
    if (!enroll) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await verifyFactor(enroll.factorId, enroll.challengeId, value);
      invalidateGate();
      toast.success("Pronto, 2º fator ativado ✓ Ele vai ser pedido nos próximos logins.");
      resetAll();
      onOpenChange(false);
      onEnrolled?.();
    } catch (err) {
      setCode("");
      setErrorMessage(humanize(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" weight="fill" />
            Ativar verificação em duas etapas
          </DialogTitle>
          <DialogDescription>
            {step === "phone"
              ? "Esse é o celular que vai receber o código toda vez que você entrar no sistema."
              : `Digita o código de 6 dígitos que chegou no WhatsApp do final ${enroll?.phoneLast4 ?? ""}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "phone" && (
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (phoneLooksValid && !busy) void start();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mfa-phone">Seu celular com WhatsApp</Label>
              <Input
                id="mfa-phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                autoFocus
              />
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <WhatsappLogo className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Vamos mandar um código de 6 dígitos pelo WhatsApp. Precisa ser um
                número seu, com WhatsApp ativo.
              </p>
              {phone && !phoneLooksValid && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <Warning className="w-3 h-3" weight="fill" />
                  Esse número não tá batendo. Confere o DDD e os dígitos.
                </p>
              )}
            </div>
            {errorMessage && (
              <p className="text-sm text-destructive flex items-start gap-1.5">
                <Warning className="w-4 h-4 mt-0.5 shrink-0" weight="fill" />
                {errorMessage}
              </p>
            )}
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        )}

        {step === "code" && (
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                disabled={busy}
                onChange={(value) => {
                  setCode(value);
                  if (value.length === 6 && !busy) void confirm(value);
                }}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {busy && (
              <div className="text-center text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Conferindo...
                </span>
              </div>
            )}

            {errorMessage && (
              <p className="text-sm text-destructive flex items-start justify-center gap-1.5 text-center">
                <Warning className="w-4 h-4 mt-0.5 shrink-0" weight="fill" />
                {errorMessage}
              </p>
            )}

            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canResend}
                onClick={() => void resend()}
              >
                {busy
                  ? "Aguarde..."
                  : canResend
                    ? "Reenviar código"
                    : `Reenviar em ${Math.max(0, secondsToResend)}s`}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setEnroll(null);
                  setErrorMessage(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Usar outro número
              </button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          {step === "phone" && (
            <Button onClick={() => void start()} disabled={!phoneLooksValid || busy}>
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando código...
                </>
              ) : (
                "Enviar código"
              )}
            </Button>
          )}
          {step === "code" && (
            <Button onClick={() => void confirm(code)} disabled={code.length !== 6 || busy}>
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Confirmando...
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MfaEnrollDialog;
