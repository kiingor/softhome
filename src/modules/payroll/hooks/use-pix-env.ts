import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Ambiente do PIX (sandbox↔produção) — cliente da edge pix-env-switch.
//
// A troca é protegida NO SERVIDOR (papel + 2FA + prova do gateway). Aqui é só a
// casca. Ligar produção pede código no WhatsApp (challenge → switch com código);
// voltar pra sandbox é a direção segura (switch direto).
// ─────────────────────────────────────────────────────────────────────────────

export type PixEnv = "sandbox" | "production";

export interface GatewayStatus {
  configured: boolean;
  healthy: boolean;
}

export interface PixEnvStatus {
  active: PixEnv;
  sandbox: GatewayStatus;
  production: GatewayStatus;
}

export interface EnvChallenge {
  challenge_id: string;
  last4: string;
  expires_at: string;
}

/** Mesma armadilha do resto: supabase-js mascara o corpo em non-2xx, e a edge
 *  manda erro como 200 { error, message } (o proxy engole 5xx). Lê nas duas
 *  camadas e prefere a frase em pt-BR. */
function unwrap<T>(error: unknown, data: unknown): T {
  const corpo = data as { error?: unknown; message?: unknown } | null;
  const frase =
    corpo && typeof corpo === "object"
      ? (corpo.message ? String(corpo.message) : null) ??
        (corpo.error ? String(corpo.error) : null)
      : null;
  if (error) throw new Error(frase ?? (error as Error).message ?? "Falha na chamada");
  if (corpo && typeof corpo === "object" && "error" in corpo) {
    throw new Error(frase ?? "Falha na chamada");
  }
  return data as T;
}

export function usePixEnvStatus(enabled = true) {
  return useQuery({
    queryKey: ["pix-env-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pix-env-switch", {
        body: { action: "status" },
      });
      return unwrap<PixEnvStatus>(error, data);
    },
    enabled,
    staleTime: 15_000,
  });
}

export function usePixEnvSwitch() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pix-env-status"] });

  /** Passo 1 (só pra LIGAR produção): dispara o código no WhatsApp. */
  const challenge = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pix-env-switch", {
        body: { action: "challenge" },
      });
      return unwrap<EnvChallenge>(error, data);
    },
  });

  /** Aplica a troca. target 'sandbox' não precisa de código; 'production' sim. */
  const doSwitch = useMutation({
    mutationFn: async (vars: { target: PixEnv; challengeId?: string; code?: string }) => {
      const { data, error } = await supabase.functions.invoke("pix-env-switch", {
        body: {
          action: "switch",
          target: vars.target,
          challenge_id: vars.challengeId,
          code: vars.code,
        },
      });
      return unwrap<{ ok: boolean; active: PixEnv }>(error, data);
    },
    onSettled: invalidate,
  });

  return { challenge, doSwitch };
}
