// Ambiente + credenciais do PIX da folha — a fonte da verdade é o BANCO.
//
// activeEnvironment(sbAdmin) → flag do ambiente ativo (default 'sandbox').
// getGatewayConfig(sbAdmin, env) → credenciais daquele ambiente, com o segredo
//   DECIFRADO (null = não configurado no painel).
// gwBaseUrl() → a URL do gateway (UM só; o ambiente muda as CREDENCIAIS, não o
//   endereço).
// gwCredentialsHeader(creds) → o header X-Gw-Credentials que leva as credenciais
//   pro gateway por request. Vazio quando não há config → o gateway cai no
//   fallback do próprio env (o que segura o sandbox durante a transição).
//
// O gateway guarda só o CERTIFICADO (mTLS). As credenciais viajam por request,
// no header interno da bank_net. O secret NUNCA é logado (o gateway loga método/
// path/duração, não headers).

import { decryptSecret } from "./pix-crypto.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;

export type PixEnv = "sandbox" | "production";

export interface GatewayCreds {
  client_id: string;
  client_secret: string;
  workspace_id: string;
  base_url: string;
  receipts_base_url: string | null;
  debit_branch: string;
  debit_account: string;
}

/** URL do gateway. Um só — as credenciais é que mudam por ambiente. */
export function gwBaseUrl(): string {
  return (Deno.env.get("SANTANDER_GW_URL") ?? "").trim().replace(/\/$/, "");
}

/**
 * Ambiente ATIVO, da flag global. Default 'sandbox' em qualquer dúvida — na
 * incerteza, o ambiente certo é o que não move dinheiro de verdade.
 */
export async function activeEnvironment(sbAdmin: Sb): Promise<PixEnv> {
  try {
    const { data } = await sbAdmin
      .from("pix_environment_settings")
      .select("active_environment")
      .eq("id", true)
      .maybeSingle();
    return data?.active_environment === "production" ? "production" : "sandbox";
  } catch {
    return "sandbox";
  }
}

/**
 * Credenciais do ambiente, do banco, com o client_secret DECIFRADO. null =
 * ambiente não configurado no painel (ou chave/ciphertext ruim) → o chamador
 * deixa o gateway cair no fallback do env.
 */
export async function getGatewayConfig(sbAdmin: Sb, env: PixEnv): Promise<GatewayCreds | null> {
  const { data } = await sbAdmin
    .from("pix_gateway_credentials")
    .select("*")
    .eq("environment", env)
    .maybeSingle();
  if (!data) return null;
  let client_secret: string;
  try {
    client_secret = await decryptSecret(data.client_secret_enc);
  } catch {
    return null;
  }
  return {
    client_id: data.client_id,
    client_secret,
    workspace_id: data.workspace_id,
    base_url: data.base_url,
    receipts_base_url: data.receipts_base_url ?? null,
    debit_branch: data.debit_branch,
    debit_account: data.debit_account,
  };
}

/** Header que leva as credenciais pro gateway. Vazio quando não há config. */
export function gwCredentialsHeader(creds: GatewayCreds | null): Record<string, string> {
  if (!creds) return {};
  const json = JSON.stringify(creds);
  // encodeURIComponent → escape UTF-8 antes do btoa (btoa não aceita não-ASCII).
  return { "X-Gw-Credentials": btoa(unescape(encodeURIComponent(json))) };
}
