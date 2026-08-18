// Diálogo de cadastro do celular de confirmação de pagamento — dois passos.
//
//   Passo 1 (telefone + senha): a senha não é burocracia. Cadastrar/trocar o
//     celular é a operação que DERRUBA o 2FA — se bastasse a sessão, um JWT
//     roubado cadastraria o número do atacante. A edge function reautentica.
//   Passo 2 (código): prova de posse. O código chega pelo WhatsApp DA EMPRESA,
//     vale 10 min e tem 3 tentativas.
//
// O que esta tela NUNCA mostra: o código (ele só existe no celular) e o
// telefone completo depois de cadastrado (só o final, vindo de phone_last4).

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
  Eye,
  EyeSlash as EyeOff,
  WhatsappLogo,
  Warning,
  ShieldCheck,
  ArrowLeft,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatPhoneInput } from "@/lib/validators";
import {
  PAYMENT_2FA_MAX_ATTEMPTS,
  PAYMENT_2FA_RESEND_SECONDS,
  usePayment2faEnrollConfirm,
  usePayment2faEnrollStart,
  type EnrollStartResult,
} from "@/hooks/usePayment2fa";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Já existe aparelho ativo? Muda o texto e avisa da janela de 1 hora. */
  isReplacement?: boolean;
}

/** mm:ss a partir de segundos. Abaixo de zero vira 0:00, não número negativo. */
function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Payment2faEnrollDialog({ open, onOpenChange, isReplacement }: Props) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  // A senha vive SÓ na memória deste diálogo e some no reset (fechar, concluir
  // ou voltar pro passo 1). Ela fica guardada durante o passo 2 por um motivo
  // concreto: o "Reenviar" chama a mesma function do passo 1, que exige senha —
  // sem isso, cada reenvio jogaria a pessoa de volta pro começo do formulário.
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<EnrollStartResult | null>(null);
  const [sentAt, setSentAt] = useState<number>(0);
  const [attemptsLeft, setAttemptsLeft] = useState(PAYMENT_2FA_MAX_ATTEMPTS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Relógio local: um tick por segundo alimenta os dois contadores (expiração
  // do código e liberação do reenvio) sem precisar de dois intervals.
  const [now, setNow] = useState(() => Date.now());

  const startMutation = usePayment2faEnrollStart();
  const confirmMutation = usePayment2faEnrollConfirm();

  const digits = phone.replace(/\D/g, "");
  const phoneLooksValid = digits.length === 10 || digits.length === 11;

  const secondsToExpire = useMemo(() => {
    if (!challenge) return 0;
    return Math.ceil((new Date(challenge.expires_at).getTime() - now) / 1000);
  }, [challenge, now]);

  const secondsToResend = useMemo(() => {
    if (!sentAt) return 0;
    return Math.ceil((sentAt + PAYMENT_2FA_RESEND_SECONDS * 1000 - now) / 1000);
  }, [sentAt, now]);

  const isExpired = Boolean(challenge) && secondsToExpire <= 0;
  const isOutOfAttempts = attemptsLeft <= 0;
  // Código morto (expirou ou esgotou tentativas) libera o reenvio na hora —
  // segurar mais 40s um campo que já não aceita nada seria só castigo.
  const canResend =
    !startMutation.isPending && (secondsToResend <= 0 || isExpired || isOutOfAttempts);
  const codeIsDead = isExpired || isOutOfAttempts;

  const resetAll = useCallback(() => {
    setStep("phone");
    setPhone("");
    setPassword("");
    setShowPassword(false);
    setCode("");
    setChallenge(null);
    setSentAt(0);
    setAttemptsLeft(PAYMENT_2FA_MAX_ATTEMPTS);
    setErrorMessage(null);
  }, []);

  // Tick de 1s só enquanto o passo do código está aberto: nada pra contar no
  // passo 1, e um interval rodando com o diálogo fechado seria desperdício.
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

  const sendCode = async (isResend: boolean) => {
    setErrorMessage(null);
    try {
      const result = await startMutation.mutateAsync({ phone: digits, password });
      setChallenge(result);
      setSentAt(Date.now());
      setCode("");
      // Desafio novo = contador de tentativas novo (o backend também zera:
      // cada linha de challenge tem seu próprio attempts).
      setAttemptsLeft(PAYMENT_2FA_MAX_ATTEMPTS);
      setStep("code");
      toast.success(
        isResend
          ? `Mandamos outro código pro final ${result.last4}`
          : `Código enviado pro WhatsApp do final ${result.last4}`,
      );
    } catch (err) {
      const error = err as { code?: string; message?: string };
      setErrorMessage(error.message ?? "Algo não foi bem aqui. Tenta de novo?");
      // Senha errada volta pro passo 1: é lá que está o campo pra corrigir.
      if (error.code === "INVALID_PASSWORD") {
        setPassword("");
        setStep("phone");
      }
    }
  };

  const handleConfirm = async (value: string) => {
    setErrorMessage(null);
    try {
      const result = await confirmMutation.mutateAsync({
        challengeId: challenge!.challenge_id,
        code: value,
      });
      toast.success(
        result.replaced
          ? "Celular trocado ✓ Ele libera pagamentos daqui a 1 hora."
          : "Pronto, celular confirmado ✓",
      );
      resetAll();
      onOpenChange(false);
    } catch (err) {
      const error = err as { code?: string; message?: string };
      setCode("");
      // O servidor NÃO devolve quantas tentativas sobraram — de propósito, pra
      // não virar oráculo. Contamos aqui a partir do max_attempts do schema; é
      // uma estimativa honesta pra tela, o limite de verdade é o do banco.
      if (error.code === "INVALID_CODE") {
        setAttemptsLeft((n) => Math.max(0, n - 1));
      }
      setErrorMessage(error.message ?? "Código inválido. Confere e tenta de novo.");
    }
  };

  const backToPhone = () => {
    setStep("phone");
    setCode("");
    setChallenge(null);
    setSentAt(0);
    setErrorMessage(null);
    setAttemptsLeft(PAYMENT_2FA_MAX_ATTEMPTS);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" weight="fill" />
            {isReplacement ? "Trocar celular de confirmação" : "Cadastrar celular de confirmação"}
          </DialogTitle>
          <DialogDescription>
            {step === "phone"
              ? "Esse é o celular que vai receber o código toda vez que você realizar um pagamento."
              : `Digita o código de 6 dígitos que chegou no WhatsApp do final ${challenge?.last4 ?? ""}.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Passo 1: telefone + senha ─────────────────────────────────── */}
        {step === "phone" && (
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (phoneLooksValid && password) void sendCode(false);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="p2fa-phone">Seu celular com WhatsApp</Label>
              <Input
                id="p2fa-phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                autoFocus
              />
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <WhatsappLogo className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Vamos mandar um código de 6 dígitos pelo WhatsApp da empresa. Precisa
                ser um número seu, com WhatsApp ativo — o mesmo número não pode ser
                usado por duas pessoas.
              </p>
              {phone && !phoneLooksValid && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <Warning className="w-3 h-3" weight="fill" />
                  Esse número não tá batendo. Confere o DDD e os dígitos.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="p2fa-password">Sua senha atual</Label>
              <div className="relative">
                <Input
                  id="p2fa-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="A senha que você usa pra entrar"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pedimos a senha porque esse cadastro é o que protege os pagamentos.
                Só quem sabe a senha pode trocar o celular.
              </p>
            </div>

            {isReplacement && (
              <div className="rounded-lg bg-warning/10 p-3 text-xs text-foreground">
                Depois de trocar, o celular novo só libera pagamentos daqui a 1 hora.
                É a nossa janela de segurança — se a troca não foi você, dá tempo de
                avisar o admin.
              </div>
            )}

            {errorMessage && (
              <p className="text-sm text-destructive flex items-start gap-1.5">
                <Warning className="w-4 h-4 mt-0.5 shrink-0" weight="fill" />
                {errorMessage}
              </p>
            )}

            {/* Submit escondido: dá Enter no formulário sem duplicar o botão. */}
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        )}

        {/* ── Passo 2: código ───────────────────────────────────────────── */}
        {step === "code" && (
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                disabled={codeIsDead || confirmMutation.isPending}
                onChange={(value) => {
                  setCode(value);
                  // Confirma sozinho ao completar: ninguém digita 6 dígitos e
                  // quer procurar botão.
                  if (value.length === 6 && !confirmMutation.isPending) {
                    void handleConfirm(value);
                  }
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

            <div className="text-center text-xs text-muted-foreground">
              {confirmMutation.isPending ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Conferindo o código...
                </span>
              ) : isExpired ? (
                <span className="text-destructive">
                  O código expirou. Pede um novo pra continuar.
                </span>
              ) : (
                <>O código vale por mais {formatCountdown(secondsToExpire)}.</>
              )}
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive flex items-start justify-center gap-1.5 text-center">
                <Warning className="w-4 h-4 mt-0.5 shrink-0" weight="fill" />
                {errorMessage}
              </p>
            )}

            {!codeIsDead && attemptsLeft < PAYMENT_2FA_MAX_ATTEMPTS && (
              <p className="text-center text-xs text-muted-foreground">
                {attemptsLeft === 1
                  ? "Resta 1 tentativa nesse código."
                  : `Restam ${attemptsLeft} tentativas nesse código.`}
              </p>
            )}

            {isOutOfAttempts && !isExpired && (
              <p className="text-center text-xs text-destructive">
                As tentativas desse código acabaram. Pede um novo.
              </p>
            )}

            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canResend}
                onClick={() => void sendCode(true)}
              >
                {startMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reenviando...
                  </>
                ) : canResend ? (
                  "Reenviar código"
                ) : (
                  `Reenviar em ${formatCountdown(secondsToResend)}`
                )}
              </Button>
              <button
                type="button"
                onClick={backToPhone}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Usar outro número
              </button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={startMutation.isPending || confirmMutation.isPending}
          >
            Cancelar
          </Button>
          {step === "phone" && (
            <Button
              onClick={() => void sendCode(false)}
              disabled={!phoneLooksValid || !password || startMutation.isPending}
            >
              {startMutation.isPending ? (
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
            <Button
              onClick={() => void handleConfirm(code)}
              disabled={code.length !== 6 || codeIsDead || confirmMutation.isPending}
            >
              {confirmMutation.isPending ? (
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

export default Payment2faEnrollDialog;
