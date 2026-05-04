// Edge Function: cv-process
//
// Processa o PDF do CV de um candidato:
//   1. Baixa o PDF (do Storage bucket 'candidate-cvs' OU de URL pública externa)
//   2. Envia pra Claude (Sonnet 4.6) que extrai resumo estruturado em pt-BR
//   3. Embed do resumo via OpenAI text-embedding-3-small
//   4. Upsert em candidate_embeddings + atualiza candidates (cv_url se filePath,
//      cv_summary, cv_processed_at)
//
// Body: { candidateId: uuid, filePath?: string, cvUrl?: string }
//   - filePath: path no bucket 'candidate-cvs' (fluxo de upload via UI)
//   - cvUrl: URL pública (fluxo via api-candidates / migração)
//   Um dos dois é obrigatório.
//
// Auth: aceita JWT de user (admin_gc/gestor_gc/rh) OU service_role (chamada
// interna entre Edge Functions, ex: api-candidates).
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

  // Detecta chamada interna (service_role) — bypassa permission check.
  // Usada por api-candidates pra disparar cv-process após inserção.
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
  const isInternalCall = bearerToken === serviceKey;

  // Cliente admin pra storage + DB writes (bypassa RLS pra service_role)
  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // 2. Parse body
  let candidateId: string;
  let filePath: string | undefined;
  let cvUrl: string | undefined;
  try {
    const body = await req.json();
    candidateId = body.candidateId;
    filePath = body.filePath;
    cvUrl = body.cvUrl;
    if (!candidateId || (!filePath && !cvUrl)) throw new Error("missing");
  } catch {
    return jsonResponse(
      { error: "Body must include { candidateId, filePath?, cvUrl? }" },
      400,
    );
  }

  // 3. Verifica candidate
  const { data: candidate, error: candErr } = await sbAdmin
    .from("candidates")
    .select("id, company_id, name")
    .eq("id", candidateId)
    .single();

  if (candErr || !candidate) {
    return jsonResponse({ error: "Candidate not found" }, 404);
  }

  // Permission check só em chamada de user (não em service_role interna)
  if (!isInternalCall) {
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
  }

  // 4. Obtém PDF — Storage (filePath) OU HTTP fetch (cvUrl)
  let buffer: ArrayBuffer;
  if (filePath) {
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
    buffer = await pdfBlob.arrayBuffer();
  } else {
    try {
      const resp = await fetch(cvUrl!);
      if (!resp.ok) {
        return jsonResponse(
          { error: `Falha ao baixar CV da URL: HTTP ${resp.status}` },
          422,
        );
      }
      const contentType = resp.headers.get("content-type") ?? "";
      if (!contentType.includes("pdf") && !cvUrl!.toLowerCase().endsWith(".pdf")) {
        return jsonResponse(
          { error: `URL não retornou PDF (content-type: ${contentType})` },
          422,
        );
      }
      buffer = await resp.arrayBuffer();
    } catch (err) {
      return jsonResponse(
        { error: "Falha ao baixar CV", details: (err as Error).message },
        422,
      );
    }
  }

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

  // Atualiza candidates: cv_url só quando veio de filePath (Storage); pra cvUrl
  // externa preserva o valor já existente na linha.
  const updates: Record<string, unknown> = {
    cv_summary: summary,
    cv_processed_at: new Date().toISOString(),
  };
  if (filePath) updates.cv_url = filePath;

  await sbAdmin.from("candidates").update(updates).eq("id", candidateId);

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
