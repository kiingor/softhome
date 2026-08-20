import { useCallback, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { supabase } from "@/integrations/supabase/client";
import {
  broadcastSessionEnd,
  clearSessionClocks,
  markSessionEnded,
  subscribeSessionEnd,
  type SessionEndReason,
  type SessionPolicy,
} from "@/lib/security/session-policy";

interface SessionTimeoutGuardProps {
  /** Política aplicada — dashboard e portal têm prazos diferentes. */
  policy: SessionPolicy;
  /** `false` enquanto não há usuário logado (tela de login, carregando). */
  enabled: boolean;
  /** `user.last_sign_in_at` do Supabase, âncora do limite absoluto. */
  serverSessionStartedAt?: string | null;
  /** Pra onde mandar depois de derrubar. */
  redirectTo: string;
}

const formatCountdown = (totalSeconds: number): string => {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
};

const WARNING_COPY: Record<SessionEndReason, { title: string; body: string }> = {
  idle: {
    title: "Ainda por aí?",
    body: "Faz um tempo que você não mexe em nada. Por segurança, a sessão vai cair em",
  },
  absolute: {
    title: "Sua sessão está chegando ao fim",
    body: "Toda sessão tem um tempo máximo por segurança. Esta acaba em",
  },
};

/**
 * Derruba a sessão por inatividade ou por tempo máximo, avisando antes.
 *
 * Montado uma vez por superfície autenticada (dashboard e portal). Não renderiza
 * nada enquanto a sessão está saudável.
 */
const SessionTimeoutGuard = ({
  policy,
  enabled,
  serverSessionStartedAt,
  redirectTo,
}: SessionTimeoutGuardProps) => {
  /**
   * Encerra a sessão de verdade. `scope: "local"` revoga *esta* sessão no
   * servidor (o refresh token para de valer) sem derrubar o mesmo usuário em
   * outros aparelhos — expirar no desktop não pode deslogar o celular.
   *
   * O `replace` acontece mesmo se a chamada falhar: falha de rede não pode
   * deixar o usuário preso numa sessão que já deveria ter caído.
   */
  const terminate = useCallback(
    (reason: SessionEndReason | null, { notifyOtherTabs = true } = {}) => {
      if (reason) markSessionEnded(reason);
      clearSessionClocks();
      // Quem derruba avisa as outras abas. Quem foi avisado não re-emite, senão
      // o sinal ecoa entre as abas.
      if (notifyOtherTabs) broadcastSessionEnd(reason ?? "manual");

      void supabase.auth
        .signOut({ scope: "local" })
        .catch(() => undefined)
        .finally(() => {
          window.location.replace(redirectTo);
        });
    },
    [redirectTo],
  );

  const handleExpire = useCallback(
    (reason: SessionEndReason) => terminate(reason),
    [terminate],
  );

  // Outra aba encerrou a sessão: esta cai junto, na hora.
  useEffect(() => {
    if (!enabled) return;
    return subscribeSessionEnd((reason) => {
      terminate(reason === "manual" ? null : reason, { notifyOtherTabs: false });
    });
  }, [enabled, terminate]);

  const { warningReason, secondsLeft, extend } = useSessionTimeout({
    policy,
    enabled,
    serverSessionStartedAt,
    onExpire: handleExpire,
  });

  if (!warningReason) return null;

  const copy = WARNING_COPY[warningReason];

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {copy.body}{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatCountdown(secondsLeft)}
            </span>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => terminate(null)}>
            Sair agora
          </AlertDialogCancel>
          {/* No limite absoluto não há o que estender — só dá pra sair. */}
          {warningReason === "idle" && (
            <AlertDialogAction onClick={extend}>Continuar conectado</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SessionTimeoutGuard;
