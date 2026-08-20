// Edge Function: pix-env-switch
//
// Troca o AMBIENTE ATIVO do PIX da folha (sandbox↔produção) por um painel, em vez
// de SSH no env do edge-runtime. A flag mora em pix_environment_settings; aqui
// ficam o GATE e o 2FA que protegem o flip.
//
// A DIREÇÃO IMPORTA:
//   → produção  = ligar pagamentos REAIS. Exige papel restrito + CÓDIGO no
//                 WhatsApp (mesmo 2FA do pagamento) + PROVA de que o gateway de
//                 produção autentica no Santander (uma consulta read-only). Não
//                 dá pra ligar produção sem o dinheiro estar realmente alcançável.
//   → sandbox   = desligar produção. É a direção SEGURA (nada de real sai depois),
//                 então basta o papel — como um kill-switch, tem que ser fácil.
//
// AÇÕES (body { action, ... }):
//   status    → { active, sandbox:{configured,healthy}, production:{configured,healthy} }
//   challenge → manda o código pro WhatsApp do solicitante (só pra LIGAR produção)
//   switch    → { target, challenge_id?, code? } aplica a troca
//
// Os SEGREDOS do Santander continuam SÓ no gateway — esta function não os toca.
// Ela decide QUAL gateway fica ativo (a flag), nunca com que credencial ele fala.
//
// Deploy: npx supabase functions deploy pix-env-switch
// verify_jwt: padrão (true). Secrets: PAYMENT_2FA_PEPPER, SANTANDER_GW_URL,
//   SANTANDER_GW_URL_PROD, SANTANDER_GW_SECRET, EVOLUTION_API_URL, EVOLUTION_API_KEY

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  activeEnvironment,
  gwBaseUrl,
  getGatewayConfig,
  gwCredentialsHeader,
  type GatewayCreds,
  type PixEnv,
} from "../_shared/pix-env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEVICE_LOCK_MS = 15 * 60 * 1000;
const GW_HEALTH_TIMEOUT_MS = 8_000;
const GW_PROOF_TIMEOUT_MS = 20_000;

const GENERIC_INVALID = {
  error: "INVALID_CODE",
  message: "Código inválido ou expirado. Pede um novo e tenta de novo.",
};

// deno-lint-ignore no-explicit-any
type Sb = any;
// deno-lint-ignore no-explicit-any
type Row = any;

interface Body {
  action: "status" | "challenge" | "switch";
  target?: PixEnv;
  challenge_id?: string;
  code?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const pepper = Deno.env.get("PAYMENT_2FA_PEPPER");
  const gwSecret = Deno.env.get("SANTANDER_GW_SECRET");
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ip = clientIp(req);

  // ── Body ─────────────────────────────────────────────────────────────────────
  let body: Body;
  try {
    const raw = await req.json();
    const action = String(raw.action ?? "");
    if (!["status", "challenge", "switch"].includes(action)) {
      throw new Error("action precisa ser 'status', 'challenge' ou 'switch'");
    }
    body = {
      action: action as Body["action"],
      target: raw.target === "production" ? "production" : raw.target === "sandbox" ? "sandbox" : undefined,
      challenge_id: raw.challenge_id ? String(raw.challenge_id) : undefined,
      code: raw.code != null ? String(raw.code) : undefined,
    };
  } catch (e) {
    return json({ error: "BAD_REQUEST", message: (e as Error).message }, 400);
  }

  // ── Papel: só admin_gc / admin / diretoria trocam ambiente ────────────────────
  const roleOk = await hasSwitchRole(sbUser, user.id);
  if (!roleOk) {
    return json(
      { error: "FORBIDDEN_ROLE", message: "Só o admin de G&C e a diretoria podem trocar o ambiente do PIX." },
      403,
    );
  }

  // ── status ────────────────────────────────────────────────────────────────────
  if (body.action === "status") {
    const active = await activeEnvironment(sbAdmin);
    const [sandbox, production] = await Promise.all([
      probeGateway(sbAdmin, "sandbox"),
      probeGateway(sbAdmin, "production"),
    ]);
    return json({ active, sandbox, production }, 200);
  }

  // Daqui pra frente é ação de escrita: precisa de instância de config completa.
  if (!pepper) {
    return json({ error: "NOT_CONFIGURED", message: "2FA indisponível. Fala com o admin." }, 200);
  }

  // ── challenge (só pra LIGAR produção) ─────────────────────────────────────────
  if (body.action === "challenge") {
    if (!evolutionUrl || !evolutionKey) {
      return json({ error: "WHATSAPP_UNAVAILABLE", message: "Envio de código indisponível. Fala com o admin." }, 200);
    }
    return await handleChallenge({ sbAdmin, user, pepper, evolutionUrl, evolutionKey, ip });
  }

  // ── switch ────────────────────────────────────────────────────────────────────
  if (!body.target) {
    return json({ error: "BAD_REQUEST", message: "Informe target ('sandbox' ou 'production')." }, 400);
  }

  // Voltar pra sandbox é a direção segura: papel basta (já validado). Nada de real
  // sai depois, então tem que ser tão fácil quanto apertar um kill-switch.
  if (body.target === "sandbox") {
    const { data: row } = await sbAdmin.rpc("pix_set_active_environment", {
      p_env: "sandbox",
      p_actor: user.id,
    });
    await logEvent(sbAdmin, {
      user_id: user.id,
      kind: "pix_env_switched",
      metadata: { to: "sandbox", via: "role_only" },
      ip,
    });
    return json({ ok: true, active: rowEnv(row) }, 200);
  }

  // Ligar PRODUÇÃO: código + prova de que o gateway de produção autentica.
  if (!body.challenge_id || !body.code) {
    return json({ error: "BAD_REQUEST", message: "Ligar produção exige challenge_id e code." }, 400);
  }
  return await handleSwitchToProduction({
    sbAdmin,
    user,
    body,
    pepper,
    gwSecret,
    ip,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// challenge — abre um desafio 'env_switch' e manda o código
// ─────────────────────────────────────────────────────────────────────────────
async function handleChallenge(ctx: {
  sbAdmin: Sb;
  user: Row;
  pepper: string;
  evolutionUrl: string;
  evolutionKey: string;
  ip: string | null;
}): Promise<Response> {
  const { sbAdmin, user, pepper, evolutionUrl, evolutionKey, ip } = ctx;

  // Só liga produção se as CREDENCIAIS de produção existem (configuradas no
  // painel). Sem elas, o código não teria o que autorizar.
  if (!(await getGatewayConfig(sbAdmin, "production"))) {
    return json(
      { error: "PROD_NOT_CONFIGURED", message: "As credenciais de produção ainda não estão configuradas no painel." },
      200,
    );
  }

  const device = await activeDevice(sbAdmin, user.id);
  if (!device) {
    return json(
      { error: "PAYMENT_2FA_REQUIRED", message: "Cadastra seu celular de aprovação antes de ligar produção." },
      200,
    );
  }
  if (device.locked_until && new Date(device.locked_until).getTime() > Date.now()) {
    return json({ error: "PAYMENT_2FA_LOCKED", message: "Muitos códigos errados. Aparelho bloqueado por alguns minutos." }, 200);
  }

  const { data: instance } = await sbAdmin
    .from("whatsapp_instances")
    .select("instance_name")
    .eq("company_id", device.company_id)
    .eq("status", "open")
    .maybeSingle();
  if (!instance) {
    return json({ error: "WHATSAPP_UNAVAILABLE", message: "O WhatsApp da empresa está fora do ar." }, 200);
  }

  const code = generateNumericCode(6);
  const salt = randomHex(16);
  const codeHash = await hmacHex(pepper, `${salt}:${code}`);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  const { data: challenge, error: chErr } = await sbAdmin
    .from("payment_2fa_challenges")
    .insert({
      company_id: device.company_id,
      user_id: user.id,
      purpose: "env_switch",
      factor_type: "whatsapp",
      device_id: device.id,
      salt,
      code_hash: codeHash,
      expires_at: expiresAt.toISOString(),
      sent_to_last4: device.phone_last4,
    })
    .select("id")
    .single();
  if (chErr || !challenge) {
    return json({ error: "CHALLENGE_CREATE_FAILED", message: "Não deu pra gerar o código." }, 200);
  }

  const message =
    `*Código pra LIGAR PAGAMENTOS REAIS (produção): ${code}*\n\n` +
    `Isso tira a folha do sandbox e liga o PIX de verdade. Se não foi você quem ` +
    `pediu, NÃO use o código e avisa a TI.\n\n` +
    `O código vale por 5 minutos.`;

  let sendOk = false;
  try {
    const res = await fetch(`${evolutionUrl.replace(/\/$/, "")}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionKey },
      body: JSON.stringify({ number: device.phone, text: message }),
    });
    sendOk = res.ok;
  } catch {
    sendOk = false;
  }

  if (!sendOk) {
    await sbAdmin
      .from("payment_2fa_challenges")
      .update({ failed_at: new Date().toISOString(), expires_at: new Date().toISOString() })
      .eq("id", challenge.id);
    return json({ error: "WHATSAPP_SEND_FAILED", message: "Não conseguimos mandar o código agora." }, 200);
  }

  await logEvent(sbAdmin, {
    company_id: device.company_id,
    user_id: user.id,
    kind: "pix_env_challenge_sent",
    metadata: { challenge_id: challenge.id, last4: device.phone_last4 },
    ip,
  });

  return json(
    { challenge_id: challenge.id, last4: device.phone_last4, expires_at: expiresAt.toISOString() },
    200,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// switch → produção — consome o código, PROVA o gateway, então liga
// ─────────────────────────────────────────────────────────────────────────────
async function handleSwitchToProduction(ctx: {
  sbAdmin: Sb;
  user: Row;
  body: Body;
  pepper: string;
  gwSecret: string | undefined;
  ip: string | null;
}): Promise<Response> {
  const { sbAdmin, user, body, pepper, gwSecret, ip } = ctx;

  const prodCreds = await getGatewayConfig(sbAdmin, "production");
  const gwUrl = gwBaseUrl();
  if (!gwUrl || !prodCreds) {
    return json({ error: "PROD_NOT_CONFIGURED", message: "As credenciais de produção não estão configuradas no painel." }, 200);
  }

  const device = await activeDevice(sbAdmin, user.id);
  if (!device) {
    return json({ error: "PAYMENT_2FA_REQUIRED", message: "Cadastra seu celular de aprovação antes de ligar produção." }, 200);
  }

  const { data: challenge } = await sbAdmin
    .from("payment_2fa_challenges")
    .select("id, user_id, purpose, device_id, salt, max_attempts, attempts")
    .eq("id", body.challenge_id)
    .maybeSingle();
  if (
    !challenge ||
    challenge.user_id !== user.id ||
    challenge.purpose !== "env_switch" ||
    (challenge.device_id && challenge.device_id !== device.id)
  ) {
    return json(GENERIC_INVALID, 400);
  }

  // Consumo atômico — mesma RPC do pagamento, purpose 'env_switch'.
  const code = String(body.code).replace(/\D/g, "");
  const codeHash = await hmacHex(pepper, `${challenge.salt}:${code}`);
  const { data: consumed, error: consumeErr } = await sbAdmin.rpc("payment_2fa_consume_challenge", {
    p_id: challenge.id,
    p_code_hash: codeHash,
    p_purpose: "env_switch",
  });
  if (consumeErr) {
    return json({ error: "CONSUME_FAILED", message: "Não deu pra validar o código agora." }, 200);
  }
  const consumedRow = Array.isArray(consumed) ? consumed[0] : consumed;
  if (!consumedRow) {
    const { data: after } = await sbAdmin
      .from("payment_2fa_challenges")
      .select("attempts, max_attempts")
      .eq("id", challenge.id)
      .maybeSingle();
    if (after && after.attempts >= after.max_attempts) {
      await sbAdmin
        .from("payment_2fa_devices")
        .update({ locked_until: new Date(Date.now() + DEVICE_LOCK_MS).toISOString() })
        .eq("id", device.id);
    }
    await logEvent(sbAdmin, {
      user_id: user.id,
      kind: "pix_env_code_failed",
      metadata: { challenge_id: challenge.id },
      ip,
    });
    return json(GENERIC_INVALID, 400);
  }
  if (device.locked_until) {
    await sbAdmin.from("payment_2fa_devices").update({ locked_until: null }).eq("id", device.id);
  }

  // PROVA: o gateway de produção autentica no Santander AGORA? /account/accounts
  // é read-only (não move dinheiro) e só passa se o token OAuth de produção sai —
  // ou seja, se o cert + as credenciais de produção estão certos. Ligar produção
  // sem essa prova é convidar o "descobri no dia do pagamento".
  const proof = await proveGateway(gwUrl, prodCreds, gwSecret);
  if (!proof.ok) {
    await logEvent(sbAdmin, {
      user_id: user.id,
      kind: "pix_env_switch_blocked",
      metadata: { to: "production", reason: proof.reason },
      ip,
    });
    return json(
      {
        error: "PROD_GATEWAY_UNPROVEN",
        message:
          "O gateway de produção não autenticou no Santander (" + proof.reason +
          "). Confere o certificado e as credenciais de produção antes de ligar.",
      },
      200,
    );
  }

  const { data: row, error: setErr } = await sbAdmin.rpc("pix_set_active_environment", {
    p_env: "production",
    p_actor: user.id,
  });
  if (setErr) {
    return json({ error: "SWITCH_FAILED", message: "Não deu pra ligar produção agora." }, 200);
  }

  await logEvent(sbAdmin, {
    company_id: device.company_id,
    user_id: user.id,
    kind: "pix_env_switched",
    metadata: { to: "production", proven: true },
    ip,
  });

  return json({ ok: true, active: rowEnv(row) }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway probes
// ─────────────────────────────────────────────────────────────────────────────

/** Status do ambiente: `configured` = credenciais salvas no painel; `healthy` =
 *  o gateway (um só) responde no /health (rota SEM auth). /health não prova
 *  credencial — a prova de credencial de produção é feita ao LIGAR (proveGateway). */
async function probeGateway(
  sbAdmin: Sb,
  env: PixEnv,
): Promise<{ configured: boolean; healthy: boolean }> {
  const configured = !!(await getGatewayConfig(sbAdmin, env));
  const url = gwBaseUrl();
  if (!url) return { configured, healthy: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GW_HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    const jsonBody = await res.json().catch(() => null);
    return { configured, healthy: res.ok && jsonBody?.ok === true };
  } catch {
    return { configured, healthy: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Prova de credencial: um GET autenticado (com as creds de produção no header)
 *  que força o OAuth do gateway. 200 = token de produção saiu (cert + creds ok).
 *  Qualquer outra coisa = não ligue. */
async function proveGateway(
  url: string,
  creds: GatewayCreds,
  gwSecret: string | undefined,
): Promise<{ ok: boolean; reason: string }> {
  if (!gwSecret) return { ok: false, reason: "gateway sem segredo configurado" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GW_PROOF_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/account/accounts`, {
      headers: { Authorization: `Bearer ${gwSecret}`, ...gwCredentialsHeader(creds) },
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true, reason: "ok" };
    return { ok: false, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === "AbortError" ? "timeout" : "rede/TLS" };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function hasSwitchRole(sbUser: Sb, userId: string): Promise<boolean> {
  const { data: roles } = await sbUser.from("user_roles").select("role").eq("user_id", userId);
  return (roles ?? []).some((r: { role: string }) =>
    ["admin_gc", "admin", "diretoria"].includes(String(r.role)),
  );
}

async function activeDevice(sbAdmin: Sb, userId: string): Promise<Row | null> {
  const { data } = await sbAdmin
    .from("payment_2fa_devices")
    .select("id, phone, phone_last4, company_id, status, locked_until")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data ?? null;
}

function rowEnv(row: unknown): string {
  const r = Array.isArray(row) ? row[0] : row;
  return (r as { active_environment?: string })?.active_environment ?? "sandbox";
}

function generateNumericCode(digits: number): string {
  const range = 10 ** digits;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return String(value % range).padStart(digits, "0");
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

async function logEvent(
  sbAdmin: Sb,
  event: { company_id?: string | null; user_id: string | null; kind: string; metadata: Record<string, unknown>; ip: string | null },
): Promise<void> {
  await sbAdmin.from("payment_2fa_events").insert({
    company_id: event.company_id ?? null,
    user_id: event.user_id,
    kind: event.kind,
    metadata: event.metadata,
    ip: event.ip,
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
