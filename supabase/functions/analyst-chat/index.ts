// Edge Function: analyst-chat
//
// Agente Analista G&C. Conversa sobre dados agregados da empresa via
// Claude tool use — agente decide quais views agent_* consultar pra
// responder a pergunta. Read-only, sem PII bruta.
//
// Tools expostas pro Claude:
//   - query_company_overview: contagens gerais (regime, status, teams)
//   - query_admission_funnel: status × regime das admissões em curso
//   - query_milestone_overview: marcos da jornada por status × tipo
//   - query_collaborator_distribution: distribuição por team × regime
//   - query_recruitment_pipeline: funil das vagas abertas
//   - query_journey_stats: estatísticas globais de insígnias
//
// Multi-turn loop: Claude pode chamar várias tools antes de responder.
// Limite de 5 rounds pra não loopar infinito.
//
// Body: { sessionId?: uuid, query: string }
// Auth: JWT de admin_gc/gestor_gc/rh.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  callClaude,
  extractTextFromResponse,
  type ClaudeMessage,
  type ClaudeTool,
} from "../_shared/claude.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANALYST_AGENT_KIND = "analyst";
const MAX_TOOL_ROUNDS = 5;

const ANALYST_SYSTEM_PROMPT =
  `Você é o Analista G&C, agente IA do SoftHome (sistema interno de Gente & Cultura da Softcom).

Seu papel: responder perguntas do RH sobre dados agregados da empresa — admissões, jornada de conhecimento, mix do time, recrutamento. Você NÃO tem acesso a PII (nome, CPF, salário individual). Trabalha só com agregados anônimos.

Como funciona:
- Você tem ferramentas que consultam views read-only (agent_*) do banco.
- Decida quais ferramentas chamar baseado na pergunta. Pode chamar várias se precisar cruzar dados.
- DEPOIS de coletar os dados, responda em pt-BR direto e útil pro RH.

Regras de resposta:
- Tom amigável-profissional brasileiro. Sem emoji. Sem "olá!", "espero que ajude!".
- Cite os números concretamente. Se um campo for null/zero, fale claramente.
- Se os dados disponíveis não respondem a pergunta, diga isso — NÃO invente.
- Se a pergunta requer dado que você não tem (ex.: salário individual), explique a limitação.
- Liste insights acionáveis ao final quando fizer sentido ("4 admissões parado em docs_in_review há mais de 7 dias — vale puxar").
- Formate listas/tabelas com markdown quando ajudar a leitura.

Importante: nunca invente um dado. Sempre cite só o que veio das ferramentas.`;

const TOOLS: ClaudeTool[] = [
  {
    name: "query_company_overview",
    description:
      "Retorna contagens agregadas da empresa: colaboradores ativos/inativos, distribuição por regime (CLT/PJ/estagiário), número de times e lojas. Use pra perguntas sobre tamanho/composição geral do time.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_admission_funnel",
    description:
      "Retorna o funil de admissões agrupado por status × regime. Cada linha tem: status, regime, count, avg_days_in_status, oldest_journey_at, latest_movement_at. Use pra perguntas sobre quantas admissões em cada estágio, gargalos, atrasos.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_milestone_overview",
    description:
      "Retorna os marcos da Jornada agregados por status × kind (d30/d60/d90/d180/annual). Cada linha tem: status, kind, count, avg_badges_at_milestone. Use pra perguntas sobre saúde da jornada, marcos atrasados, distribuição de avaliações.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_collaborator_distribution",
    description:
      "Retorna distribuição de colaboradores por (team, regime, status, position). Use pra perguntas sobre composição de times, qual time tem mais gente, mix de cargos, etc.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_recruitment_pipeline",
    description:
      "Retorna o pipeline de cada vaga aberta — total_applications + contagens por estágio (new/screening/interview_hr/interview_manager/offer/accepted/rejected) + avg_ai_score. Use pra perguntas sobre vagas, conversão de candidatos, vagas mais ou menos disputadas.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "query_journey_stats",
    description:
      "Retorna estatísticas agregadas da Jornada de Conhecimento por colaborador (anônimo, só id): badges_count, unique_badges_count, latest_award, last_30d, last_90d. Use pra perguntas sobre engajamento da jornada, quem mais ganhou insígnias recente.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────

interface ChatBody {
  sessionId?: string | null;
  query: string;
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

  // Body
  let sessionId: string | null;
  let query: string;
  try {
    const body = (await req.json()) as ChatBody;
    sessionId = body.sessionId ?? null;
    query = String(body.query ?? "").trim();
    if (!query) throw new Error("missing query");
  } catch {
    return jsonResponse(
      { error: "Body must include { query: string, sessionId?: uuid }" },
      400,
    );
  }

  // Permissão
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
    return jsonResponse({ error: "Sem permissão pra usar o Analista" }, 403);
  }

  // company_id do user
  const { data: profile } = await sbUser
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const companyId = (profile as { company_id: string | null } | null)
    ?.company_id;
  if (!companyId) {
    return jsonResponse({ error: "Usuário sem company_id no profile" }, 400);
  }

  // Cria/reusa session
  if (!sessionId) {
    const title = query.length > 80 ? query.slice(0, 77) + "..." : query;
    const { data: newSession, error: sessErr } = await sbAdmin
      .from("agent_sessions")
      .insert({
        company_id: companyId,
        user_id: user.id,
        agent_kind: ANALYST_AGENT_KIND,
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

  // Busca histórico da session pra contexto multi-turn
  const { data: history } = await sbAdmin
    .from("agent_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  const messages: ClaudeMessage[] = [];
  for (const m of (history ?? []) as { role: string; content: string }[]) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({
        role: m.role,
        content: m.content,
      });
    }
  }
  messages.push({ role: "user", content: query });

  // Loop de tool use
  const toolCallsLog: { tool: string; input: unknown; output: unknown }[] = [];
  let assistantText = "";
  let tokensInput = 0;
  let tokensOutput = 0;
  let claudeModel = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let claudeResp;
    try {
      claudeResp = await callClaude({
        system: ANALYST_SYSTEM_PROMPT,
        messages,
        tools: TOOLS,
        maxTokens: 2000,
      });
    } catch (err) {
      return jsonResponse(
        { error: "Claude falhou", details: (err as Error).message },
        500,
      );
    }

    tokensInput += claudeResp.usage?.input_tokens ?? 0;
    tokensOutput += claudeResp.usage?.output_tokens ?? 0;
    claudeModel = claudeResp.model ?? "claude-sonnet-4-6";

    // Adiciona resposta do assistant ao histórico
    messages.push({
      role: "assistant",
      content: claudeResp.content,
    });

    // Detecta tool use
    const toolUses = claudeResp.content.filter(
      (b): b is { type: "tool_use"; id: string; name: string; input: unknown } =>
        b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      // Resposta final
      assistantText = extractTextFromResponse(claudeResp).trim();
      break;
    }

    // Executa cada tool e devolve os resultados
    const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
    for (const tu of toolUses) {
      let result: unknown;
      try {
        result = await runTool(tu.name, sbAdmin, companyId);
        toolCallsLog.push({ tool: tu.name, input: tu.input, output: result });
      } catch (err) {
        result = { error: (err as Error).message };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({
      role: "user",
      content: toolResults,
    });

    // Se Claude continuar pedindo tools indefinidamente, paramos
    if (round === MAX_TOOL_ROUNDS - 1) {
      assistantText =
        "Tive que parar de consultar dados pra não loopar — segue o que consegui ver até aqui:\n\n" +
        extractTextFromResponse(claudeResp).trim();
    }
  }

  if (!assistantText) {
    assistantText = "Não consegui gerar uma resposta dessa vez.";
  }

  // Persiste user + assistant message
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
      metadata: { tool_calls: toolCallsLog },
      token_input: tokensInput,
      token_output: tokensOutput,
      model: claudeModel,
    })
    .select("id")
    .single();

  // Audit log
  const duration = Date.now() - startTime;
  await sbAdmin.from("agent_search_log").insert({
    session_id: sessionId,
    user_id: user.id,
    company_id: companyId,
    agent_kind: ANALYST_AGENT_KIND,
    query,
    results: { tool_calls: toolCallsLog.map((t) => ({ tool: t.tool })) },
    top_k: 0,
    duration_ms: duration,
  });

  // Touch session
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
    toolCalls: toolCallsLog.map((t) => t.tool),
    durationMs: duration,
    tokens: { input: tokensInput, output: tokensOutput },
  });
});

// ────────────────────────────────────────────────────────────────────────────

async function runTool(
  name: string,
  sbAdmin: SupabaseClient,
  companyId: string,
): Promise<unknown> {
  switch (name) {
    case "query_company_overview": {
      const { data, error } = await sbAdmin
        .from("agent_company_overview")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? { note: "Nenhum dado agregado pra essa empresa ainda." };
    }
    case "query_admission_funnel": {
      const { data, error } = await sbAdmin
        .from("agent_admission_funnel")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "query_milestone_overview": {
      const { data, error } = await sbAdmin
        .from("agent_milestone_overview")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "query_collaborator_distribution": {
      const { data, error } = await sbAdmin
        .from("agent_collaborator_distribution")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "query_recruitment_pipeline": {
      const { data, error } = await sbAdmin
        .from("agent_recruitment_pipeline")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }
    case "query_journey_stats": {
      const { data, error } = await sbAdmin
        .from("agent_journey_stats")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return {
        rows: data ?? [],
        total_collaborators_with_badges: (data ?? []).length,
      };
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
