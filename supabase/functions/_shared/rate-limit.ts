// Helper de rate-limit pra Edge Functions públicas que gastam IA paga.
// Chama a RPC public.rate_limit_take (SECURITY DEFINER, só service_role).
//
// Fail-open de propósito: se o limitador quebrar (infra), o endpoint deixa
// passar — não travamos recrutamento por causa do limitador. O que ele protege
// é orçamento de IA, não dado sensível.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/**
 * Consome 1 do orçamento de (bucket, identifier) na janela dada.
 * Retorna true se liberado, false se estourou o limite.
 */
export async function rateLimitTake(
  sb: SupabaseClient,
  bucket: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("rate_limit_take", {
      p_bucket: bucket,
      p_identifier: (identifier || "anon").slice(0, 200),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rate_limit_take falhou (fail-open):", error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error(
      "rate_limit_take exceção (fail-open):",
      e instanceof Error ? e.message : "erro",
    );
    return true;
  }
}
