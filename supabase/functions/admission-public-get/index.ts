// Edge Function: admission-public-get
//
// Endpoint público (sem auth) que retorna info da journey de admissão dado
// um token. Usado pela página pública /admissao/:token pra mostrar ao
// candidato seus docs requeridos + status atual de cada.
//
// Body: { token: string }
// Returns: { success, journey: {...}, documents: [...] }
//
// Validações:
//   - Token existe + não expirou
//   - Status da journey aceita inputs do candidato (não 'admitted' nem 'cancelled')

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let token: string;
  try {
    const body = await req.json();
    token = String(body.token ?? "").trim();
    if (!token) throw new Error("missing token");
  } catch {
    return jsonResponse({ error: "Body must include { token }" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sbAdmin = createClient(supabaseUrl, serviceKey);

  const { data: journey, error } = await sbAdmin
    .from("admission_journeys")
    .select(
      "id, company_id, candidate_name, candidate_email, candidate_phone, candidate_cpf, candidate_birth_date, candidate_rg, candidate_zip, candidate_address, candidate_address_number, candidate_address_complement, candidate_neighborhood, candidate_city, candidate_state, regime, status, token_expires_at, position_id",
    )
    .eq("access_token", token)
    .single();

  if (error || !journey) {
    return jsonResponse({ error: "Token inválido" }, 404);
  }

  // Verifica expiração
  if (journey.token_expires_at) {
    const exp = new Date(journey.token_expires_at).getTime();
    if (exp < Date.now()) {
      return jsonResponse({
        error: "Esse link expirou. Pede pra empresa gerar um novo.",
        expired: true,
      }, 410);
    }
  }

  // Status terminal — candidato não pode mais mexer
  if (journey.status === "admitted" || journey.status === "cancelled") {
    return jsonResponse({
      error: "Este processo já foi encerrado.",
      finalStatus: journey.status,
    }, 410);
  }

  // Backfill defensivo: pra admissões criadas antes da feature de exames
  // automáticos, gera os rows de admission_documents pros exames esperados
  // do grupo de risco do cargo. Idempotente — pula slugs já existentes.
  if (journey.position_id) {
    const { data: pos } = await sbAdmin
      .from("positions")
      .select("risk_group")
      .eq("id", journey.position_id)
      .maybeSingle();
    const riskGroup = (pos as { risk_group: string | null } | null)?.risk_group;

    const EXAMS_BY_RISK_GROUP: Record<string, Array<{ slug: string; label: string }>> = {
      GR1: [{ slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" }],
      GR2: [
        { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
        { slug: "audiometria", label: "Audiometria" },
        { slug: "acuidade_visual", label: "Acuidade visual" },
      ],
      GR3: [
        { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
        { slug: "audiometria", label: "Audiometria" },
        { slug: "acuidade_visual", label: "Acuidade visual" },
        { slug: "espirometria", label: "Espirometria" },
        { slug: "hemograma", label: "Hemograma completo" },
      ],
      GR4: [
        { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
        { slug: "audiometria", label: "Audiometria" },
        { slug: "acuidade_visual", label: "Acuidade visual" },
        { slug: "espirometria", label: "Espirometria" },
        { slug: "raio_x_torax", label: "Raio-X de tórax" },
        { slug: "hemograma", label: "Hemograma completo" },
        { slug: "psicossocial", label: "Avaliação psicossocial" },
      ],
      GR5: [
        { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
        { slug: "audiometria", label: "Audiometria" },
        { slug: "acuidade_visual", label: "Acuidade visual" },
        { slug: "espirometria", label: "Espirometria" },
        { slug: "raio_x_torax", label: "Raio-X de tórax" },
        { slug: "hemograma", label: "Hemograma completo" },
        { slug: "psicossocial", label: "Avaliação psicossocial" },
        { slug: "toxicologico", label: "Exame toxicológico" },
        { slug: "eletrocardiograma", label: "Eletrocardiograma" },
      ],
    };

    const expected = riskGroup ? (EXAMS_BY_RISK_GROUP[riskGroup] ?? []) : [];
    if (expected.length > 0) {
      const { data: existingExams } = await sbAdmin
        .from("admission_documents")
        .select("notes")
        .eq("journey_id", journey.id)
        .eq("doc_type", "atestado_exame");

      const existingSlugs = new Set<string>();
      for (const e of (existingExams ?? []) as Array<{ notes: string | null }>) {
        if (e.notes?.startsWith("EXAM:")) {
          const slug = e.notes.slice("EXAM:".length).split(" — ")[0];
          existingSlugs.add(slug);
        }
      }
      const missing = expected.filter((e) => !existingSlugs.has(e.slug));
      if (missing.length > 0) {
        await sbAdmin.from("admission_documents").insert(
          missing.map((e) => ({
            company_id: journey.company_id,
            journey_id: journey.id,
            doc_type: "atestado_exame",
            required: true,
            status: "pending",
            notes: `EXAM:${e.slug} — ${e.label}`,
          })),
        );
      }
    }
  }

  // Busca docs requeridos
  const { data: docs } = await sbAdmin
    .from("admission_documents")
    .select(
      "id, doc_type, required, status, file_url, file_name, rejection_reason, uploaded_at, notes, text_response",
    )
    .eq("journey_id", journey.id)
    .order("doc_type");

  // Empresa name pra mostrar pro candidato
  const { data: company } = await sbAdmin
    .from("companies")
    .select("company_name")
    .eq("id", journey.company_id)
    .maybeSingle();

  return jsonResponse({
    success: true,
    journey: {
      id: journey.id,
      candidate_name: journey.candidate_name,
      candidate_email: journey.candidate_email,
      candidate_phone: journey.candidate_phone,
      candidate_cpf: journey.candidate_cpf,
      candidate_birth_date: journey.candidate_birth_date,
      candidate_rg: journey.candidate_rg,
      candidate_zip: journey.candidate_zip,
      candidate_address: journey.candidate_address,
      candidate_address_number: journey.candidate_address_number,
      candidate_address_complement: journey.candidate_address_complement,
      candidate_neighborhood: journey.candidate_neighborhood,
      candidate_city: journey.candidate_city,
      candidate_state: journey.candidate_state,
      regime: journey.regime,
      status: journey.status,
      token_expires_at: journey.token_expires_at,
      company_name: company?.company_name ?? null,
    },
    documents: docs ?? [],
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
