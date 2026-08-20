// Edge Function: payment-2fa-enroll-start
//
// Passo 1 do cadastro do segundo fator de PAGAMENTO: quem tem permissão de
// pagar informa o PRÓPRIO celular e o sistema manda um código de 6 dígitos pela
// instância de WhatsApp DA EMPRESA. Só quem estiver com o aparelho na mão
// consegue concluir (payment-2fa-enroll-confirm).
//
// Body: { company_id: uuid, phone: string, password: string }
// Resposta: { challenge_id, last4, expires_at }  — NUNCA o código.
//
// Auth: JWT válido + can_create no módulo 'folha_pagamento_exec' na empresa
//       + REAUTENTICAÇÃO POR SENHA.
//
//   A senha não é paranoia: cadastrar/trocar o celular do 2FA é a operação que
//   DERRUBA o 2FA. Se bastasse a sessão, um JWT roubado (XSS, notebook
//   destravado, token vazado em log) cadastraria o número do atacante e todo o
//   segundo fator viraria enfeite. Sessão prova "alguém logou aqui um dia";
//   senha prova "é a pessoa, agora".
//
// Side effects:
//   - payment_2fa_devices: linha 'pending' (criada ou reaproveitada)
//   - payment_2fa_challenges: desafio purpose='enroll', TTL 10 min
//   - payment_2fa_events: trilha de tentativa/envio
//   - Mensagem via EvolutionAPI na instância da empresa
//
// NÃO grava em notification_logs de propósito: aquela tabela guarda a mensagem
// EM CLARO e o código apareceria em texto puro pra qualquer admin da empresa.
//
// Deploy: npx supabase functions deploy payment-2fa-enroll-start
// Secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY, PAYMENT_2FA_PEPPER

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 10 minutos: tempo de sobra pra achar o celular, curto o bastante pra que um
// código lido por cima do ombro não sirva de tarde.
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

// Freio de pedido de código: 5 desafios de enroll por usuário a cada 15 min.
// Sem isso, o botão "reenviar" vira metralhadora de WhatsApp em cima do número
// de outra pessoa (e queima a instância da empresa por spam).
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_CHALLENGES = 5;

interface StartBody {
  company_id: string;
  phone: string;
  password: string;
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
  const pepper = Deno.env.get("PAYMENT_2FA_PEPPER");
  if (!evolutionUrl || !evolutionKey) {
    return jsonResponse(
      {
        error: "EvolutionAPI not configured",
        details: "Configure EVOLUTION_API_URL e EVOLUTION_API_KEY",
      },
      500,
    );
  }
  // Sem pepper o hash de 6 dígitos é quebrável por força bruta em segundos.
  // Melhor não existir 2FA do que existir um que finge proteger.
  if (!pepper) {
    return jsonResponse(
      {
        error: "2FA not configured",
        details: "Configure o secret PAYMENT_2FA_PEPPER",
      },
      500,
    );
  }

  // ── 1. Auth ────────────────────────────────────────────────────────────────
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
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey);
  const ip = clientIp(req);

  // ── 2. Body ────────────────────────────────────────────────────────────────
  let companyId: string;
  let rawPhone: string;
  let password: string;
  try {
    const body = (await req.json()) as StartBody;
    companyId = body.company_id;
    rawPhone = String(body.phone ?? "");
    password = String(body.password ?? "");
    if (!companyId || !rawPhone || !password) throw new Error("missing fields");
  } catch {
    return jsonResponse(
      { error: "Body must include { company_id, phone, password }" },
      400,
    );
  }

  // ── 3. Permissão de pagar ──────────────────────────────────────────────────
  // Mesmo par de RPCs usado por core-resource-mutate. O gate é o módulo
  // 'folha_pagamento_exec' com can_create (= EXECUTAR pagamento) — quem não paga
  // não tem por que cadastrar aparelho de aprovação.
  //
  // Note que o módulo sozinho NÃO autoriza pagar: o gate do pagamento em si é
  // papel restrito E módulo E dispositivo 2FA ativo. Aqui basta o módulo porque
  // cadastrar o próprio celular não move dinheiro — e exigir o papel também
  // impediria de preparar o dispositivo antes de receber o papel.
  const { data: isCompanyAdmin } = await sbUser.rpc("is_company_admin", {
    _user_id: user.id,
    _company_id: companyId,
  });
  let canPay = isCompanyAdmin === true;
  if (!canPay) {
    const { data: perms } = await sbUser.rpc("get_user_permissions", {
      _user_id: user.id,
      _company_id: companyId,
      _module: "folha_pagamento_exec",
    });
    const first = Array.isArray(perms) ? perms[0] : perms;
    canPay = Boolean(first?.can_create);
  }
  if (!canPay) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "enroll_denied",
      metadata: { reason: "no_finance_permission" },
      ip,
    });
    return jsonResponse(
      {
        error: "FORBIDDEN",
        message: "Você não tem permissão de pagamento nessa empresa.",
      },
      403,
    );
  }

  // ── 4. Reautenticação por senha ────────────────────────────────────────────
  // Client anônimo DESCARTÁVEL: precisa ser uma instância própria, senão o
  // signInWithPassword sobrescreveria a sessão que veio no header. E o signOut
  // sai com scope 'local' — o padrão do supabase-js é 'global', que revogaria
  // TODOS os refresh tokens do usuário e derrubaria a aba dele no meio do
  // cadastro.
  const sbReauth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: pwErr } = await sbReauth.auth.signInWithPassword({
    email: user.email ?? "",
    password,
  });
  await sbReauth.auth.signOut({ scope: "local" }).catch(() => {});

  if (pwErr) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "enroll_password_failed",
      metadata: {},
      ip,
    });
    return jsonResponse(
      {
        error: "INVALID_PASSWORD",
        message: "Senha incorreta. Confirma e tenta de novo.",
      },
      401,
    );
  }

  // ── 5. Telefone ────────────────────────────────────────────────────────────
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return jsonResponse(
      {
        error: "INVALID_PHONE",
        message: "Confere o celular: precisa ser DDD + número, com WhatsApp.",
      },
      400,
    );
  }

  // ── 6. Instância de WhatsApp da empresa ────────────────────────────────────
  // Buscada ANTES de criar qualquer linha: se não há por onde mandar o código,
  // um device 'pending' órfão só ocuparia o número no índice único e travaria
  // o próximo cadastro legítimo.
  const { data: instance } = await sbAdmin
    .from("whatsapp_instances")
    .select("instance_name, phone_number")
    .eq("company_id", companyId)
    .eq("status", "open")
    .maybeSingle();

  if (!instance) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "enroll_blocked",
      metadata: { reason: "whatsapp_unavailable" },
      ip,
    });
    return jsonResponse(
      {
        error: "WHATSAPP_UNAVAILABLE",
        message:
          "O WhatsApp da empresa está fora do ar. Fala com o admin e tenta em seguida.",
      },
      503,
    );
  }

  // O pagador não pode cadastrar o próprio número REMETENTE da empresa: quem
  // tem acesso à instância leria o código que ela mesma enviou, e a prova de
  // posse não provaria nada.
  const senderPhone = normalizePhone(instance.phone_number ?? "");
  if (senderPhone && senderPhone === phone) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "enroll_blocked",
      metadata: { reason: "same_as_sender", last4: phone.slice(-4) },
      ip,
    });
    return jsonResponse(
      {
        error: "SAME_AS_SENDER",
        message:
          "Esse é o número que envia os códigos da empresa. Usa o seu celular pessoal.",
      },
      400,
    );
  }

  // ── 7. Número já em uso ────────────────────────────────────────────────────
  // SEM filtro de empresa, de propósito: o índice único de telefone é GLOBAL
  // (o dispositivo é o celular da pessoa, não da empresa). Filtrar por empresa
  // aqui deixaria a colisão passar batido e estourar como 23505 lá no INSERT —
  // o usuário receberia um 500 opaco em vez do 409 com mensagem.
  const { data: sameNumber } = await sbAdmin
    .from("payment_2fa_devices")
    .select("id, user_id, status")
    .eq("phone", phone)
    .in("status", ["pending", "active"])
    .maybeSingle();

  if (sameNumber && sameNumber.user_id !== user.id) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "enroll_blocked",
      metadata: { reason: "phone_in_use", last4: phone.slice(-4) },
      ip,
    });
    // Mensagem propositalmente vaga: não confirmamos de quem é o número.
    return jsonResponse(
      {
        error: "PHONE_IN_USE",
        message: "Esse número já está cadastrado nessa empresa.",
      },
      409,
    );
  }
  if (sameNumber && sameNumber.status === "active") {
    return jsonResponse(
      {
        error: "ALREADY_ACTIVE",
        message: "Esse celular já é o seu aparelho de aprovação.",
      },
      409,
    );
  }

  // ── 8. Freio de reenvio ────────────────────────────────────────────────────
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount } = await sbAdmin
    .from("payment_2fa_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("purpose", "enroll")
    .gte("created_at", since);

  if ((recentCount ?? 0) >= RATE_MAX_CHALLENGES) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "enroll_rate_limited",
      metadata: { window_minutes: RATE_WINDOW_MS / 60000 },
      ip,
    });
    return jsonResponse(
      {
        error: "TOO_MANY_REQUESTS",
        message: "Muitos códigos pedidos. Espera uns minutos e tenta de novo.",
      },
      429,
    );
  }

  // ── 9. Device pendente ─────────────────────────────────────────────────────
  // Pendências antigas do mesmo usuário são revogadas: sem isso, "digitei o
  // número errado, corrigi" deixaria dois aparelhos pendentes e o confirm ficaria
  // ambíguo (além de segurar um número que não é de ninguém no índice único).
  await sbAdmin
    .from("payment_2fa_devices")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_reason: "superseded_by_new_enroll",
    })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .neq("phone", phone);

  let deviceId = sameNumber?.id ?? null;
  if (!deviceId) {
    const { data: device, error: devErr } = await sbAdmin
      .from("payment_2fa_devices")
      .insert({
        user_id: user.id,
        company_id: companyId,
        phone,
        status: "pending",
      })
      .select("id")
      .single();
    if (devErr || !device) {
      return jsonResponse(
        { error: "DEVICE_CREATE_FAILED", message: "Não deu pra registrar o aparelho." },
        500,
      );
    }
    deviceId = device.id;
  }

  // ── 10. Código ─────────────────────────────────────────────────────────────
  const code = generateNumericCode(6);
  const salt = randomHex(16);
  const codeHash = await hmacHex(pepper, `${salt}:${code}`);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  const { data: challenge, error: chErr } = await sbAdmin
    .from("payment_2fa_challenges")
    .insert({
      company_id: companyId,
      user_id: user.id,
      purpose: "enroll",
      factor_type: "whatsapp",
      device_id: deviceId,
      salt,
      code_hash: codeHash,
      expires_at: expiresAt.toISOString(),
      sent_to_last4: phone.slice(-4),
    })
    .select("id")
    .single();

  if (chErr || !challenge) {
    return jsonResponse(
      { error: "CHALLENGE_CREATE_FAILED", message: "Não deu pra gerar o código." },
      500,
    );
  }

  // ── 11. Envio ──────────────────────────────────────────────────────────────
  const message = `*Código de verificação: ${code}*\n\n` +
    `Você está cadastrando esse celular pra aprovar pagamentos no SoftHouse. ` +
    `O código vale por 10 minutos.\n\n` +
    `_Não foi você? Não use o código e avisa o RH — alguém está tentando entrar na sua conta._`;

  const baseUrl = evolutionUrl.replace(/\/$/, "");
  let sendOk = false;
  let sendDetails = "";
  try {
    const res = await fetch(
      `${baseUrl}/message/sendText/${instance.instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolutionKey },
        body: JSON.stringify({ number: phone, text: message }),
      },
    );
    sendOk = res.ok;
    if (!res.ok) {
      sendDetails = String(res.status);
    }
  } catch (e) {
    sendDetails = e instanceof Error ? e.name : "network_error";
  }

  if (!sendOk) {
    // Mata o desafio: um código que ninguém recebeu não pode ficar de pé
    // esperando ser adivinhado. expires_at no passado o torna inconsumível pela
    // RPC sem precisar apagar a linha (a trilha continua).
    await sbAdmin
      .from("payment_2fa_challenges")
      .update({ failed_at: new Date().toISOString(), expires_at: new Date().toISOString() })
      .eq("id", challenge.id);

    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "enroll_send_failed",
      metadata: { device_id: deviceId, last4: phone.slice(-4), details: sendDetails },
      ip,
    });
    return jsonResponse(
      {
        error: "WHATSAPP_SEND_FAILED",
        message: "Não conseguimos mandar o código agora. Tenta de novo em instantes.",
      },
      502,
    );
  }

  await logEvent(sbAdmin, {
    company_id: companyId,
    user_id: user.id,
    kind: "enroll_code_sent",
    metadata: {
      device_id: deviceId,
      challenge_id: challenge.id,
      last4: phone.slice(-4),
    },
    ip,
  });

  // Resposta sem o código e sem o telefone completo — quem pediu já tem os dois.
  return jsonResponse({
    challenge_id: challenge.id,
    last4: phone.slice(-4),
    expires_at: expiresAt.toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Convenção da casa: só dígitos, 55 na frente, sem '+'. Valida o formato
// brasileiro (DDD + 8 ou 9 dígitos) porque telefone torto = código enviado pro
// número errado, e a gente só descobre quando o cadastro não conclui.
function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("55")) digits = "55" + digits;
  if (!/^55[0-9]{10,11}$/.test(digits)) return null;
  return digits;
}

// Math.random() é previsível: quem conhece o estado do gerador prevê o próximo
// código. Aqui é CSPRNG + REJEIÇÃO DE MÓDULO — descartar os valores acima do
// maior múltiplo de 10^n que cabe em uint32 mantém os 1.000.000 de códigos
// exatamente equiprováveis. Um `% 1000000` cru enviesaria os primeiros códigos.
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

// HMAC (e não SHA-256 puro) porque a chave é o pepper que mora só no ambiente
// da function: quem levar o dump do banco fica com hash inútil.
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

async function logEvent(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  event: {
    company_id: string | null;
    user_id: string | null;
    kind: string;
    metadata: Record<string, unknown>;
    ip: string | null;
  },
): Promise<void> {
  // Trilha nunca derruba a operação — e nunca carrega código ou telefone cheio.
  await sbAdmin.from("payment_2fa_events").insert(event);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
