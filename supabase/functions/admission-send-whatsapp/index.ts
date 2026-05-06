// Edge Function: admission-send-whatsapp
//
// Envia o link de acesso (form público /admissao/:token) pro candidato
// por WhatsApp via EvolutionAPI. Usado tanto no auto-send da criação quanto
// no "Reenviar por WhatsApp" manual da detail page.
//
// Body: { journey_id: uuid, public_url_origin: string }
//   - public_url_origin: ex.: "https://gc.softcom.com.br" — vem do client
//     porque a Edge Function não tem como saber o origin certo.
//
// Auth: JWT de admin_gc/gestor_gc/rh + check de pertinência de empresa.
//
// Side effects:
//   - Mensagem enviada via EvolutionAPI usando a instância da empresa
//   - admission_events kind='token_sent' com payload { channel: 'whatsapp' }
//
// Deploy: npx supabase functions deploy admission-send-whatsapp
// Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY (compartilhados com whatsapp-api)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

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
  // Contexto opcional pra customizar a mensagem
  context?: "needs_adjustment";
  doc_label?: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!evolutionUrl || !evolutionKey) {
    return jsonResponse(
      {
        error: "EvolutionAPI not configured",
        details: "Configure EVOLUTION_API_URL e EVOLUTION_API_KEY",
      },
      500,
    );
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
  let context: string | undefined;
  let docLabel: string | undefined;
  let reason: string | undefined;
  try {
    const body = (await req.json()) as SendBody;
    journeyId = body.journey_id;
    origin = (body.public_url_origin ?? "").replace(/\/$/, "");
    context = body.context;
    docLabel = body.doc_label;
    reason = body.reason;
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
      "id, company_id, candidate_name, candidate_phone, regime, access_token, token_expires_at",
    )
    .eq("id", journeyId)
    .single();

  if (jErr || !journey) {
    return jsonResponse({ error: "Admissão não encontrada" }, 404);
  }
  if (!journey.candidate_phone) {
    return jsonResponse(
      { error: "Candidato não tem telefone cadastrado" },
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
      { error: "Sem permissão pra enviar mensagens" },
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

  // 4. Pega instância de WhatsApp ativa da empresa
  const { data: instance } = await sbAdmin
    .from("whatsapp_instances")
    .select("instance_name, status")
    .eq("company_id", journey.company_id)
    .eq("status", "open")
    .maybeSingle();

  if (!instance) {
    return jsonResponse(
      {
        error: "Sem instância WhatsApp ativa pra essa empresa",
        details: "Configure em Configurações → WhatsApp",
      },
      400,
    );
  }

  // 5. Empresa
  const { data: company } = await sbAdmin
    .from("companies")
    .select("company_name")
    .eq("id", journey.company_id)
    .maybeSingle();

  const companyName = company?.company_name ?? "SoftHouse";
  const candidateUrl = `${origin}/admissao/${journey.access_token}`;
  const regimeLabel = REGIME_LABELS[journey.regime] ?? journey.regime;
  const firstName = journey.candidate_name.split(" ")[0];
  const expiresStr = journey.token_expires_at
    ? new Date(journey.token_expires_at).toLocaleDateString("pt-BR")
    : null;

  const message = context === "needs_adjustment"
    ? `Oi *${firstName}*! 👋\n\n` +
      `Um documento da sua admissão na *${companyName}* precisa de ajuste:\n\n` +
      (docLabel ? `📄 *${docLabel}*\n` : "") +
      (reason ? `📝 ${reason}\n\n` : "\n") +
      `Acessa o link e reenvia, beleza?\n` +
      `👉 ${candidateUrl}\n\n` +
      `Qualquer dúvida, é só responder. 💬`
    : `Oi *${firstName}*! 👋\n\n` +
      `A *${companyName}* precisa que você preencha seus dados e mande seus documentos pra dar sequência na sua admissão (*${regimeLabel}*). 🎯\n\n` +
      `É rapidinho, dá pra mandar foto dos docs pelo celular:\n` +
      `👉 ${candidateUrl}\n\n` +
      (expiresStr ? `_O link vale até ${expiresStr}._\n\n` : "") +
      `Qualquer dúvida, é só responder essa mensagem. 💬`;

  // 6. Limpa telefone (só dígitos, com 55 na frente)
  let phone = journey.candidate_phone.replace(/\D/g, "");
  if (!phone.startsWith("55")) phone = "55" + phone;

  // 7. Manda via EvolutionAPI
  const baseUrl = evolutionUrl.replace(/\/$/, "");
  const res = await fetch(
    `${baseUrl}/message/sendText/${instance.instance_name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionKey,
      },
      body: JSON.stringify({ number: phone, text: message }),
    },
  );

  const sendResult = await res.json().catch(() => ({}));

  if (!res.ok) {
    return jsonResponse(
      {
        error: "Falha ao enviar WhatsApp",
        details: JSON.stringify(sendResult),
      },
      500,
    );
  }

  // 8. Evento timeline
  await sbAdmin.from("admission_events").insert({
    company_id: journey.company_id,
    journey_id: journey.id,
    kind: "token_sent",
    actor_id: user.id,
    message: `Link enviado por WhatsApp pra ${journey.candidate_phone}`,
    payload: { channel: "whatsapp", phone },
  });

  return jsonResponse({
    success: true,
    sent_to: journey.candidate_phone,
    channel: "whatsapp",
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
