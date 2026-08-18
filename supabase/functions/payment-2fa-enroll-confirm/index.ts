// Edge Function: payment-2fa-enroll-confirm
//
// Passo 2 do cadastro do segundo fator de PAGAMENTO: o pagador digita o código
// que chegou no WhatsApp e o aparelho passa a valer pra autorizar pagamento.
//
// Body: { challenge_id: uuid, code: string }
// Resposta: { status: 'active', last4, active_from, replaced }
//
// Auth: JWT válido. A senha já foi cobrada no enroll-start — quem tem o
//       challenge_id chegou até aqui pelo caminho certo, e o código só existe
//       no celular. Cobrar senha de novo não acrescenta prova nenhuma.
//
// ERRO GENÉRICO POR DESIGN: código errado, código expirado, desafio já usado,
// tentativas esgotadas e desafio de outra pessoa devolvem TODOS o mesmo
// INVALID_CODE. Distinguir "expirou" de "errou" entrega um oráculo — o atacante
// aprende quando vale a pena continuar tentando e quando pedir código novo.
//
// Side effects:
//   - payment_2fa_challenges: consumido (ou tentativa gasta) via RPC atômica
//   - payment_2fa_devices: aparelho anterior revogado, novo ativado
//   - payment_2fa_events: device_activated / device_replaced / enroll_failed
//
// Deploy: npx supabase functions deploy payment-2fa-enroll-confirm
// Secrets: PAYMENT_2FA_PEPPER

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Janela de esfriamento na TROCA de aparelho. Golpe de SIM swap sequestra o
// número e paga no mesmo minuto; com 60 min o dono legítimo ainda recebe o
// aviso da troca e tem tempo de revogar antes que o dinheiro saia.
const REPLACEMENT_COOLDOWN_MS = 60 * 60 * 1000;

const GENERIC_INVALID = {
  error: "INVALID_CODE",
  message: "Código inválido ou expirado. Pede um novo e tenta de novo.",
};

interface ConfirmBody {
  challenge_id: string;
  code: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const pepper = Deno.env.get("PAYMENT_2FA_PEPPER");
  if (!pepper) {
    return jsonResponse(
      { error: "2FA not configured", details: "Configure o secret PAYMENT_2FA_PEPPER" },
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
  let challengeId: string;
  let rawCode: string;
  try {
    const body = (await req.json()) as ConfirmBody;
    challengeId = body.challenge_id;
    rawCode = String(body.code ?? "");
    if (!challengeId || !rawCode) throw new Error("missing fields");
  } catch {
    return jsonResponse({ error: "Body must include { challenge_id, code }" }, 400);
  }

  // ── 3. Desafio ─────────────────────────────────────────────────────────────
  // Só o salt e a dona do desafio saem daqui; o code_hash fica no banco e a
  // comparação acontece dentro da RPC — assim nem essa function precisa
  // manipular o segredo armazenado.
  const { data: challenge } = await sbAdmin
    .from("payment_2fa_challenges")
    .select("id, company_id, user_id, purpose, device_id, salt")
    .eq("id", challengeId)
    .maybeSingle();

  // Desafio inexistente, de outra pessoa ou de outro propósito (um código
  // pedido pra PAGAR não serve pra cadastrar aparelho): mesma resposta de
  // código errado. Nada de vazar existência.
  if (!challenge || challenge.user_id !== user.id || challenge.purpose !== "enroll") {
    await logEvent(sbAdmin, {
      company_id: challenge?.company_id ?? null,
      user_id: user.id,
      kind: "enroll_failed",
      metadata: { reason: "challenge_mismatch" },
      ip,
    });
    return jsonResponse(GENERIC_INVALID, 400);
  }

  // ── 4. Consumo atômico ─────────────────────────────────────────────────────
  // O código passa pelo mesmo HMAC do enroll-start; a RPC compara e consome num
  // UPDATE só. Códigos malformados NÃO tomam atalho: viram hash como qualquer
  // outro e gastam tentativa igual — atalho aqui seria oráculo de formato.
  const code = rawCode.replace(/\D/g, "");
  const codeHash = await hmacHex(pepper, `${challenge.salt}:${code}`);

  const { data: consumed, error: rpcErr } = await sbAdmin.rpc(
    "payment_2fa_consume_challenge",
    { p_id: challengeId, p_code_hash: codeHash, p_purpose: "enroll" },
  );

  if (rpcErr) {
    return jsonResponse(
      { error: "CONSUME_FAILED", message: "Não deu pra validar o código agora." },
      500,
    );
  }

  const row = Array.isArray(consumed) ? consumed[0] : consumed;
  if (!row) {
    await logEvent(sbAdmin, {
      company_id: challenge.company_id,
      user_id: user.id,
      kind: "enroll_failed",
      metadata: { reason: "invalid_or_expired", challenge_id: challengeId },
      ip,
    });
    return jsonResponse(GENERIC_INVALID, 400);
  }

  // ── 5. Ativação ────────────────────────────────────────────────────────────
  const deviceId: string | null = row.device_id ?? challenge.device_id ?? null;
  if (!deviceId) {
    return jsonResponse(
      { error: "DEVICE_NOT_FOUND", message: "Aparelho do cadastro não encontrado." },
      500,
    );
  }

  const { data: device } = await sbAdmin
    .from("payment_2fa_devices")
    .select("id, company_id, phone_last4, status")
    .eq("id", deviceId)
    .maybeSingle();

  if (!device || device.status === "revoked") {
    // O device foi revogado depois do envio (novo enroll iniciado, por exemplo).
    // O código até era válido, mas o aparelho não é mais o alvo.
    await logEvent(sbAdmin, {
      company_id: challenge.company_id,
      user_id: user.id,
      kind: "enroll_failed",
      metadata: { reason: "device_revoked", device_id: deviceId },
      ip,
    });
    return jsonResponse(GENERIC_INVALID, 400);
  }

  // É TROCA? Só existe um ativo POR PESSOA, global — o aparelho é o celular
  // dela, não da filial (uq_payment_2fa_devices_active_per_user, em
  // 20260818120300). Por isso a busca NÃO filtra company_id: filtrar acharia
  // "nenhum anterior" quando o ativo estivesse noutra empresa do grupo, e o
  // UPDATE de ativação lá embaixo bateria no índice único — ou, pior, deixaria
  // dois ativos se o índice fosse por empresa. Com um ativo só no banco todo, o
  // maybeSingle é seguro. Isso decide entre valer na hora e valer daqui a 60 min.
  const { data: previous } = await sbAdmin
    .from("payment_2fa_devices")
    .select("id, phone_last4")
    .eq("user_id", user.id)
    .eq("status", "active")
    .neq("id", deviceId)
    .maybeSingle();

  const isReplacement = Boolean(previous);
  const now = Date.now();
  const activeFrom = new Date(
    isReplacement ? now + REPLACEMENT_COOLDOWN_MS : now,
  );

  // Revoga ANTES de ativar: o índice único uq_payment_2fa_devices_active_per_user
  // recusaria dois ativos, e a ordem inversa quebraria a ativação.
  if (previous) {
    await sbAdmin
      .from("payment_2fa_devices")
      .update({
        status: "revoked",
        revoked_at: new Date(now).toISOString(),
        revoked_reason: "replaced_by_new_device",
      })
      .eq("id", previous.id);
  }

  const { error: activateErr } = await sbAdmin
    .from("payment_2fa_devices")
    .update({
      status: "active",
      verified_at: new Date(now).toISOString(),
      active_from: activeFrom.toISOString(),
      revoked_at: null,
      revoked_reason: null,
    })
    .eq("id", deviceId);

  if (activateErr) {
    return jsonResponse(
      { error: "ACTIVATION_FAILED", message: "Não deu pra ativar o aparelho." },
      500,
    );
  }

  // ── 6. Trilha ──────────────────────────────────────────────────────────────
  if (isReplacement) {
    await logEvent(sbAdmin, {
      company_id: device.company_id,
      user_id: user.id,
      kind: "device_replaced",
      metadata: {
        previous_device_id: previous!.id,
        previous_last4: previous!.phone_last4,
        new_device_id: deviceId,
        new_last4: device.phone_last4,
        active_from: activeFrom.toISOString(),
      },
      ip,
    });
  }

  await logEvent(sbAdmin, {
    company_id: device.company_id,
    user_id: user.id,
    kind: "device_activated",
    metadata: {
      device_id: deviceId,
      last4: device.phone_last4,
      active_from: activeFrom.toISOString(),
      replaced: isReplacement,
    },
    ip,
  });

  return jsonResponse({
    status: "active",
    last4: device.phone_last4,
    active_from: activeFrom.toISOString(),
    replaced: isReplacement,
    message: isReplacement
      ? "Celular trocado. Ele libera pagamentos daqui a 1 hora — é a nossa janela de segurança."
      : "Pronto, celular confirmado. A partir de agora todo pagamento pede um código aqui.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Mesmo HMAC do enroll-start: o pepper mora no ambiente da function, então o
// hash guardado no banco é inútil sem ele.
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
