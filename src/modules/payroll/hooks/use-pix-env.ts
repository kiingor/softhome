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

// ── Credenciais do gateway (configuráveis pelo painel) ───────────────────────

export interface GatewayConfigView {
  client_id: string;
  workspace_id: string;
  base_url: string;
  receipts_base_url: string | null;
  debit_branch: string;
  debit_account: string;
  /** true = já tem segredo salvo (nunca devolvemos o segredo em si). */
  has_secret: boolean;
  updated_at: string;
}

export interface GatewayConfigMap {
  sandbox: GatewayConfigView | null;
  production: GatewayConfigView | null;
}

export function useGatewayConfig(enabled = true) {
  return useQuery({
    queryKey: ["pix-gateway-config"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pix-gateway-config", {
        body: { action: "get" },
      });
      return unwrap<{ environments: GatewayConfigMap }>(error, data).environments;
    },
    enabled,
    staleTime: 30_000,
  });
}

export interface SaveGatewayVars {
  environment: PixEnv;
  client_id: string;
  /** Vazio = mantém o segredo atual (edição sem re-digitar). */
  client_secret?: string;
  workspace_id: string;
  base_url: string;
  receipts_base_url?: string | null;
  debit_branch: string;
  debit_account: string;
}

export function useSaveGatewayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SaveGatewayVars) => {
      const { data, error } = await supabase.functions.invoke("pix-gateway-config", {
        body: { action: "save", ...vars },
      });
      return unwrap<{ ok: boolean; environment: string }>(error, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pix-gateway-config"] });
      qc.invalidateQueries({ queryKey: ["pix-env-status"] });
    },
  });
}

export interface DiscoveredWorkspace {
  workspaceId: string | null;
  type: string | null;
  description: string | null;
  pixPaymentsActive: boolean;
  mainDebitAccount: { branch: string | null; number: string | null } | null;
  webhookUrl: string | null;
}

/** Lista os workspaces (com conta + flag de PIX ativo) usando as credenciais
 *  DIGITADAS no formulário (ainda não salvas), pra o usuário escolher em vez de
 *  digitar workspace/agência/conta no escuro. */
export function useDiscoverWorkspaces() {
  return useMutation({
    mutationFn: async (vars: {
      environment: PixEnv;
      client_id: string;
      client_secret: string;
      base_url: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("pix-gateway-config", {
        body: { action: "discover", ...vars },
      });
      return unwrap<{ workspaces: DiscoveredWorkspace[] }>(error, data).workspaces;
    },
  });
}

/** Cria um workspace type=PAYMENTS (liga PIX) com a conta de débito, usando as
 *  credenciais digitadas. Saída pra quando a conta só tem workspaces de Boleto. */
export function useCreateWorkspace() {
  return useMutation({
    mutationFn: async (vars: {
      environment: PixEnv;
      client_id: string;
      client_secret: string;
      base_url: string;
      branch: string;
      number: string;
      description?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("pix-gateway-config", {
        body: { action: "create_workspace", ...vars },
      });
      return unwrap<{ ok: boolean; workspace: unknown }>(error, data);
    },
  });
}

/** Tenta LIGAR o PIX num workspace (PATCH pixPaymentsActive). Se a conta não
 *  estiver habilitada, o Santander recusa — e a mensagem diz isso. */
export function useActivatePix() {
  return useMutation({
    mutationFn: async (vars: {
      environment: PixEnv;
      client_id: string;
      client_secret: string;
      base_url: string;
      workspace_id: string;
      type?: string;
      branch?: string;
      number?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("pix-gateway-config", {
        body: { action: "activate_pix", ...vars },
      });
      return unwrap<{ ok: boolean }>(error, data);
    },
  });
}

/** Exclui um workspace (ex.: um criado errado no teste). */
export function useDeleteWorkspace() {
  return useMutation({
    mutationFn: async (vars: {
      environment: PixEnv;
      client_id: string;
      client_secret: string;
      base_url: string;
      workspace_id: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("pix-gateway-config", {
        body: { action: "delete_workspace", ...vars },
      });
      return unwrap<{ ok: boolean }>(error, data);
    },
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
