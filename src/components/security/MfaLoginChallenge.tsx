// Tela cheia de 2º fator no login (step-up). Aparece quando a sessão está em
// AAL1 mas o usuário TEM um fator verificado — a RLS bloqueia os dados
// sensíveis até a sessão chegar a AAL2, então o lugar certo é barrar aqui.
//
// Ao montar, dispara o código no WhatsApp do aparelho cadastrado. Não mostra o
// código nem o número inteiro — só o final que já está no fator.

import { useCallback, useEffect, useRef, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { BrandLogo } from "@/components/branding/BrandLogo";
import {
  CircleNotch as Loader2,
  WhatsappLogo,
  Warning,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  challengeFactor,
  verifyFactor,
  useInvalidateMfaGate,
  type MfaPhoneFactor,
} from "@/hooks/useLoginMfa";

const RESEND_SECONDS = 40;

interface Props {
  factor: MfaPhoneFactor;
  /** Chamado após elevar a sessão a AAL2. */
  onVerified: () => void;
  /** Sair sem completar (volta pro login). */
  onCancel: () => void;
}

function humanize(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (/rate|too many|frequency/i.test(msg)) return "Muitas tentativas seguidas. Espera um pouco e tenta de novo.";
  if (/invalid|incorrect|code/i.test(msg)) return "Código inválido. Confere e tenta de novo.";
  if (/expired/i.test(msg)) return "O código expirou. Toca em reenviar.";
  if (/unavailable|whatsapp|send/i.test(msg)) return "Não deu pra enviar o código pelo WhatsApp. Fala com o admin.";
  return msg || "Algo não foi bem. Tenta de novo?";
}

export function MfaLoginChallenge({ factor, onVerified, onCancel }: Props) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsToResend, setSecondsToResend] = useState(RESEND_SECONDS);
  const invalidateGate = useInvalidateMfaGate();
  // Evita disparo duplo do desafio no StrictMode (double-mount em dev).
  const firedRef = useRef(false);

  const send = useCallback(async () => {
    setSending(true);
    setErrorMessage(null);
    try {
      const id = await challengeFactor(factor.id);
      setChallengeId(id);
      setSecondsToResend(RESEND_SECONDS);
    } catch (err) {
      setErrorMessage(humanize(err));
    } finally {
      setSending(false);
    }
  }, [factor.id]);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    if (secondsToResend <= 0) return;
    const id = window.setInterval(
      () => setSecondsToResend((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [secondsToResend]);

  const confirm = async (value: string) => {
    if (!challengeId) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await verifyFactor(factor.id, challengeId, value);
      invalidateGate();
      onVerified();
    } catch (err) {
      setCode("");
      setErrorMessage(humanize(err));
    } finally {
      setBusy(false);
    }
  };

  const canResend = !sending && !busy && secondsToResend <= 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] text-center">
        <BrandLogo size="lg" className="mx-auto mb-6" />

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="w-6 h-6 text-primary" weight="fill" />
        </div>

        <h1 className="page-title">Confirma que é você</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mandamos um código de 6 dígitos pelo WhatsApp do final{" "}
          <span className="font-medium text-foreground">
            {factor.phoneLast4 ?? "••••"}
          </span>
          .
        </p>

        <div className="mt-8 flex justify-center">
          <InputOTP
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            disabled={busy || sending || !challengeId}
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

        <div className="mt-4 text-xs text-muted-foreground min-h-[1.25rem]">
          {sending ? (
            <span className="inline-flex items-center gap-1.5">
              <WhatsappLogo className="w-3.5 h-3.5" />
              Enviando o código...
            </span>
          ) : busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Conferindo...
            </span>
          ) : null}
        </div>

        {errorMessage && (
          <p className="mt-2 text-sm text-destructive flex items-center justify-center gap-1.5">
            <Warning className="w-4 h-4 shrink-0" weight="fill" />
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          <Button variant="ghost" size="sm" disabled={!canResend} onClick={() => void send()}>
            {canResend ? "Reenviar código" : `Reenviar em ${secondsToResend}s`}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sair e voltar pro login
          </button>
        </div>
      </div>
    </div>
  );
}

export default MfaLoginChallenge;
