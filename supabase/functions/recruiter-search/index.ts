// Edge Function: recruiter-search
//
// Agente Recrutador. Recebe uma descrição de vaga (texto livre) e devolve
// candidatos rankeados por similaridade semântica + justificativa Claude.
//
// Fluxo:
//   1. Auth check (JWT válido)
//   2. Cria/reusa agent_session do tipo 'recruiter'
//   3. Embed da query (OpenAI text-embedding-3-small)
//   4. RPC match_candidates → top N por cosine similarity
//   5. Busca dados completos dos candidatos (cv_summary, contato)
//   6. Claude rerankka + gera justificativa pt-BR pra cada top match
//   7. Salva user message + assistant message + agent_search_log
//   8. Retorna { sessionId, candidates: [...], assistant_text }
//
// Body: { sessionId?: uuid, query: string }
// Response: { sessionId, messageId, assistantText, candidates: [...] }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  callClaude,
  extractTextFromResponse,
} from "../_shared/claude.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 1536;
const MATCH_TOP_K = 10;
const MATCH_THRESHOLD = 0.3; // cosine similarity mínima
const RECRUITER_AGENT_KIND = "recruiter";

const RECRUITER_SYSTEM_PROMPT =
  `Você é o Recrutador, um agente IA do SoftHouse (sistema interno de Gente & Cultura da Softcom).

Sua função: ajudar o time de RH a encontrar candidatos no banco de talentos da empresa que combinem com uma vaga descrita.

Você recebe:
  - A descrição da vaga que o usuário tá buscando
  - Uma lista de candidatos do banco de talentos com resumo do CV e score de similaridade semântica (0-1)

Sua resposta deve:
  - Ser direta e objetiva (3-5 frases iniciais), em pt-BR brasileiro
  - Identificar os 3-5 melhores matches, com justificativa em 1-2 linhas cada
  - Apontar gaps importantes ("nenhum candidato com X anos de Y", "todos PJ — se a vaga é CLT, vale buscar fora")
  - Sugerir refinamentos da busca se os matches estão fracos
  - Tom amigável-profissional (ver microcopy SoftHouse). NÃO usar emoji em contexto de trabalho/busca.

Não invente dados. Se o resumo do candidato não menciona algo, não afirme que ele tem.

Não revele dados sensíveis (CPF, RG, salário individual) na resposta — eles podem aparecer em outros lugares da UI mas a SUA resposta foca no profissional, não no fiscal.

Responda APENAS com a análise + recomendações. Não cumprimente, não se apresente, não peça contexto adicional. Seja direto.`;

interface MatchedCandidateRow {
  candidate_id: string;
  similarity: number;
  content: string;
}

interface CandidateInfo {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  cv_url: string | null;
  cv_summary: string | null;
  source: string | null;
  is_active: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startTime = Date.now();

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authErr,
  } = await sbUser.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: "Invalid token" }, 401);

  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // Parse body
  let sessionId: string | null;
  let query: string;
  try {
    const body = await req.json();
    sessionId = body.sessionId ?? null;
    query = String(body.query ?? "").trim();
    if (!query) throw new Error("missing query");
  } catch {
    return jsonResponse(
      { error: "Body must include { query: string, sessionId?: uuid }" },
      400,
    );
  }

  // Verifica role do user — só admin_gc/gestor_gc/rh usam Recrutador
  const { data: roles } = await sbUser
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleStrings = (roles ?? []).map((r) =>
    String((r as { role: string }).role),
  );
  const allowed = roleStrings.some((r) =>
    ["admin_gc", "admin", "gestor_gc", "rh"].includes(r),
  );
  if (!allowed) {
    return jsonResponse(
      { error: "Sem permissão pra usar o Recrutador" },
      403,
    );
  }

  // Determina company_id do user (gestor_gc usa a sua; admin_gc usa a primeira encontrada via profiles)
  const { data: profile } = await sbUser
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const companyId = (profile as { company_id: string | null } | null)
    ?.company_id;
  if (!companyId) {
    return jsonResponse(
      { error: "Usuário sem company_id no profile" },
      400,
    );
  }

  // 1. Cria/reusa session
  if (!sessionId) {
    const title = query.length > 80 ? query.slice(0, 77) + "..." : query;
    const { data: newSession, error: sessErr } = await sbAdmin
      .from("agent_sessions")
      .insert({
        company_id: companyId,
        user_id: user.id,
        agent_kind: RECRUITER_AGENT_KIND,
        title,
      })
      .select()
      .single();
    if (sessErr || !newSession) {
      return jsonResponse(
        { error: "Falha ao criar sessão", details: sessErr?.message },
        500,
      );
    }
    sessionId = newSession.id;
  }

  // 2. Embed da query
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse({ error: "OPENAI_API_KEY missing" }, 500);
  }

  let queryEmbedding: number[];
  try {
    const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: query,
        model: EMBED_MODEL,
        dimensions: EMBED_DIMENSIONS,
      }),
    });
    if (!embedResp.ok) {
      throw new Error(`OpenAI ${embedResp.status}: ${await embedResp.text()}`);
    }
    const j = await embedResp.json();
    queryEmbedding = j.data[0].embedding;
  } catch (err) {
    return jsonResponse(
      { error: "Embed query failed", details: (err as Error).message },
      500,
    );
  }

  // 3. RPC match_candidates
  const { data: matches, error: matchErr } = await sbAdmin.rpc(
    "match_candidates",
    {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_TOP_K,
      filter_company_id: companyId,
    },
  );

  if (matchErr) {
    return jsonResponse(
      { error: "Match RPC failed", details: matchErr.message },
      500,
    );
  }

  const matchedRows = (matches ?? []) as MatchedCandidateRow[];

  // 4. Busca dados completos dos candidatos
  let candidates: CandidateInfo[] = [];
  if (matchedRows.length > 0) {
    const ids = matchedRows.map((m) => m.candidate_id);
    const { data: candRows, error: candErr } = await sbAdmin
      .from("candidates")
      .select(
        "id, name, email, phone, linkedin_url, cv_url, cv_summary, source, is_active",
      )
      .in("id", ids);
    if (candErr) {
      return jsonResponse(
        { error: "Failed to fetch candidates", details: candErr.message },
        500,
      );
    }
    candidates = (candRows ?? []) as CandidateInfo[];
  }

  // Junta similarity em cada candidato e ordena
  const enriched = candidates.map((c) => {
    const m = matchedRows.find((r) => r.candidate_id === c.id);
    return {
      ...c,
      similarity: m?.similarity ?? 0,
    };
  }).sort((a, b) => b.similarity - a.similarity);

  // 5. Claude rerank + justificativa
  let assistantText = "";
  let tokensInput = 0;
  let tokensOutput = 0;
  let claudeModel = "";

  if (enriched.length > 0) {
    const candidatesText = enriched.map((c, i) =>
      `### Candidato ${i + 1} (similarity: ${c.similarity.toFixed(3)})
Nome: ${c.name}
${c.source ? `Fonte: ${c.source}\n` : ""}Resumo:
${c.cv_summary ?? "(sem resumo indexado)"}
---`
    ).join("\n\n");

    const userPrompt =
      `Vaga descrita pelo RH:\n${query}\n\n# Banco de talentos (top ${enriched.length} por similaridade semântica)\n\n${candidatesText}\n\nFaça sua análise.`;

    try {
      const claudeResp = await callClaude({
        system: RECRUITER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1500,
      });
      assistantText = extractTextFromResponse(claudeResp).trim();
      tokensInput = claudeResp.usage?.input_tokens ?? 0;
      tokensOutput = claudeResp.usage?.output_tokens ?? 0;
      claudeModel = claudeResp.model ?? "claude-sonnet-4-6";
    } catch (err) {
      // Não fatal - retorna candidates mesmo sem análise IA
      assistantText =
        `Encontrei ${enriched.length} candidato${enriched.length === 1 ? "" : "s"} no banco de talentos com algum match. Não consegui gerar a análise detalhada agora — dá uma olhada nos resumos manualmente. (${(err as Error).message})`;
    }
  } else {
    assistantText =
      "Não encontrei candidatos no banco de talentos com match semântico relevante pra essa vaga. Possíveis motivos: (1) ainda não há CVs indexados o suficiente — bora cadastrar mais? (2) os termos da busca são muito específicos — tenta reformular focando em skills/experiência principal.";
  }

  // 6. Salva user message + assistant message
  const { data: userMsg } = await sbAdmin.from("agent_messages")
    .insert({
      session_id: sessionId,
      role: "user",
      content: query,
    })
    .select("id")
    .single();

  const { data: assistantMsg } = await sbAdmin.from("agent_messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: assistantText,
      metadata: { candidates: enriched.map((c) => ({ id: c.id, similarity: c.similarity })) },
      token_input: tokensInput,
      token_output: tokensOutput,
      model: claudeModel,
    })
    .select("id")
    .single();

  // 7. Audit log
  const duration = Date.now() - startTime;
  await sbAdmin.from("agent_search_log").insert({
    session_id: sessionId,
    user_id: user.id,
    company_id: companyId,
    agent_kind: RECRUITER_AGENT_KIND,
    query,
    results: enriched.map((c) => ({
      candidate_id: c.id,
      similarity: c.similarity,
    })),
    top_k: MATCH_TOP_K,
    threshold: MATCH_THRESHOLD,
    duration_ms: duration,
  });

  // 8. Touch session updated_at
  await sbAdmin
    .from("agent_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return jsonResponse({
    success: true,
    sessionId,
    userMessageId: (userMsg as { id: string } | null)?.id,
    assistantMessageId: (assistantMsg as { id: string } | null)?.id,
    assistantText,
    candidates: enriched,
    durationMs: duration,
    tokens: {
      input: tokensInput,
      output: tokensOutput,
    },
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
