// Ambiente do PIX da folha — a fonte da verdade é o BANCO, não uma env var.
//
// POR QUE ISTO EXISTE
// Antes o ambiente vinha de Deno.env.get("SANTANDER_ENVIRONMENT") e trocar exigia
// editar o secret + reiniciar o container. Agora mora em pix_environment_settings
// (uma linha, flag global) e troca por um painel com 2FA. Este módulo concentra
// as duas primitivas que todo edge do PIX precisa:
//
//   activeEnvironment(sbAdmin) → lê a flag (default 'sandbox' na dúvida).
//   gwUrlFor(env)              → escolhe o gateway do ambiente.
//
// DOIS GATEWAYS, NÃO UM COM DUAS CHAVES
// O santander-gw roda em DOIS containers (mesma imagem, mesmo certificado, env
// diferentes): um sandbox, um produção. O código do gateway — o caminho que move
// dinheiro — fica INTOCADO. Quem escolhe o cofre é a URL, e a URL é escolhida
// pelo `environment`: da flag ao ABRIR uma transferência, e do próprio registro
// (transfer.environment, congelado) ao EXECUTAR/consultar. Uma transferência
// aberta como 'production' sempre fala com o gateway de produção, mesmo que
// alguém vire a flag no meio.

// deno-lint-ignore no-explicit-any
type Sb = any;

export type PixEnv = "sandbox" | "production";

/** URL do gateway do ambiente pedido. Vazia = aquele ambiente não está
 *  configurado (o container/URL não existe) — o chamador trata como config. */
export function gwUrlFor(env: PixEnv): string {
  const raw = env === "production"
    ? Deno.env.get("SANTANDER_GW_URL_PROD")
    : Deno.env.get("SANTANDER_GW_URL");
  return (raw ?? "").trim().replace(/\/$/, "");
}

/**
 * Ambiente ATIVO, lido da flag global. Default 'sandbox' em qualquer dúvida
 * (linha ausente, erro de leitura, valor inesperado) — na incerteza, o ambiente
 * certo é o que não move dinheiro de verdade.
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
