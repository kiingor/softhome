import { useCallback, useEffect, useRef, useState } from "react";
import {
  SESSION_KEYS,
  type SessionEndReason,
  type SessionPolicy,
} from "@/lib/security/session-policy";

/** De quanto em quanto tempo reavaliamos os relógios. */
const TICK_MS = 1_000;

/**
 * Só eventos de interação real. `mousemove` fica de fora de propósito: um mouse
 * encostado numa mesa renova sessão pra sempre, que é justamente o que a gente
 * quer evitar.
 */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

/** Só grava no localStorage a cada 10s — atividade dispara muito evento. */
const ACTIVITY_WRITE_THROTTLE_MS = 10_000;

const now = () => Date.now();

const readClock = (key: string): number | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeClock = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage indisponível — o hook segue funcionando em memória.
  }
};

export interface UseSessionTimeoutOptions {
  policy: SessionPolicy;
  /** Liga o monitoramento. Fica `false` enquanto não há usuário logado. */
  enabled: boolean;
  /**
   * Início da sessão informado pelo servidor (`user.last_sign_in_at`). É o
   * relógio preferido pro limite absoluto porque não reinicia a cada reload da
   * página. Sem ele, caímos num timestamp local.
   */
  serverSessionStartedAt?: string | null;
  /** Executado quando a sessão cai. Deve limpar a sessão e redirecionar. */
  onExpire: (reason: SessionEndReason) => void;
}

export interface SessionTimeoutState {
  /** Motivo do aviso em tela, ou `null` quando não há aviso. */
  warningReason: SessionEndReason | null;
  /** Segundos restantes até a queda — alimenta a contagem regressiva. */
  secondsLeft: number;
  /** "Continuar conectado": renova o relógio de inatividade. */
  extend: () => void;
}

/**
 * Monitora inatividade e tempo total de sessão, avisando antes de derrubar.
 *
 * Os dois relógios vivem no `localStorage`, então todas as abas leem os mesmos
 * valores: interação numa aba mantém as outras vivas e a expiração acontece em
 * todas praticamente ao mesmo tempo.
 *
 * Enquanto o aviso está na tela a atividade passiva é ignorada de propósito —
 * rolar a página não pode cancelar o aviso sem o usuário perceber. Só o clique
 * em "Continuar conectado" (`extend`) renova.
 */
export function useSessionTimeout({
  policy,
  enabled,
  serverSessionStartedAt,
  onExpire,
}: UseSessionTimeoutOptions): SessionTimeoutState {
  const [warningReason, setWarningReason] = useState<SessionEndReason | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const warningRef = useRef<SessionEndReason | null>(null);
  const lastWriteRef = useRef(0);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  warningRef.current = warningReason;

  /** Início da sessão: preferimos o carimbo do servidor ao relógio local. */
  const resolveStartedAt = useCallback((): number => {
    const fromServer = serverSessionStartedAt
      ? new Date(serverSessionStartedAt).getTime()
      : NaN;
    if (Number.isFinite(fromServer) && fromServer > 0) return fromServer;

    const stored = readClock(SESSION_KEYS.startedAt);
    if (stored) return stored;

    const started = now();
    writeClock(SESSION_KEYS.startedAt, started);
    return started;
  }, [serverSessionStartedAt]);

  const touch = useCallback(() => {
    const at = now();
    lastWriteRef.current = at;
    writeClock(SESSION_KEYS.lastActivity, at);
  }, []);

  const extend = useCallback(() => {
    setWarningReason(null);
    warningRef.current = null;
    touch();
  }, [touch]);

  // Semeia os relógios ao ligar o monitoramento (login ou reload já logado).
  useEffect(() => {
    if (!enabled) {
      expiredRef.current = false;
      setWarningReason(null);
      return;
    }
    expiredRef.current = false;
    resolveStartedAt();
    if (!readClock(SESSION_KEYS.lastActivity)) touch();
  }, [enabled, resolveStartedAt, touch]);

  // Registra atividade do usuário (throttled).
  useEffect(() => {
    if (!enabled) return;

    const handler = () => {
      // Com o aviso na tela, só o botão renova.
      if (warningRef.current) return;
      if (now() - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      touch();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handler, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
    };
  }, [enabled, touch]);

  // Outra aba renovou a atividade → derruba o aviso daqui também.
  useEffect(() => {
    if (!enabled) return;

    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEYS.lastActivity || !e.newValue) return;
      const at = Number(e.newValue);
      if (!Number.isFinite(at)) return;
      if (now() - at < policy.idleMs - policy.warningMs) {
        setWarningReason(null);
        warningRef.current = null;
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [enabled, policy.idleMs, policy.warningMs]);

  // Relógio principal: avalia inatividade e tempo absoluto.
  useEffect(() => {
    if (!enabled) return;

    const evaluate = () => {
      if (expiredRef.current) return;

      const at = now();
      const lastActivity = readClock(SESSION_KEYS.lastActivity) ?? at;
      const startedAt = resolveStartedAt();

      // Relógio do sistema pra trás (fuso, NTP) não pode virar sessão eterna
      // nem queda imediata: normalizamos negativo pra zero.
      const idleFor = Math.max(0, at - lastActivity);
      const aliveFor = Math.max(0, at - startedAt);

      const msToIdle = policy.idleMs - idleFor;
      const msToAbsolute = policy.absoluteMs - aliveFor;

      const reason: SessionEndReason = msToAbsolute < msToIdle ? "absolute" : "idle";
      const msLeft = Math.min(msToIdle, msToAbsolute);

      if (msLeft <= 0) {
        expiredRef.current = true;
        setWarningReason(null);
        warningRef.current = null;
        onExpireRef.current(reason);
        return;
      }

      if (msLeft <= policy.warningMs) {
        setWarningReason((prev) => (prev === reason ? prev : reason));
        warningRef.current = reason;
        setSecondsLeft(Math.ceil(msLeft / 1000));
      } else if (warningRef.current) {
        setWarningReason(null);
        warningRef.current = null;
      }
    };

    evaluate();
    const id = window.setInterval(evaluate, TICK_MS);

    // Aba voltando do background (ou notebook saindo do sleep) reavalia na
    // hora, sem esperar o próximo tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, policy.idleMs, policy.absoluteMs, policy.warningMs, resolveStartedAt]);

  return { warningReason, secondsLeft, extend };
}
