import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionTimeout } from "./useSessionTimeout";
import { SESSION_KEYS, type SessionPolicy } from "@/lib/security/session-policy";

/** Prazos curtos pra o teste rodar rápido; a lógica é a mesma da produção. */
const POLICY: SessionPolicy = {
  idleMs: 30_000,
  absoluteMs: 120_000,
  warningMs: 10_000,
};

/** Avança o relógio falso deixando os efeitos do React rodarem. */
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

/** Interação real do usuário (o hook ouve eventos de ponteiro/teclado). */
const interact = async () => {
  await act(async () => {
    window.dispatchEvent(new Event("pointerdown"));
  });
};

describe("useSessionTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  const setup = (overrides: Partial<Parameters<typeof useSessionTimeout>[0]> = {}) => {
    const onExpire = vi.fn();
    const view = renderHook(() =>
      useSessionTimeout({
        policy: POLICY,
        enabled: true,
        onExpire,
        ...overrides,
      }),
    );
    return { onExpire, ...view };
  };

  it("não derruba a sessão dentro do prazo", async () => {
    const { onExpire, result } = setup();

    await advance(POLICY.idleMs - POLICY.warningMs - 1_000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current.warningReason).toBeNull();
  });

  it("avisa antes de expirar por inatividade", async () => {
    const { onExpire, result } = setup();

    await advance(POLICY.idleMs - POLICY.warningMs + 1_000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current.warningReason).toBe("idle");
    expect(result.current.secondsLeft).toBeGreaterThan(0);
    expect(result.current.secondsLeft).toBeLessThanOrEqual(POLICY.warningMs / 1000);
  });

  it("derruba a sessão quando a inatividade estoura", async () => {
    const { onExpire } = setup();

    await advance(POLICY.idleMs + 1_000);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith("idle");
  });

  it('"Continuar conectado" reinicia o relógio e some com o aviso', async () => {
    const { onExpire, result } = setup();

    await advance(POLICY.idleMs - POLICY.warningMs + 1_000);
    expect(result.current.warningReason).toBe("idle");

    await act(async () => {
      result.current.extend();
    });

    expect(result.current.warningReason).toBeNull();

    // Do zero de novo: quase todo o prazo passa sem derrubar.
    await advance(POLICY.idleMs - 2_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("ignora atividade passiva enquanto o aviso está na tela", async () => {
    const { result } = setup();

    await advance(POLICY.idleMs - POLICY.warningMs + 1_000);
    expect(result.current.warningReason).toBe("idle");

    // Rolar a página não pode cancelar o aviso pelas costas do usuário.
    await interact();
    await advance(1_000);

    expect(result.current.warningReason).toBe("idle");
  });

  it("derruba pelo limite absoluto mesmo com o usuário ativo", async () => {
    const { onExpire, result } = setup();

    // Atividade a cada 10s (o throttle de escrita é exatamente 10s), o
    // suficiente pra inatividade nunca estourar.
    for (let elapsed = 0; elapsed < POLICY.absoluteMs - POLICY.warningMs; elapsed += 10_000) {
      await advance(10_000);
      await interact();
    }

    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current.warningReason).toBe("absolute");

    await advance(POLICY.warningMs + 1_000);

    expect(onExpire).toHaveBeenCalledWith("absolute");
  });

  it("respeita o início de sessão informado pelo servidor", async () => {
    // Sessão aberta há quase o limite absoluto: cai logo, não daqui a 2min.
    const startedAt = new Date(Date.now() - (POLICY.absoluteMs - 3_000)).toISOString();
    const { onExpire } = setup({ serverSessionStartedAt: startedAt });

    await advance(4_000);

    expect(onExpire).toHaveBeenCalledWith("absolute");
  });

  it("conta a atividade de outra aba", async () => {
    const { onExpire } = setup();

    // Metade do prazo passa, aí a outra aba registra atividade.
    await advance(POLICY.idleMs - 5_000);
    localStorage.setItem(SESSION_KEYS.lastActivity, String(Date.now()));

    // Passa do prazo original sem derrubar: a atividade da outra aba valeu.
    await advance(10_000);

    expect(onExpire).not.toHaveBeenCalled();
  });

  it("não monitora nada enquanto ninguém está logado", async () => {
    const { onExpire, result } = setup({ enabled: false });

    await advance(POLICY.absoluteMs * 2);

    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current.warningReason).toBeNull();
  });

  it("derruba uma única vez, mesmo com o relógio continuando a girar", async () => {
    const { onExpire } = setup();

    await advance(POLICY.idleMs + 30_000);

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("relógio do sistema andando pra trás não derruba a sessão na hora", async () => {
    // Atividade "no futuro" (fuso/NTP corrigido) viraria idle negativo.
    localStorage.setItem(SESSION_KEYS.lastActivity, String(Date.now() + 60_000));
    const { onExpire } = setup();

    await advance(2_000);

    expect(onExpire).not.toHaveBeenCalled();
  });
});
