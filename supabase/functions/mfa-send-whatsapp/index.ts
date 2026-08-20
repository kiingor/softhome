// ─────────────────────────────────────────────────────────────────────────────
// Send SMS Hook do GoTrue → entrega o OTP do MFA pelo WhatsApp (Evolution).
//
// Por que existe: o MFA de login (2º fator dos papéis admin_gc/diretoria) usa o
// fator TELEFONE nativo do GoTrue — é ele que marca o JWT como AAL2, e a RLS
// exige AAL2 pros dados sensíveis. Mas o GoTrue nativo só sabe mandar SMS por
// provedores (Twilio etc.). Este hook intercepta o envio e manda o código pela
// MESMA Evolution que o resto do sistema já usa, sem provedor de SMS nenhum.
//
// Segurança:
//   • O GoTrue assina cada chamada (standardwebhooks / HMAC-SHA256). Sem assinatura
//     válida a função recusa — senão viraria um endpoint aberto de spam de WhatsApp
//     pela nossa instância.
//   • O OTP NUNCA é logado. Nem o telefone inteiro — só os últimos 4 dígitos.
//   • verify_jwt=false: quem autentica é o HMAC do hook, não um JWT.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HOOK_SECRET = Deno.env.get("MFA_SEND_SMS_HOOK_SECRET") ?? "";
const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TOLERANCE_SECONDS = 300; // janela anti-replay do webhook

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Comparação de tempo constante entre duas strings ASCII de igual papel. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifica a assinatura standardwebhooks que o GoTrue envia.
 * secret = "whsec_<base64>"; conteúdo assinado = "<id>.<timestamp>.<body>".
 */
async function verifySignature(
  secret: string,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  // Anti-replay: recusa timestamps muito velhos ou do futuro.
  const now = Math.floor(Date.now() / 1000);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > TOLERANCE_SECONDS) {
    return false;
  }

  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    b64ToBytes(keyB64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = `${id}.${ts}.${rawBody}`;
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = bytesToB64(new Uint8Array(mac));

  // O header pode trazer várias assinaturas separadas por espaço, cada uma
  // "v1,<base64>". Basta uma bater.
  for (const part of sigHeader.split(" ")) {
    const comma = part.indexOf(",");
    const provided = comma >= 0 ? part.slice(comma + 1) : part;
    if (timingSafeEqual(provided, expected)) return true;
  }
  return false;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!HOOK_SECRET) {
    console.error("mfa-send-whatsapp: MFA_SEND_SMS_HOOK_SECRET ausente");
    return json({ error: "misconfigured" }, 500);
  }

  const rawBody = await req.text();

  const ok = await verifySignature(HOOK_SECRET, req.headers, rawBody);
  if (!ok) {
    // Não diz por quê: um atacante não ganha oráculo de assinatura.
    console.warn("mfa-send-whatsapp: assinatura de webhook inválida — recusado");
    return json({ error: "invalid_signature" }, 401);
  }

  let payload: {
    user?: { id?: string; phone?: string };
    sms?: { otp?: string; phone?: string };
    phone?: string;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const otp = payload.sms?.otp;
  const phone = (payload.sms?.phone ?? payload.user?.phone ?? payload.phone ?? "")
    .replace(/\D/g, "");
  const userId = payload.user?.id;

  if (!otp || !phone) {
    // Diagnóstico sem vazar dado: só as chaves presentes, nunca os valores.
    console.error(
      "mfa-send-whatsapp: payload sem otp/phone. keys=" +
        JSON.stringify({
          top: Object.keys(payload ?? {}),
          user: Object.keys(payload.user ?? {}),
          sms: Object.keys(payload.sms ?? {}),
        }),
    );
    return json({ error: "missing_phone_or_otp" }, 400);
  }

  // Resolve a instância de WhatsApp: a da empresa do usuário; se não achar,
  // qualquer instância aberta (sistema é single-tenant).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let instanceName: string | null = null;
  if (userId) {
    const { data } = await admin
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.company_id) {
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("company_id", data.company_id)
        .eq("status", "open")
        .maybeSingle();
      instanceName = inst?.instance_name ?? null;
    }
  }
  if (!instanceName) {
    const { data: any } = await admin
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    instanceName = any?.instance_name ?? null;
  }

  if (!instanceName) {
    console.error("mfa-send-whatsapp: nenhuma instância de WhatsApp aberta");
    // 503 → o GoTrue devolve erro ao cliente, que mostra "não deu pra enviar".
    return json({ error: "whatsapp_unavailable" }, 503);
  }

  const message =
    `*Seu código de acesso: ${otp}*\n\n` +
    `É o segundo fator pra entrar no SoftHouse. Vale por poucos minutos.\n\n` +
    `_Não foi você quem tentou entrar? Não use o código e avise o RH._`;

  const baseUrl = EVOLUTION_URL.replace(/\/$/, "");
  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number: phone, text: message }),
    });
    if (!res.ok) {
      console.error(
        `mfa-send-whatsapp: Evolution recusou (status ${res.status}) para *${phone.slice(-4)}`,
      );
      return json({ error: "send_failed", status: res.status }, 502);
    }
  } catch (e) {
    console.error(
      "mfa-send-whatsapp: falha de rede ao enviar: " +
        (e instanceof Error ? e.name : "erro"),
    );
    return json({ error: "network_error" }, 502);
  }

  console.info(`mfa-send-whatsapp: código entregue para *${phone.slice(-4)}`);
  return json({});
});
