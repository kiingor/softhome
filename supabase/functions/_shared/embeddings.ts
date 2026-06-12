/**
 * Embeddings compartilhados — TODA geração de embedding de candidato passa por
 * aqui, batendo no gateway iarouter (endpoint OpenAI-compatible /v1/embeddings).
 *
 * Modelo: `gemini-embedding-001` @ 1536 dims — escolhido pra manter compat com a
 * coluna `vector(1536)` e o índice ivfflat já existentes (sem migração de schema).
 * Credenciais vêm de ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY (mesmo gateway do
 * Claude; nomes legados de quando o secret apontava pra Anthropic direto).
 *
 * CRÍTICO: a query (recruiter-search) e o corpus (cv-process, recruitment-apply)
 * DEVEM usar o MESMO modelo + dims. Se divergir, a busca compara espaços vetoriais
 * diferentes e o ranking vira lixo. Por isso fica centralizado num só lugar.
 */

/** Modelo de embedding no formato provider/model exigido pelo iarouter. */
export const EMBED_MODEL = "gemini/gemini-embedding-001";

/** Dimensões pedidas — casa com a coluna vector(1536) e o índice ivfflat. */
export const EMBED_DIMENSIONS = 1536;

/** Valor gravado em candidate_embeddings.model (rastreabilidade do que indexou). */
export const EMBED_MODEL_LABEL = "gemini-embedding-001";

/**
 * Gera o embedding de um texto via iarouter. Lança em erro de rede/HTTP ou se o
 * shape vier inesperado (deixa o chamador decidir se é fatal).
 */
export async function embedText(input: string): Promise<number[]> {
  const baseURL = (Deno.env.get("ANTHROPIC_BASE_URL") ?? "").replace(/\/+$/, "");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!baseURL) throw new Error("[embeddings] ANTHROPIC_BASE_URL ausente");
  if (!apiKey) throw new Error("[embeddings] ANTHROPIC_API_KEY ausente");

  const resp = await fetch(`${baseURL}/v1/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input,
      dimensions: EMBED_DIMENSIONS,
    }),
  });

  if (!resp.ok) {
    throw new Error(`iarouter embeddings ${resp.status}: ${await resp.text()}`);
  }

  const j = await resp.json();
  let embedding = j?.data?.[0]?.embedding;
  // O router às vezes ignora `dimensions` e devolve o vetor cheio (3072).
  // gemini-embedding-001 usa Matryoshka (MRL): os primeiros N componentes já
  // são um embedding válido de dimensão N. Truncar mantém a direção (logo o
  // ranking por cosseno) e casa com a coluna vector(1536) + o corpus indexado.
  if (Array.isArray(embedding) && embedding.length > EMBED_DIMENSIONS) {
    embedding = embedding.slice(0, EMBED_DIMENSIONS);
  }
  if (!Array.isArray(embedding) || embedding.length !== EMBED_DIMENSIONS) {
    throw new Error(
      `iarouter embeddings: shape inesperado (len=${embedding?.length ?? "null"})`,
    );
  }
  return embedding as number[];
}
