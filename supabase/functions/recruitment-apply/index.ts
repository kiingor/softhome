// Edge Function: recruitment-apply
//
// Endpoint público (sem auth) pra candidato aplicar a uma vaga.
// Detecta candidato recorrente (email + CPF), cria/atualiza candidates,
// cria candidate_application, faz upload do CV no Storage, e dispara
// cv-process pra indexar o embedding.
//
// Body (JSON): {
//   jobId: uuid,
//   name, email, phone, cpf, linkedin_url?, cover_letter?,
//   consent_talent_pool: bool,
//   consent_lgpd: bool,
//   cvBase64: string,        // PDF em base64
//   cvFilename: string
// }
//
// Returns: { success, applicationId, candidateId, indexed: bool }
//
// Acesso: público (--no-verify-jwt). Toda escrita é via service_role.
// Validações server-side: vaga existe + status='open', tamanho do CV,
// MIME type, presença de consent_lgpd.

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

const MAX_CV_BYTES = 5 * 1024 * 1024; // 5MB
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 1536;

const CV_EXTRACTION_PROMPT =
  `Você é um analista de RH especializado em extrair informações estruturadas de currículos brasileiros.

Recebe o PDF de um currículo e devolve um RESUMO ESTRUTURADO em pt-BR no formato:

## Resumo profissional
(2-3 linhas sobre quem é a pessoa profissionalmente)

## Habilidades técnicas
- (skill 1)
- (skill 2)

## Habilidades comportamentais
- (soft skill 1)

## Experiência
- **(Empresa)** — (Cargo) — (período)
  - (1-2 linhas do que fez)

## Educação
- **(Instituição)** — (Curso) — (período)

## Idiomas
- (idioma: nível)

## Outras observações relevantes
(certificações, projetos)

Regras:
- Português brasileiro.
- Seja objetivo e estruturado.
- Se uma seção não aparecer no CV, omita inteiramente.
- Não inclua dados sensíveis (CPF, RG, endereço completo) no resumo.
- Foco no que ajuda matching de vaga: skills, experiência, formação.`;

interface ApplicationBody {
  jobId: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  linkedin_url?: string;
  cover_letter?: string;
  consent_talent_pool: boolean;
  consent_lgpd: boolean;
  cvBase64: string;
  cvFilename: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse + validate body
  let body: ApplicationBody;
  try {
    body = await req.json();
    if (!body.jobId || !body.email || !body.name || !body.cpf || !body.cvBase64) {
      throw new Error("missing required fields");
    }
    if (!body.consent_lgpd) {
      throw new Error("LGPD consent required");
    }
  } catch (err) {
    return jsonResponse(
      { error: "Body inválido: " + (err as Error).message },
      400,
    );
  }

  const cleanCpf = body.cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    return jsonResponse({ error: "CPF inválido" }, 400);
  }

  // Decode CV
  let cvBytes: Uint8Array;
  try {
    cvBytes = base64ToBytes(body.cvBase64);
    if (cvBytes.length > MAX_CV_BYTES) {
      throw new Error(`CV passou de ${MAX_CV_BYTES / 1024 / 1024}MB`);
    }
    if (cvBytes.length < 100) {
      throw new Error("CV muito pequeno — arquivo válido?");
    }
  } catch (err) {
    return jsonResponse(
      { error: "CV inválido: " + (err as Error).message },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // 1. Vaga existe + status='open'
  const { data: job, error: jobErr } = await sbAdmin
    .from("job_openings")
    .select("id, company_id, status, title")
    .eq("id", body.jobId)
    .single();

  if (jobErr || !job) {
    return jsonResponse({ error: "Vaga não encontrada" }, 404);
  }
  if (job.status !== "open") {
    return jsonResponse(
      { error: "Esta vaga não tá mais aceitando candidaturas." },
      400,
    );
  }

  // 2. Detecta candidato recorrente por email OU cpf
  const { data: existing } = await sbAdmin
    .from("candidates")
    .select("id, name, is_active")
    .eq("company_id", job.company_id)
    .or(`email.eq.${body.email},cpf.eq.${cleanCpf}`)
    .limit(1)
    .maybeSingle();

  let candidateId: string;
  if (existing) {
    candidateId = existing.id;
    // Atualiza dados (caso candidato tenha mudado tel/linkedin).
    // is_active fica true (só vira false via "remover" pelo RH ou pedido LGPD).
    // consent_talent_pool é informativo, não controla visibilidade.
    await sbAdmin
      .from("candidates")
      .update({
        name: body.name,
        phone: body.phone || null,
        linkedin_url: body.linkedin_url || null,
        is_active: true,
        consent_talent_pool: body.consent_talent_pool,
        consent_lgpd_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
  } else {
    const { data: newCand, error: insErr } = await sbAdmin
      .from("candidates")
      .insert({
        company_id: job.company_id,
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        cpf: cleanCpf,
        linkedin_url: body.linkedin_url || null,
        source: "form_publico",
        is_active: true,
        consent_talent_pool: body.consent_talent_pool,
        consent_lgpd_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insErr || !newCand) {
      return jsonResponse(
        {
          error: "Falha ao registrar candidato",
          details: insErr?.message,
        },
        500,
      );
    }
    candidateId = newCand.id;
  }

  // 3. Cria candidate_application (UNIQUE job_id + candidate_id evita dup)
  const { data: existingApp } = await sbAdmin
    .from("candidate_applications")
    .select("id")
    .eq("job_id", job.id)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  let applicationId: string;
  if (existingApp) {
    applicationId = existingApp.id;
  } else {
    const { data: newApp, error: appErr } = await sbAdmin
      .from("candidate_applications")
      .insert({
        company_id: job.company_id,
        job_id: job.id,
        candidate_id: candidateId,
        stage: "new",
        applied_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (appErr || !newApp) {
      return jsonResponse(
        {
          error: "Falha ao criar candidatura",
          details: appErr?.message,
        },
        500,
      );
    }
    applicationId = newApp.id;
  }

  // 4. Upload CV pro Storage
  const filePath = `${job.company_id}/${candidateId}.pdf`;
  const { error: uploadErr } = await sbAdmin
    .storage
    .from("candidate-cvs")
    .upload(filePath, cvBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    return jsonResponse(
      { error: "Falha ao salvar CV", details: uploadErr.message },
      500,
    );
  }

  // 5. Atualiza candidates.cv_url + cv_filename (já fica salvo mesmo se cv-process falhar)
  await sbAdmin
    .from("candidates")
    .update({
      cv_url: filePath,
      cv_filename: body.cvFilename,
    })
    .eq("id", candidateId);

  // 6. Processa CV pra indexar embedding (inline — Claude + OpenAI).
  // Se falhar, candidato fica sem embedding mas a aplicação foi salva.
  // RH pode reprocessar depois via UI do banco de talentos.
  let indexed = false;
  try {
    const summary = await processCv(cvBytes, body.name);
    const embedding = await embedSummary(summary);
    await sbAdmin
      .from("candidate_embeddings")
      .upsert(
        {
          candidate_id: candidateId,
          company_id: job.company_id,
          content: summary,
          embedding: JSON.stringify(embedding),
          model: EMBED_MODEL,
          token_count: summary.length, // estimado
        },
        { onConflict: "candidate_id" },
      );
    await sbAdmin
      .from("candidates")
      .update({
        cv_summary: summary,
        cv_processed_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    indexed = true;
  } catch (err) {
    console.error("Falha indexação:", (err as Error).message);
    // Não fatal — candidato salvo, aplicação criada.
  }

  return jsonResponse({
    success: true,
    applicationId,
    candidateId,
    indexed,
    message: indexed
      ? "Candidatura registrada e CV indexado."
      : "Candidatura registrada. CV ainda processando (RH pode reindexar depois).",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function processCv(
  cvBytes: Uint8Array,
  candidateName: string,
): Promise<string> {
  const base64 = bytesToBase64(cvBytes);
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
              data: base64,
            },
          },
          {
            type: "text",
            text:
              `Currículo de ${candidateName}. Extraia o resumo estruturado.`,
          },
        ],
      },
    ],
    maxTokens: 2000,
  });
  const summary = extractTextFromResponse(claudeResp).trim();
  if (!summary || summary.length < 20) {
    throw new Error("Resumo Claude vazio");
  }
  return summary;
}

async function embedSummary(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY missing");
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: EMBED_MODEL,
      dimensions: EMBED_DIMENSIONS,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  }
  const j = await resp.json();
  return j.data[0].embedding;
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

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
