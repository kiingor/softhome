/**
 * Política de expiração de sessão.
 *
 * Por padrão o Supabase renova o JWT sozinho (`autoRefreshToken: true`), então
 * uma sessão aberta nunca morre: quem deixar o DNA logado numa máquina
 * compartilhada segue logado semanas depois. Esta camada existe pra criar dois
 * limites que o Supabase não dá de graça:
 *
 *  - **Inatividade** — X minutos sem interação e a sessão cai.
 *  - **Absoluto** — Y horas desde o login e a sessão cai, mesmo com o usuário
 *    ativo. Limita a janela de uso de um token roubado.
 *
 * Os dois relógios são compartilhados entre abas via `localStorage`, então
 * atividade numa aba conta pra todas e a expiração derruba todas juntas.
 */

export interface SessionPolicy {
  /** Tempo sem interação até derrubar a sessão. */
  idleMs: number;
  /** Tempo máximo de vida da sessão desde o login, mesmo com uso contínuo. */
  absoluteMs: number;
  /** Quanto antes de expirar o aviso aparece. */
  warningMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Lê override do .env, cai no default se ausente ou inválido. */
const envMinutes = (key: string, fallbackMs: number): number => {
  const raw = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return parsed * MINUTE;
};

/**
 * Dashboard interno (RH, gestores, diretoria). Vê CPF, salário e folha inteira
 * — é a superfície mais sensível, então o prazo é o mais curto.
 */
export const DASHBOARD_SESSION_POLICY: SessionPolicy = {
  idleMs: envMinutes("VITE_SESSION_IDLE_MINUTES", 30 * MINUTE),
  absoluteMs: envMinutes("VITE_SESSION_ABSOLUTE_MINUTES", 12 * HOUR),
  warningMs: 2 * MINUTE,
};

/**
 * Portal do colaborador. Cada um só enxerga os próprios dados e costuma abrir
 * no celular pra baixar contracheque — inatividade um pouco mais generosa,
 * limite absoluto mais curto (uso é pontual, não jornada de trabalho).
 */
export const PORTAL_SESSION_POLICY: SessionPolicy = {
  idleMs: envMinutes("VITE_PORTAL_SESSION_IDLE_MINUTES", 30 * MINUTE),
  absoluteMs: envMinutes("VITE_PORTAL_SESSION_ABSOLUTE_MINUTES", 8 * HOUR),
  warningMs: 2 * MINUTE,
};

/** Chaves compartilhadas entre abas. */
export const SESSION_KEYS = {
  /** Timestamp (ms) da última interação do usuário em qualquer aba. */
  lastActivity: "dna:session:last-activity",
  /** Timestamp (ms) do início da sessão, quando o servidor não informa. */
  startedAt: "dna:session:started-at",
  /** Motivo da última expiração — a tela de login consome e mostra o aviso. */
  endedReason: "dna:session:ended-reason",
  /** Sinal de encerramento, replicado às outras abas pelo evento `storage`. */
  endSignal: "dna:session:end-signal",
} as const;

export type SessionEndReason = "idle" | "absolute";

/** Inclui a saída manual, que não gera aviso de "expirou". */
export type SessionEndTrigger = SessionEndReason | "manual";

export const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  idle: "Sua sessão expirou por inatividade. Entre de novo pra continuar.",
  absolute: "Sua sessão atingiu o tempo máximo. Entre de novo pra continuar.",
};

/** Marca o motivo da queda pra tela de login exibir depois do redirect. */
export const markSessionEnded = (reason: SessionEndReason): void => {
  try {
    localStorage.setItem(
      SESSION_KEYS.endedReason,
      JSON.stringify({ reason, at: Date.now() }),
    );
  } catch {
    // localStorage indisponível (modo privado/quota) — o aviso é opcional.
  }
};

/**
 * Lê e limpa o motivo da queda. Ignora marcas velhas (>5 min) pra não avisar
 * "expirou por inatividade" num login que aconteceu muito depois.
 */
export const consumeSessionEnded = (): SessionEndReason | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEYS.endedReason);
    if (!raw) return null;
    localStorage.removeItem(SESSION_KEYS.endedReason);

    const parsed = JSON.parse(raw) as { reason?: string; at?: number };
    if (!parsed?.reason || !parsed?.at) return null;
    if (Date.now() - parsed.at > 5 * MINUTE) return null;
    if (parsed.reason !== "idle" && parsed.reason !== "absolute") return null;

    return parsed.reason;
  } catch {
    return null;
  }
};

/**
 * Avisa as outras abas que esta sessão acabou.
 *
 * O `auth-js` do Supabase não faz broadcast de logout entre abas: sem isto, a
 * aba B continuaria mostrando a interface logada (e com o access_token válido
 * em memória) por até uma hora depois de a aba A cair.
 *
 * O `nonce` garante que dois encerramentos seguidos gerem valores diferentes —
 * o evento `storage` não dispara quando o valor gravado é igual ao anterior.
 */
export const broadcastSessionEnd = (reason: SessionEndTrigger): void => {
  try {
    localStorage.setItem(
      SESSION_KEYS.endSignal,
      JSON.stringify({
        reason,
        at: Date.now(),
        nonce: crypto.randomUUID(),
      }),
    );
  } catch {
    // Sem localStorage cada aba ainda cai sozinha no próprio tick.
  }
};

/**
 * Escuta o encerramento disparado por outra aba. Devolve a função de limpeza.
 */
export const subscribeSessionEnd = (
  onEnd: (reason: SessionEndTrigger) => void,
): (() => void) => {
  const handler = (event: StorageEvent) => {
    if (event.key !== SESSION_KEYS.endSignal || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as { reason?: string; at?: number };
      // Sinal antigo (aba aberta muito depois) não derruba ninguém.
      if (!parsed?.at || Date.now() - parsed.at > 30_000) return;
      const reason = parsed.reason;
      if (reason !== "idle" && reason !== "absolute" && reason !== "manual") return;
      onEnd(reason);
    } catch {
      // Payload corrompido: ignora.
    }
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
};

/** Zera os relógios. Chamado no login e no logout. */
export const clearSessionClocks = (): void => {
  try {
    localStorage.removeItem(SESSION_KEYS.lastActivity);
    localStorage.removeItem(SESSION_KEYS.startedAt);
  } catch {
    // idem
  }
};
