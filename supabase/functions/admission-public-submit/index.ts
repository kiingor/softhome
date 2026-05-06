// Edge Function: admission-public-submit
//
// Endpoint público que recebe os documentos enviados pelo candidato
// na página /admissao/:token. Faz upload no Storage + atualiza
// admission_documents + registra eventos na timeline.
//
// Body: {
//   token: string,
//   candidate_data?: { phone?, cpf? },           // confirmação opcional
//   documents: [
//     { doc_id: uuid, base64: string, filename: string, mime_type: string }
//   ]
// }
//
// Validações:
//   - Token válido + não expirado
//   - Status aceita submit (não admitted/cancelled)
//   - Cada doc pertence ao journey do token
//   - Tamanho < 10MB cada
//   - Mime types permitidos (PDF + imagens)
//
// Side effects:
//   - Upload em <company_id>/<journey_id>/<doc_type>.<ext>
//   - admission_documents: status = 'submitted', file_url, file_name, uploaded_at
//   - admission_events: kind='docs_submitted'
//   - admission_journeys: atualiza dados confirmados + status='docs_in_review'
//     se todos docs requeridos estão submitted/approved

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { runDocumentValidation } from "../_shared/validate-admission-doc.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

interface SubmitDoc {
  doc_id: string;
  base64: string;
  filename: string;
  mime_type: string;
}

interface SubmitBody {
  token: string;
  candidate_data?: {
    phone?: string;
    cpf?: string;
  };
  documents: SubmitDoc[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: SubmitBody;
  try {
    body = await req.json();
    if (!body.token) {
      throw new Error("missing required fields");
    }
    // Documents é opcional; pode vir só text_responses (resposta digitada/sim-não).
    if (!Array.isArray(body.documents)) {
      (body as unknown as { documents: [] }).documents = [];
    }
    const textResponses = (body as unknown as {
      text_responses?: unknown[];
    }).text_responses;
    const hasFile = body.documents.length > 0;
    const hasText = Array.isArray(textResponses) && textResponses.length > 0;
    const hasCandidateData =
      body.candidate_data && Object.keys(body.candidate_data).length > 0;
    if (!hasFile && !hasText && !hasCandidateData) {
      throw new Error(
        "Pelo menos um documento, resposta ou dado pessoal é obrigatório",
      );
    }
  } catch (err) {
    return jsonResponse(
      { error: "Body inválido: " + (err as Error).message },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // 1. Valida token + journey
  const { data: journey, error: jErr } = await sbAdmin
    .from("admission_journeys")
    .select("id, company_id, status, token_expires_at, candidate_name")
    .eq("access_token", body.token)
    .single();

  if (jErr || !journey) {
    return jsonResponse({ error: "Token inválido" }, 404);
  }

  if (journey.token_expires_at) {
    const exp = new Date(journey.token_expires_at).getTime();
    if (exp < Date.now()) {
      return jsonResponse({ error: "Link expirou", expired: true }, 410);
    }
  }

  if (journey.status === "admitted" || journey.status === "cancelled") {
    return jsonResponse({ error: "Processo já encerrado" }, 410);
  }

  // 2. Pega todos os docs da journey pra validar IDs
  const { data: allDocs, error: docsErr } = await sbAdmin
    .from("admission_documents")
    .select("id, doc_type, required, status")
    .eq("journey_id", journey.id);

  if (docsErr || !allDocs) {
    return jsonResponse({ error: "Falha ao buscar docs" }, 500);
  }

  const docMap = new Map(allDocs.map((d) => [d.id, d]));

  // 3. Processa cada doc enviado
  const errors: { doc_id: string; error: string }[] = [];
  const uploaded: { doc_id: string; doc_type: string }[] = [];

  for (const submitted of body.documents) {
    const doc = docMap.get(submitted.doc_id);
    if (!doc) {
      errors.push({
        doc_id: submitted.doc_id,
        error: "Doc id não pertence a essa admissão",
      });
      continue;
    }

    if (doc.status === "approved") {
      errors.push({
        doc_id: submitted.doc_id,
        error: "Esse documento já foi aprovado, não dá pra trocar",
      });
      continue;
    }

    if (!ALLOWED_MIMES.includes(submitted.mime_type)) {
      errors.push({
        doc_id: submitted.doc_id,
        error: `Tipo ${submitted.mime_type} não suportado`,
      });
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(submitted.base64);
      if (bytes.length > MAX_BYTES) {
        throw new Error(`Arquivo passou de ${MAX_BYTES / 1024 / 1024}MB`);
      }
    } catch (err) {
      errors.push({ doc_id: submitted.doc_id, error: (err as Error).message });
      continue;
    }

    // Upload Storage
    const ext = inferExtension(submitted.mime_type);
    const path = `${journey.company_id}/${journey.id}/${doc.doc_type}.${ext}`;

    const { error: uploadErr } = await sbAdmin
      .storage
      .from("admission-docs")
      .upload(path, bytes, {
        contentType: submitted.mime_type,
        upsert: true,
      });

    if (uploadErr) {
      errors.push({
        doc_id: submitted.doc_id,
        error: "Upload Storage: " + uploadErr.message,
      });
      continue;
    }

    // Update admission_documents
    const { error: updateErr } = await sbAdmin
      .from("admission_documents")
      .update({
        status: "submitted",
        file_url: path,
        file_name: submitted.filename,
        uploaded_at: new Date().toISOString(),
        // limpa rejection_reason caso seja resubmit
        rejection_reason: null,
      })
      .eq("id", submitted.doc_id);

    if (updateErr) {
      errors.push({
        doc_id: submitted.doc_id,
        error: "DB update: " + updateErr.message,
      });
      continue;
    }

    uploaded.push({ doc_id: submitted.doc_id, doc_type: doc.doc_type });
  }

  // 3b. Processa text_responses (docs do tipo texto)
  const textResponses = (body as unknown as {
    text_responses?: Array<{ doc_id: string; text: string }>;
  }).text_responses ?? [];

  for (const tr of textResponses) {
    const doc = docMap.get(tr.doc_id);
    if (!doc) {
      errors.push({ doc_id: tr.doc_id, error: "Doc id não pertence a essa admissão" });
      continue;
    }
    if (doc.status === "approved") {
      errors.push({ doc_id: tr.doc_id, error: "Documento já aprovado" });
      continue;
    }
    const text = (tr.text ?? "").trim();
    if (text.length === 0) {
      errors.push({ doc_id: tr.doc_id, error: "Resposta vazia" });
      continue;
    }
    if (text.length > 10000) {
      errors.push({ doc_id: tr.doc_id, error: "Resposta muito longa (máx 10k caracteres)" });
      continue;
    }
    const { error: trErr } = await sbAdmin
      .from("admission_documents")
      .update({
        status: "submitted",
        text_response: text,
        uploaded_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", tr.doc_id);

    if (trErr) {
      errors.push({ doc_id: tr.doc_id, error: "DB update: " + trErr.message });
      continue;
    }
    uploaded.push({ doc_id: tr.doc_id, doc_type: doc.doc_type });
  }

  // 4. Atualiza candidate_data confirmado (campos pessoais + endereço)
  if (body.candidate_data) {
    const cd = body.candidate_data as Record<string, string | undefined>;
    const updates: Record<string, string | null> = {};
    if (cd.phone) updates.candidate_phone = cd.phone;
    if (cd.cpf) {
      const cleanCpf = cd.cpf.replace(/\D/g, "");
      if (cleanCpf.length === 11) updates.candidate_cpf = cleanCpf;
    }
    if (cd.email !== undefined) updates.candidate_email = cd.email || null;
    if (cd.birth_date !== undefined)
      updates.candidate_birth_date = cd.birth_date || null;
    if (cd.rg !== undefined) updates.candidate_rg = cd.rg || null;
    if (cd.zip !== undefined) updates.candidate_zip = cd.zip || null;
    if (cd.address !== undefined) updates.candidate_address = cd.address || null;
    if (cd.address_number !== undefined)
      updates.candidate_address_number = cd.address_number || null;
    if (cd.address_complement !== undefined)
      updates.candidate_address_complement = cd.address_complement || null;
    if (cd.neighborhood !== undefined)
      updates.candidate_neighborhood = cd.neighborhood || null;
    if (cd.city !== undefined) updates.candidate_city = cd.city || null;
    if (cd.state !== undefined) updates.candidate_state = cd.state || null;
    if (Object.keys(updates).length > 0) {
      await sbAdmin
        .from("admission_journeys")
        .update(updates)
        .eq("id", journey.id);
    }
  }

  // 5. Evento "docs_submitted"
  if (uploaded.length > 0) {
    await sbAdmin.from("admission_events").insert({
      company_id: journey.company_id,
      journey_id: journey.id,
      kind: "docs_submitted",
      message:
        `Candidato enviou ${uploaded.length} documento${uploaded.length === 1 ? "" : "s"}: ${uploaded.map((u) => u.doc_type).join(", ")}`,
      payload: { uploaded, errors },
    });
  }

  // 6. Verifica se todos docs requeridos estão prontos pra revisão.
  //    Se sim, move journey pra 'docs_in_review'.
  const { data: refreshed } = await sbAdmin
    .from("admission_documents")
    .select("status, required")
    .eq("journey_id", journey.id);

  const allRequiredReady = (refreshed ?? [])
    .filter((d) => d.required)
    .every((d) => d.status === "submitted" || d.status === "approved");

  if (allRequiredReady && journey.status !== "docs_in_review") {
    await sbAdmin
      .from("admission_journeys")
      .update({ status: "docs_in_review" })
      .eq("id", journey.id);
  }

  // 7. Auto-trigger da IA pra cada doc novo, em background.
  //    Não bloqueia a resposta — RH abre a journey e o parecer já tá pronto.
  //    Falha silenciosa: RH ainda pode disparar manual via "Validar com IA".
  if (uploaded.length > 0) {
    const validations = Promise.allSettled(
      uploaded.map((u) =>
        runDocumentValidation({
          sbAdmin,
          documentId: u.doc_id,
          actorUserId: null,
        }).catch((err) => {
          console.error(
            `[auto-validate] doc ${u.doc_id} (${u.doc_type}):`,
            (err as Error).message,
          );
        })
      ),
    );
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(validations);
    }
    // Se EdgeRuntime não existir (ambiente local), promise fica órfã —
    // ainda completa, só não bloqueia o response.
  }

  return jsonResponse({
    success: errors.length === 0,
    uploaded: uploaded.length,
    errors,
    allRequiredReady,
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

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function inferExtension(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}
