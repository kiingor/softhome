// Edge Function: cv-process
//
// Processa o PDF do CV de um candidato:
//   1. Baixa o PDF do Storage bucket 'candidate-cvs'
//   2. Envia pra Claude (Sonnet 4.6) que extrai resumo estruturado em pt-BR
//   3. Embed do resumo via OpenAI text-embedding-3-small
//   4. Upsert em candidate_embeddings + atualiza candidates (cv_url, cv_summary,
//      cv_processed_at)
//
// Body: { candidateId: uuid, filePath: string }
// Auth: requer JWT válido (admin_gc/gestor_gc/rh).
//
// Deploy: npx supabase functions deploy cv-process
// Secrets necessários: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL (opcional),
//                      OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY (auto)

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

const CV_EXTRACTION_PROMPT = `Você é um analista de RH especializado em extrair informações estruturadas de currículos brasileiros.

Recebe o PDF de um currículo e devolve um RESUMO ESTRUTURADO em pt-BR no formato:

## Resumo profissional
(2-3 linhas sobre quem é a pessoa profissionalmente)

## Habilidades técnicas
- (skill 1)
- (skill 2)
- ...

## Habilidades comportamentais
- (soft skill 1)
- ...

## Experiência
- **(Empresa)** — (Cargo) — (período: AAAA-AAAA ou AAAA-presente)
  - (1-2 linhas do que fez)
- ...

## Educação
- **(Instituição)** — (Curso) — (período)

## Idiomas
- (idioma 1: nível)
- ...

## Outras observações relevantes
(certificações, projetos, voluntariado, etc.)

Regras:
- Português brasileiro.
- Seja objetivo e estruturado, não comente sobre o documento.
- Se uma seção não aparecer no CV, omita inteiramente (não escreva "não informado").
- Não inclua dados sensíveis como CPF, RG, endereço completo no resumo.
- Foco no que ajuda numa busca por matching de vaga: skills, experiência, formação.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  // 1. Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Cliente com JWT do user pra validar autenticação
  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authErr,
  } = await sbUser.auth.getUser();
  if (authErr || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  // Cliente admin pra storage + DB writes (bypassa RLS pra service_role)
  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // 2. Parse body
  let candidateId: string;
  let filePath: string;
  try {
    const body = await req.json();
    candidateId = body.candidateId;
    filePath = body.filePath;
    if (!candidateId || !filePath) throw new Error("missing");
  } catch {
    return jsonResponse(
      { error: "Body must include { candidateId, filePath }" },
      400,
    );
  }

  // 3. Verifica candidate + permissão (gestor_gc só processa da própria empresa)
  const { data: candidate, error: candErr } = await sbAdmin
    .from("candidates")
    .select("id, company_id, name")
    .eq("id", candidateId)
    .single();

  if (candErr || !candidate) {
    return jsonResponse({ error: "Candidate not found" }, 404);
  }

  // Verifica role do user
  const { data: roles } = await sbUser
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roleStrings = (roles ?? []).map((r) =>
    String((r as { role: string }).role),
  );
  const isAdmin = roleStrings.includes("admin_gc") ||
    roleStrings.includes("admin");
  const isGestor = roleStrings.includes("gestor_gc") ||
    roleStrings.includes("rh");

  if (!isAdmin && !isGestor) {
    return jsonResponse(
      { error: "Sem permissão pra processar CVs" },
      403,
    );
  }

  // gestor_gc: precisa pertencer à empresa do candidato
  if (!isAdmin && isGestor) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: candidate.company_id,
      _user_id: user.id,
    });
    if (!belongs) {
      return jsonResponse(
        { error: "Candidato não é da sua empresa" },
        403,
      );
    }
  }

  // 4. Baixa PDF do Storage
  const { data: pdfBlob, error: dlErr } = await sbAdmin
    .storage
    .from("candidate-cvs")
    .download(filePath);

  if (dlErr || !pdfBlob) {
    return jsonResponse(
      { error: "PDF not found in storage", details: dlErr?.message },
      404,
    );
  }

  const buffer = await pdfBlob.arrayBuffer();
  const base64Pdf = arrayBufferToBase64(buffer);

  // 5. Claude extrai resumo estruturado
  let summary: string;
  try {
    const claudeResp = await callClaude({
      system: CV_EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text:
                `Currículo de ${candidate.name}. Extraia o resumo estruturado conforme o formato solicitado.`,
            },
          ],
        },
      ],
      maxTokens: 2000,
    });
    summary = extractTextFromResponse(claudeResp).trim();
    if (!summary || summary.length < 20) {
      throw new Error("Resumo retornado vazio ou muito curto");
    }
  } catch (err) {
    return jsonResponse(
      {
        error: "Falha ao processar PDF com Claude",
        details: (err as Error).message,
      },
      500,
    );
  }

  // 6. OpenAI embedding
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse(
      { error: "OPENAI_API_KEY não configurada" },
      500,
    );
  }

  let embedding: number[];
  let tokenCount: number;
  try {
    const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: summary,
        model: EMBED_MODEL,
        dimensions: EMBED_DIMENSIONS,
      }),
    });

    if (!embedResp.ok) {
      const errText = await embedResp.text();
      throw new Error(`OpenAI ${embedResp.status}: ${errText}`);
    }

    const embedJson = await embedResp.json();
    embedding = embedJson.data?.[0]?.embedding;
    tokenCount = embedJson.usage?.total_tokens ?? 0;

    if (!embedding || embedding.length !== EMBED_DIMENSIONS) {
      throw new Error(
        `Embedding com tamanho inesperado: ${embedding?.length ?? "null"}`,
      );
    }
  } catch (err) {
    return jsonResponse(
      {
        error: "Falha no embedding OpenAI",
        details: (err as Error).message,
      },
      500,
    );
  }

  // 7. Upsert embedding + atualiza candidates
  const { error: upsertErr } = await sbAdmin
    .from("candidate_embeddings")
    .upsert(
      {
        candidate_id: candidateId,
        company_id: candidate.company_id,
        content: summary,
        embedding: JSON.stringify(embedding),
        model: EMBED_MODEL,
        token_count: tokenCount,
      },
      { onConflict: "candidate_id" },
    );

  if (upsertErr) {
    return jsonResponse(
      { error: "Falha ao salvar embedding", details: upsertErr.message },
      500,
    );
  }

  await sbAdmin
    .from("candidates")
    .update({
      cv_url: filePath,
      cv_summary: summary,
      cv_processed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  return jsonResponse({
    success: true,
    summary,
    tokens: tokenCount,
    candidateId,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
