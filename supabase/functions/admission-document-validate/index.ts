// Edge Function: admission-document-validate
//
// Pré-valida com Claude (Sonnet 4.6) um documento submetido pelo candidato
// na admissão. Não substitui o RH — só monta um parecer estruturado pra
// agilizar a revisão humana.
//
// Verifica:
//   - Legibilidade do arquivo
//   - Tipo detectado vs tipo esperado (RG, CPF, CTPS, etc.)
//   - Match dos dados extraídos com o cadastro (nome, CPF)
//   - Avisos pra RH (doc vencido, foto borrada, nome divergente, etc.)
//
// Body: { document_id: uuid }
// Auth: JWT de admin_gc/gestor_gc/rh.
//
// Side effects:
//   - admission_documents: ai_validation_result (jsonb) + ai_confidence
//     (numeric) preenchidos. Status volta pra 'submitted' depois do processamento
//     (RH ainda precisa decidir aprovar/pedir ajuste).
//   - admission_events: kind='doc_validated' com payload do parecer.
//
// Deploy: npx supabase functions deploy admission-document-validate
// Secrets: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL (opcional)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { callClaude, extractTextFromResponse } from "../_shared/claude.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  rg: "RG (cédula de identidade)",
  cpf: "CPF",
  ctps: "Carteira de Trabalho (CTPS) — pode ser digital ou física",
  comprovante_endereco: "Comprovante de endereço (conta de luz, água, telefone, etc.)",
  foto_3x4: "Foto 3x4 colorida do candidato",
  atestado_exame: "Atestado de Saúde Ocupacional (ASO)",
  contrato_social: "Contrato Social da empresa (PJ)",
  cnpj_doc: "Cartão CNPJ ou comprovante de inscrição",
  comprovante_matricula: "Comprovante de matrícula em curso",
  tce: "Termo de Compromisso de Estágio (TCE)",
  outro: "Outro tipo de documento",
};

const SYSTEM_PROMPT =
  `Você é um analista de RH brasileiro especializado em validar documentos de admissão.

Recebe um arquivo enviado por um candidato e o tipo esperado pelo RH. Sua tarefa é dar um PARECER ESTRUTURADO sobre o documento.

REGRAS DE OUTPUT:
- Responda EXCLUSIVAMENTE com um objeto JSON válido (sem markdown, sem cercas \`\`\`, sem texto antes ou depois).
- Use o schema exato abaixo. Não invente campos novos. Não omita campos.

SCHEMA:
{
  "is_legible": boolean,
  "detected_type": "rg" | "cpf" | "ctps" | "comprovante_endereco" | "foto_3x4" | "atestado_exame" | "contrato_social" | "cnpj_doc" | "comprovante_matricula" | "tce" | "outro" | "unknown",
  "type_matches": boolean,
  "confidence": number,
  "extracted_data": {
    "name": string | null,
    "cpf": string | null,
    "rg": string | null,
    "cnpj": string | null,
    "issued_at": string | null,
    "document_number": string | null
  },
  "data_matches_cadastro": boolean,
  "warnings": string[]
}

CRITÉRIOS:
- is_legible = true só se você consegue ler os campos-chave do documento sem ambiguidade.
- detected_type = o que o documento É de fato, ignorando o que o RH esperava.
- type_matches = true ⟺ detected_type === tipo_esperado.
- confidence = sua segurança geral no parecer, de 0.0 (chute) a 1.0 (certeza).
- extracted_data: preencha o que conseguir ler. Use null para campo ausente/ilegível.
  - cpf: somente dígitos (11), ex.: "12345678900"
  - cnpj: somente dígitos (14)
  - issued_at: ISO 8601 (YYYY-MM-DD) se a data emissão for legível.
- data_matches_cadastro = true se nome E CPF (quando presentes no doc) batem com o cadastro fornecido. Tolere acentos, maiúsculas/minúsculas e abreviação razoável de nome do meio. Se o doc não contém nome ou CPF (ex.: comprovante de endereço sem nome do candidato), avalie só o que estiver presente — se nada for comparável, retorne true.
- warnings: lista em pt-BR de problemas ou alertas pro RH. Exemplos:
    "Documento parece estar vencido (validade expirada em 2023-05-10)"
    "Foto da seção do CPF está borrada"
    "Nome do candidato no doc difere do cadastro"
    "Comprovante de endereço com data superior a 90 dias"
  Se não houver problemas, retorne [].
- NÃO inclua texto explicativo. NÃO inclua o conteúdo bruto do documento no JSON.
- NÃO inclua dados sensíveis no warnings (ex.: não escreva o CPF inteiro no warning, só "CPF").`;

interface ValidateBody {
  document_id: string;
}

interface AIValidationResult {
  is_legible: boolean;
  detected_type: string;
  type_matches: boolean;
  confidence: number;
  extracted_data: {
    name: string | null;
    cpf: string | null;
    rg: string | null;
    cnpj: string | null;
    issued_at: string | null;
    document_number: string | null;
  };
  data_matches_cadastro: boolean;
  warnings: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

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
  if (authErr || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // 2. Body
  let documentId: string;
  try {
    const body = (await req.json()) as ValidateBody;
    documentId = body.document_id;
    if (!documentId) throw new Error("missing document_id");
  } catch {
    return jsonResponse(
      { error: "Body must include { document_id }" },
      400,
    );
  }

  // 3. Doc + journey
  const { data: doc, error: docErr } = await sbAdmin
    .from("admission_documents")
    .select(
      "id, company_id, journey_id, doc_type, file_url, status",
    )
    .eq("id", documentId)
    .single();

  if (docErr || !doc) {
    return jsonResponse({ error: "Documento não encontrado" }, 404);
  }

  if (!doc.file_url) {
    return jsonResponse(
      { error: "Documento ainda não foi enviado pelo candidato" },
      400,
    );
  }

  if (doc.status === "approved") {
    return jsonResponse(
      { error: "Documento já aprovado — validar de novo não faz sentido" },
      409,
    );
  }

  const { data: journey, error: jErr } = await sbAdmin
    .from("admission_journeys")
    .select("id, candidate_name, candidate_cpf")
    .eq("id", doc.journey_id)
    .single();

  if (jErr || !journey) {
    return jsonResponse({ error: "Journey não encontrada" }, 404);
  }

  // 4. Permissão (admin_gc/gestor_gc + empresa)
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
      { error: "Sem permissão pra validar documentos" },
      403,
    );
  }

  if (!isAdmin) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: doc.company_id,
      _user_id: user.id,
    });
    if (!belongs) {
      return jsonResponse(
        { error: "Documento não é da sua empresa" },
        403,
      );
    }
  }

  // 5. Marca status como ai_validating
  await sbAdmin
    .from("admission_documents")
    .update({ status: "ai_validating" })
    .eq("id", documentId);

  // 6. Baixa arquivo do Storage
  const { data: blob, error: dlErr } = await sbAdmin
    .storage
    .from("admission-docs")
    .download(doc.file_url);

  if (dlErr || !blob) {
    // Reverte status pra submitted antes de sair
    await sbAdmin
      .from("admission_documents")
      .update({ status: "submitted" })
      .eq("id", documentId);
    return jsonResponse(
      { error: "Arquivo não encontrado no Storage", details: dlErr?.message },
      404,
    );
  }

  const mimeType = inferMimeFromPath(doc.file_url);
  const buffer = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  // 7. Monta bloco pro Claude (PDF vai como document, imagem como image)
  const expectedLabel = DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type;
  const cadastroSummary = `Cadastro do RH:
- Nome: ${journey.candidate_name}
- CPF: ${journey.candidate_cpf ?? "(não informado)"}

Tipo esperado pelo RH: ${doc.doc_type} — ${expectedLabel}

Valide e retorne o JSON conforme o schema.`;

  const fileBlock = mimeType === "application/pdf"
    ? {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: base64,
      },
    }
    : {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
        data: base64,
      },
    };

  // 8. Chama Claude
  let aiResult: AIValidationResult;
  try {
    const claudeResp = await callClaude({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: cadastroSummary }],
        },
      ],
      maxTokens: 1500,
    });

    const raw = extractTextFromResponse(claudeResp).trim();
    aiResult = parseValidationJSON(raw);
  } catch (err) {
    await sbAdmin
      .from("admission_documents")
      .update({ status: "submitted" })
      .eq("id", documentId);
    return jsonResponse(
      {
        error: "Falha ao chamar Claude",
        details: (err as Error).message,
      },
      500,
    );
  }

  // 9. Persiste resultado + volta status pra submitted
  const confidence = clamp(aiResult.confidence, 0, 1);
  const { error: updateErr } = await sbAdmin
    .from("admission_documents")
    .update({
      status: "submitted",
      ai_validation_result: aiResult,
      ai_confidence: confidence,
    })
    .eq("id", documentId);

  if (updateErr) {
    return jsonResponse(
      { error: "Falha ao salvar parecer", details: updateErr.message },
      500,
    );
  }

  // 10. Evento de timeline
  const summaryMsg = buildEventMessage(doc.doc_type, aiResult);
  await sbAdmin.from("admission_events").insert({
    company_id: doc.company_id,
    journey_id: doc.journey_id,
    kind: "doc_validated",
    actor_id: user.id,
    document_id: documentId,
    message: summaryMsg,
    payload: aiResult,
  });

  return jsonResponse({
    success: true,
    result: aiResult,
    confidence,
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

function inferMimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function clamp(n: number, min: number, max: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

function parseValidationJSON(raw: string): AIValidationResult {
  // Remove cercas markdown se Claude desobedecer e mandar em ```json
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const parsed = JSON.parse(cleaned);

  // Defaults defensivos pra qualquer campo faltante
  return {
    is_legible: Boolean(parsed.is_legible),
    detected_type: String(parsed.detected_type ?? "unknown"),
    type_matches: Boolean(parsed.type_matches),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    extracted_data: {
      name: parsed.extracted_data?.name ?? null,
      cpf: parsed.extracted_data?.cpf ?? null,
      rg: parsed.extracted_data?.rg ?? null,
      cnpj: parsed.extracted_data?.cnpj ?? null,
      issued_at: parsed.extracted_data?.issued_at ?? null,
      document_number: parsed.extracted_data?.document_number ?? null,
    },
    data_matches_cadastro: Boolean(parsed.data_matches_cadastro),
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.map((w: unknown) => String(w))
      : [],
  };
}

function buildEventMessage(
  docType: string,
  r: AIValidationResult,
): string {
  const parts: string[] = [];
  if (!r.is_legible) parts.push("ilegível");
  if (!r.type_matches) parts.push(`tipo divergente (detectou: ${r.detected_type})`);
  if (!r.data_matches_cadastro) parts.push("dados não batem com cadastro");
  const issues = parts.length > 0
    ? ` — ${parts.join(", ")}`
    : " — sem ressalvas";
  return `IA validou "${docType}" (confiança ${(r.confidence * 100).toFixed(0)}%)${issues}`;
}
