// Edge Function: admission-send-token
//
// Envia o link de acesso (form público /admissao/:token) pro candidato
// por email via Resend. Usado tanto no auto-send da criação quanto no
// "Reenviar link" manual da detail page.
//
// Body: { journey_id: uuid, public_url_origin: string }
//   - public_url_origin: ex.: "https://gc.softcom.com.br" — vem do client
//     porque a Edge Function não tem como saber o origin certo.
//
// Auth: JWT de admin_gc/gestor_gc/rh + check de pertinência de empresa.
//
// Side effects:
//   - Email enviado via Resend
//   - admission_events kind='token_sent' com payload { resend_id }
//
// Deploy: npx supabase functions deploy admission-send-token
// Secrets: RESEND_API_KEY (obrigatória), RESEND_FROM (opcional)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  ResendError,
  renderBaseTemplate,
  sendEmail,
} from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REGIME_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  estagiario: "Estágio",
};

interface SendBody {
  journey_id: string;
  public_url_origin: string;
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
  let journeyId: string;
  let origin: string;
  try {
    const body = (await req.json()) as SendBody;
    journeyId = body.journey_id;
    origin = (body.public_url_origin ?? "").replace(/\/$/, "");
    if (!journeyId || !origin) throw new Error("missing fields");
  } catch {
    return jsonResponse(
      { error: "Body must include { journey_id, public_url_origin }" },
      400,
    );
  }

  // 3. Journey + permissão
  const { data: journey, error: jErr } = await sbAdmin
    .from("admission_journeys")
    .select(
      "id, company_id, candidate_name, candidate_email, regime, access_token, token_expires_at",
    )
    .eq("id", journeyId)
    .single();

  if (jErr || !journey) {
    return jsonResponse({ error: "Admissão não encontrada" }, 404);
  }
  if (!journey.candidate_email) {
    return jsonResponse(
      { error: "Candidato não tem email cadastrado" },
      400,
    );
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
      { error: "Sem permissão pra enviar emails" },
      403,
    );
  }

  if (!isAdmin) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: journey.company_id,
      _user_id: user.id,
    });
    if (!belongs) {
      return jsonResponse(
        { error: "Admissão não é da sua empresa" },
        403,
      );
    }
  }

  // 4. Empresa pra mostrar no header do email
  const { data: company } = await sbAdmin
    .from("companies")
    .select("company_name")
    .eq("id", journey.company_id)
    .maybeSingle();

  const companyName = company?.company_name ?? "SoftHouse";
  const candidateUrl = `${origin}/admissao/${journey.access_token}`;
  const expiresStr = journey.token_expires_at
    ? new Date(journey.token_expires_at).toLocaleDateString("pt-BR")
    : null;
  const regimeLabel = REGIME_LABELS[journey.regime] ?? journey.regime;
  const firstName = journey.candidate_name.split(" ")[0];

  const bodyHtml = `
    <p>Oi, ${escapeHtml(firstName)}!</p>
    <p>
      A <strong>${escapeHtml(companyName)}</strong> precisa que você preencha alguns
      dados e mande os documentos pra dar sequência na sua admissão (${escapeHtml(regimeLabel)}).
    </p>
    <p>
      É rapidinho — clica no botão abaixo, tira foto dos documentos com o celular
      ou anexa PDF. Se errar, dá pra reenviar.
    </p>
    ${
    expiresStr
      ? `<p style="color:#64748b;font-size:13px;">
          Esse link vale até <strong>${expiresStr}</strong>. Se vencer, o RH gera um novo.
        </p>`
      : ""
  }
  `;

  const html = renderBaseTemplate({
    heading: `Bem-vindo, ${firstName} 👋`,
    bodyHtml,
    ctaLabel: "Preencher meus dados",
    ctaUrl: candidateUrl,
    companyName,
  });

  const text =
    `Oi ${firstName}! A ${companyName} precisa que você preencha seus dados e mande os documentos pra dar sequência na admissão.\n\n` +
    `Acesse: ${candidateUrl}\n\n` +
    (expiresStr ? `Esse link vale até ${expiresStr}.\n\n` : "") +
    `Se não foi você quem se candidatou, pode ignorar este email.`;

  // 5. Manda
  let resendId: string;
  try {
    const result = await sendEmail({
      to: journey.candidate_email,
      subject: `${companyName}: bora finalizar sua admissão`,
      html,
      text,
    });
    resendId = result.id;
  } catch (err) {
    if (err instanceof ResendError) {
      return jsonResponse(
        { error: "Falha ao enviar email", details: err.message },
        err.status >= 400 && err.status < 600 ? err.status : 500,
      );
    }
    return jsonResponse(
      { error: "Falha ao enviar email", details: (err as Error).message },
      500,
    );
  }

  // 6. Evento timeline
  await sbAdmin.from("admission_events").insert({
    company_id: journey.company_id,
    journey_id: journey.id,
    kind: "token_sent",
    actor_id: user.id,
    message: `Link enviado por email pra ${journey.candidate_email}`,
    payload: { resend_id: resendId, channel: "email" },
  });

  return jsonResponse({
    success: true,
    resend_id: resendId,
    sent_to: journey.candidate_email,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
