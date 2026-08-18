// Edge Function: payroll-pix-pay
//
// Manda o PIX de UMA linha da folha. É a operação mais irreversível do sistema:
// um PIX enviado não volta, não tem estorno unilateral e não tem "desfazer".
// Tudo aqui é escrito partindo dessa premissa.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE UMA FUNCTION SÓ COM DUAS AÇÕES (e não duas functions)
//
// Body: { entry_id, action: 'challenge' | 'execute', challenge_id?, code? }
//
// O desafio 2FA precisa nascer AMARRADO à transferência (payment_2fa_challenges
// .transfer_id). E a transferência nasce em payroll_pix_open_transfer — que é a
// RPC que valida período aprovado, pensão, chave PIX, já-pago e já-em-voo. Ou
// seja: não existe "criar desafio" antes de "abrir transferência". Separar em
// duas functions obrigaria a primeira a devolver o transfer_id e a segunda a
// confiar nele vindo do cliente — e transfer_id vindo do cliente é exatamente o
// buraco que o gate 'challenge.transfer_id aponta pro entry_id pedido' fecha.
//
//   action: 'challenge' → abre (ou reaproveita) a transferência, gera o código
//                         e manda pelo WhatsApp DA EMPRESA pro celular provado
//                         do pagador, com NOME DO FAVORECIDO E VALOR na
//                         mensagem. Responde { transfer_id, challenge_id, last4,
//                         expires_at, amount, payee_name, payee_pix_key_masked }.
//   action: 'execute'   → consome o código e manda o dinheiro.
//
// O CLIENTE NUNCA MANDA VALOR NEM CHAVE. Ele manda entry_id e o código. Quem
// decide quanto e pra quem é a linha congelada na aprovação da diretoria
// (payroll_payable_lines) — mexer no DevTools não muda o destinatário.
//
// ─────────────────────────────────────────────────────────────────────────────
// GATE TRIPLO (todo pagamento, sempre)
//   1. PAPEL      — admin_gc/admin ou diretoria em user_roles.
//   2. MÓDULO     — folha_pagamento_exec.can_create (get_user_permissions,
//                   mesmo padrão de core-resource-mutate).
//   3. APARELHO   — payment_2fa_devices ativo, já fora da janela anti-SIM-swap
//                   (active_from <= now) e sem locked_until vigente.
// Cada um falta com um código próprio: quem não pode pagar precisa saber O QUE
// falta pra resolver, e nenhum dos três vaza informação útil pra atacante.
//
// ─────────────────────────────────────────────────────────────────────────────
// COMO O ERRO É CLASSIFICADO (a decisão que evita pagar duas vezes)
//   Timeout / erro de rede / 5xx  → payroll_pix_mark_unknown + HTTP 202.
//                                   NÃO SABEMOS se o dinheiro saiu. Nunca
//                                   reenviamos. Sai daí por gente
//                                   (payroll_pix_resolve_unknown) ou por
//                                   consulta (payroll-pix-reconcile).
//   4xx de negócio                → payroll_pix_fail + HTTP 200 status 'failed'.
//                                   O banco disse não: sabemos que não saiu.
//
// Erro do provedor NUNCA volta cru pro cliente: o corpo do banco fica em
// response_payload/error_message (visível pro RH pela RLS da tabela), e o
// cliente recebe uma frase nossa.
//
// Deploy: npx supabase functions deploy payroll-pix-pay
// verify_jwt: padrão (true) — de propósito FORA do config.toml, que só lista
//             as functions públicas. Pagamento não é público.
// Secrets: PAYMENT_2FA_PEPPER, SANTANDER_GW_URL, SANTANDER_GW_SECRET,
//          SANTANDER_ENVIRONMENT (sandbox|production),
//          EVOLUTION_API_URL, EVOLUTION_API_KEY

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 5 minutos, metade do TTL do enroll. Aqui o código é a última tranca antes do
// dinheiro sair, e a pessoa está com o celular na mão AGORA — o diálogo mostra
// a contagem. Janela curta = menos tempo pra um código lido por cima do ombro
// (ou num WhatsApp Web esquecido aberto) ainda valer alguma coisa.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Freio de MÁQUINA, não de gente. Uma folha de 300 pessoas são 300 desafios no
// mesmo dia, então um limite baixo (como os 5/15min do enroll) quebraria o uso
// real. 40 em 15 min ainda é mais rápido do que qualquer humano clicando, e
// segura um script que resolva metralhar a instância de WhatsApp da empresa.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_CHALLENGES_PER_USER = 40;

// Reenvio de código da MESMA transferência. "Não chegou, manda de novo" é
// legítimo umas poucas vezes; a partir daí é alguém pescando código.
const MAX_CHALLENGES_PER_TRANSFER = 5;

// Trava do aparelho depois de esgotar as tentativas de um desafio. Não é banimento:
// é fazer a força bruta custar tempo (1M de códigos a 3 chutes por 15 min).
const DEVICE_LOCK_MS = 15 * 60 * 1000;

// Timeouts do gateway. O POST é barato (READY_TO_PAY não move dinheiro), a
// confirmação é a cara — por isso ela tem mais fôlego antes de virar 'unknown'.
const GW_TIMEOUT_SEND_MS = 20_000;
const GW_TIMEOUT_CONFIRM_MS = 25_000;

const GENERIC_INVALID = {
  error: "INVALID_CODE",
  message: "Código inválido ou expirado. Pede um novo e tenta de novo.",
};

// Os clientes do supabase-js e as linhas que vêm delas andam sem tipo aqui: os
// types gerados do banco não são importados dentro do runtime das functions
// (padrão do repo). O apelido concentra o `any` num lugar só, em vez de
// espalhar deno-lint-ignore por dez assinaturas.
// deno-lint-ignore no-explicit-any
type Sb = any;
// deno-lint-ignore no-explicit-any
type Row = any;

interface PayBody {
  entry_id: string;
  action: "challenge" | "execute" | "check" | "cancel";
  challenge_id?: string;
  code?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── 0. Configuração ────────────────────────────────────────────────────────
  // Tudo conferido ANTES de tocar no banco: abrir uma transferência e só então
  // descobrir que não há gateway configurado deixaria uma tentativa 'created'
  // ocupando o índice de "em voo" — e travando o lançamento pro próximo clique.
  const pepper = Deno.env.get("PAYMENT_2FA_PEPPER");
  const gwUrl = (Deno.env.get("SANTANDER_GW_URL") ?? "").replace(/\/$/, "");
  const gwSecret = Deno.env.get("SANTANDER_GW_SECRET");
  // Default 'sandbox': na dúvida, o ambiente certo é o que não move dinheiro.
  const environment = Deno.env.get("SANTANDER_ENVIRONMENT") ?? "sandbox";
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

  if (!pepper) {
    return jsonResponse(
      { error: "PAYMENT_NOT_CONFIGURED", message: "Pagamento indisponível. Fala com o admin." },
      500,
    );
  }
  if (!gwUrl || !gwSecret) {
    return jsonResponse(
      { error: "PAYMENT_NOT_CONFIGURED", message: "Pagamento indisponível. Fala com o admin." },
      500,
    );
  }
  if (!["sandbox", "production"].includes(environment)) {
    return jsonResponse(
      { error: "PAYMENT_NOT_CONFIGURED", message: "Ambiente de pagamento inválido." },
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

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ip = clientIp(req);

  // ── 2. Body ────────────────────────────────────────────────────────────────
  let body: PayBody;
  try {
    const raw = await req.json();
    const validActions = ["challenge", "execute", "check", "cancel"];
    body = {
      entry_id: String(raw.entry_id ?? "").trim(),
      action: validActions.includes(String(raw.action))
        ? (String(raw.action) as PayBody["action"])
        : "challenge",
      challenge_id: raw.challenge_id ? String(raw.challenge_id) : undefined,
      code: raw.code != null ? String(raw.code) : undefined,
    };
    if (!body.entry_id) throw new Error("entry_id obrigatório");
    if (!validActions.includes(String(raw.action))) {
      throw new Error("action precisa ser 'challenge', 'execute', 'check' ou 'cancel'");
    }
  } catch (e) {
    return jsonResponse(
      { error: "BAD_REQUEST", message: "Body inválido: " + (e as Error).message },
      400,
    );
  }

  // ── 3. Empresa do lançamento ───────────────────────────────────────────────
  // Descoberta no servidor, nunca recebida do cliente: é o recorte do gate de
  // permissão, e deixar o cliente escolher a empresa seria deixá-lo escolher
  // onde ele tem permissão.
  const companyId = await resolveCompanyId(sbAdmin, body.entry_id);
  if (!companyId) {
    return jsonResponse(
      { error: "ENTRY_NOT_FOUND", message: "Esse lançamento não existe." },
      404,
    );
  }

  // ── 4. Gate ────────────────────────────────────────────────────────────────
  // Pagar (challenge/execute) exige papel + módulo + aparelho de 2FA. Conferir /
  // cancelar exige só papel + módulo: não movem dinheiro.
  const paying = body.action === "challenge" || body.action === "execute";
  const gate = await checkPaymentGate(sbUser, sbAdmin, user.id, companyId, paying);
  if (!gate.ok) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_denied",
      metadata: { reason: gate.error, entry_id: body.entry_id, action: body.action },
      ip,
    });
    return jsonResponse({ error: gate.error, message: gate.message }, 403);
  }
  const device = gate.device;

  // ── 5. Conferir agora ──────────────────────────────────────────────────────
  // Pergunta ao banco o estado da transferência em voo desse lançamento SEM
  // esperar o cron. Não decide nada sozinho: zera o next_check_at pra a linha
  // entrar na fila e dispara o reconciliador, que só liquida/recusa em resultado
  // terminal e provado. No sandbox o mock devolve PENDING_VALIDATION — então
  // "conferir" mostra honestamente que o banco-fake ainda não finalizou.
  if (body.action === "check") {
    const { data: tr } = await sbAdmin
      .from("payroll_pix_transfers")
      .select("id, status")
      .eq("entry_id", body.entry_id)
      .in("status", ["sent", "confirmed", "unknown"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!tr) {
      return jsonResponse(
        { error: "NADA_A_CONFERIR", message: "Não há transferência aguardando o banco pra conferir." },
        404,
      );
    }
    // Fura o backoff: a linha passa a ser elegível pra fila agora.
    await sbAdmin
      .from("payroll_pix_transfers")
      .update({ next_check_at: new Date().toISOString() })
      .eq("id", tr.id);

    const reconcileSecret = Deno.env.get("PIX_RECONCILE_SECRET") ?? "";
    let summary: unknown = null;
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/payroll-pix-reconcile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "x-reconcile-secret": reconcileSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      summary = await r.json().catch(() => null);
    } catch (_e) {
      return jsonResponse(
        { error: "CHECK_FALHOU", message: "Não deu pra conferir agora. Tenta de novo em instantes." },
        502,
      );
    }
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_checked",
      metadata: { entry_id: body.entry_id, transfer_id: tr.id },
      ip,
    });
    return jsonResponse({ ok: true, action: "check", summary }, 200);
  }

  // ── 6. Cancelar transferência travada ──────────────────────────────────────
  // Em produção só 'created' (nunca saiu ao banco) pode ser cancelado direto —
  // 'sent'/'confirmed' ainda podem liquidar, então a saída de lá é a resolução
  // humana da conferência. No sandbox libera 'sent'/'confirmed' também, porque o
  // mock nunca finaliza e a linha ficaria travada pra sempre no teste.
  if (body.action === "cancel") {
    const { data: tr } = await sbAdmin
      .from("payroll_pix_transfers")
      .select("id, status, environment")
      .eq("entry_id", body.entry_id)
      .in("status", ["created", "sent", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!tr) {
      return jsonResponse(
        { error: "NADA_A_CANCELAR", message: "Não há transferência em voo pra cancelar." },
        404,
      );
    }
    const cancellable = tr.status === "created" || tr.environment === "sandbox";
    if (!cancellable) {
      return jsonResponse(
        {
          error: "NAO_CANCELAVEL",
          message: "Essa transferência já saiu ao banco. Confira o estado — se ficar em dúvida, resolva pela conferência.",
        },
        409,
      );
    }
    const { error: failErr } = await sbAdmin.rpc("payroll_pix_fail", {
      p_id: tr.id,
      p_code: "CANCELADO_OPERADOR",
      p_msg: `Cancelado pelo operador${tr.environment === "sandbox" ? " (sandbox)" : ""}.`,
    });
    if (failErr) {
      return jsonResponse(
        { error: "CANCEL_FALHOU", message: failErr.message },
        400,
      );
    }
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_cancelled",
      metadata: { entry_id: body.entry_id, transfer_id: tr.id, status_before: tr.status },
      ip,
    });
    return jsonResponse({ ok: true, action: "cancel", status: "failed" }, 200);
  }

  // ── 7. Ação de pagamento ───────────────────────────────────────────────────
  if (body.action === "challenge") {
    // Sem WhatsApp não há como provar posse do aparelho — e pagamento sem
    // segundo fator não acontece neste sistema. Conferido antes de abrir a
    // transferência pra não deixar tentativa 'created' órfã travando o
    // lançamento.
    if (!evolutionUrl || !evolutionKey) {
      return jsonResponse(
        {
          error: "WHATSAPP_UNAVAILABLE",
          message: "O envio de código está indisponível. Fala com o admin.",
        },
        503,
      );
    }
    return await handleChallenge({
      sbAdmin,
      user,
      companyId,
      device,
      entryId: body.entry_id,
      environment,
      pepper,
      evolutionUrl,
      evolutionKey,
      ip,
    });
  }

  return await handleExecute({
    sbAdmin,
    user,
    companyId,
    device,
    body,
    pepper,
    gwUrl,
    gwSecret,
    ip,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Passo 1 — abre a transferência e dispara o código
// ─────────────────────────────────────────────────────────────────────────────

async function handleChallenge(ctx: {
  sbAdmin: Sb;
  user: Row;
  companyId: string;
  device: Row;
  entryId: string;
  environment: string;
  pepper: string;
  evolutionUrl: string;
  evolutionKey: string;
  ip: string | null;
}): Promise<Response> {
  const { sbAdmin, user, companyId, device, entryId, environment, pepper, ip } = ctx;

  // 5.1 Freio de máquina.
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recentCount } = await sbAdmin
    .from("payment_2fa_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("purpose", "payment")
    .gte("created_at", since);

  if ((recentCount ?? 0) >= RATE_MAX_CHALLENGES_PER_USER) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_rate_limited",
      metadata: { entry_id: entryId, window_minutes: RATE_WINDOW_MS / 60000 },
      ip,
    });
    return jsonResponse(
      {
        error: "TOO_MANY_REQUESTS",
        message: "Muitos códigos pedidos em pouco tempo. Espera alguns minutos.",
      },
      429,
    );
  }

  // 5.2 Abre (ou reaproveita) a transferência.
  // Aqui moram TODAS as validações de dinheiro: período aprovado pela diretoria,
  // pensão alimentícia, chave PIX válida, valor > 0, já-pago, já-em-voo. Elas
  // são de banco de propósito — validar de novo aqui seria criar uma segunda
  // verdade que um dia diverge da primeira.
  const { data: transfer, error: openErr } = await sbAdmin.rpc(
    "payroll_pix_open_transfer",
    { p_entry_id: entryId, p_actor: user.id, p_environment: environment },
  );

  if (openErr || !transfer) {
    // Mensagens dessas RPCs são escritas em pt-BR PARA o financeiro ler
    // ("a folha ainda não foi aprovada pela diretoria"). Repassar é o certo —
    // não é erro de provedor, é regra nossa. Só o que não for reconhecível cai
    // numa frase genérica.
    const msg = businessMessage(openErr);
    return jsonResponse({ error: "PAYMENT_BLOCKED", message: msg }, 409);
  }

  // Transferência já em voo não recebe código novo: 'sent'/'confirmed' já foram
  // pro banco e 'unknown' está esperando gente. Autorizar de novo em cima de
  // qualquer um desses é o caminho pro pagamento em dobro.
  if (transfer.status !== "created") {
    return jsonResponse(
      {
        error: "TRANSFER_IN_FLIGHT",
        status: transfer.status,
        transfer_id: transfer.id,
        message: transfer.status === "unknown"
          ? "Esse pagamento está em conferência com o banco. Não reenviamos — aguarda a resolução."
          : "Esse pagamento já foi enviado e está aguardando o banco.",
      },
      409,
    );
  }

  // 5.3 Reenvio da mesma transferência.
  const { count: transferChallenges } = await sbAdmin
    .from("payment_2fa_challenges")
    .select("id", { count: "exact", head: true })
    .eq("transfer_id", transfer.id)
    .eq("purpose", "payment");

  if ((transferChallenges ?? 0) >= MAX_CHALLENGES_PER_TRANSFER) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_rate_limited",
      metadata: { transfer_id: transfer.id, reason: "too_many_codes_same_transfer" },
      ip,
    });
    return jsonResponse(
      {
        error: "TOO_MANY_CODES",
        message: "Já mandamos código demais pra esse pagamento. Espera um pouco e recomeça.",
      },
      429,
    );
  }

  // 5.4 Instância de WhatsApp da empresa — buscada antes de gerar o código:
  // código gerado que ninguém recebe é só um hash esperando ser adivinhado.
  const { data: instance } = await sbAdmin
    .from("whatsapp_instances")
    .select("instance_name")
    .eq("company_id", companyId)
    .eq("status", "open")
    .maybeSingle();

  if (!instance) {
    return jsonResponse(
      {
        error: "WHATSAPP_UNAVAILABLE",
        message: "O WhatsApp da empresa está fora do ar. Sem ele não dá pra confirmar pagamento.",
      },
      503,
    );
  }

  // 5.5 Código.
  const code = generateNumericCode(6);
  const salt = randomHex(16);
  const codeHash = await hmacHex(pepper, `${salt}:${code}`);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  const { data: challenge, error: chErr } = await sbAdmin
    .from("payment_2fa_challenges")
    .insert({
      company_id: companyId,
      user_id: user.id,
      purpose: "payment",
      factor_type: "whatsapp",
      device_id: device.id,
      // O vínculo que impede um código de pagar outra coisa.
      transfer_id: transfer.id,
      salt,
      code_hash: codeHash,
      expires_at: expiresAt.toISOString(),
      sent_to_last4: device.phone_last4,
    })
    .select("id")
    .single();

  if (chErr || !challenge) {
    return jsonResponse(
      { error: "CHALLENGE_CREATE_FAILED", message: "Não deu pra gerar o código." },
      500,
    );
  }

  // 5.6 Envio. NOME DO FAVORECIDO E VALOR na mensagem, de propósito: é o que
  // transforma o 2FA de "prova que é você" em "prova que é ISSO". Um atacante
  // que consiga te ligar e pedir "o código que chegou agora" fracassa quando a
  // própria mensagem diz pra quem o dinheiro vai.
  const amount = Number(transfer.amount);
  const message =
    `*Código de pagamento: ${code}*\n\n` +
    `Confere antes de digitar:\n` +
    `• Favorecido: *${transfer.payee_name}*\n` +
    `• Valor: *${formatBRL(amount)}*\n` +
    `• Chave PIX: ${maskPixKey(transfer.payee_pix_key_norm, transfer.payee_pix_key_type)}\n\n` +
    `O código vale por 5 minutos e serve só pra ESTE pagamento.\n\n` +
    `_Se o nome ou o valor não batem com o que você está vendo na tela, NÃO use o código e avisa o RH._`;

  const baseUrl = ctx.evolutionUrl.replace(/\/$/, "");
  let sendOk = false;
  let sendDetails = "";
  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ctx.evolutionKey },
      body: JSON.stringify({ number: device.phone, text: message }),
    });
    sendOk = res.ok;
    if (!res.ok) sendDetails = String(res.status);
  } catch (e) {
    sendDetails = e instanceof Error ? e.name : "network_error";
  }

  if (!sendOk) {
    // Mata o desafio (expires_at no passado o torna inconsumível pela RPC sem
    // apagar a trilha). A TRANSFERÊNCIA fica de pé em 'created': ela não chamou
    // o banco, não custa nada, e o próximo clique em "Pagar" reaproveita a mesma
    // — payroll_pix_open_transfer devolve a que está em voo em vez de criar
    // outra. Abortá-la aqui é que seria errado: não temos RPC de cancelamento, e
    // inventar uma abriria caminho pra "cancelar" tentativa que já foi ao banco.
    await sbAdmin
      .from("payment_2fa_challenges")
      .update({ failed_at: new Date().toISOString(), expires_at: new Date().toISOString() })
      .eq("id", challenge.id);

    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_code_send_failed",
      metadata: { transfer_id: transfer.id, last4: device.phone_last4, details: sendDetails },
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
    kind: "payment_code_sent",
    metadata: {
      transfer_id: transfer.id,
      challenge_id: challenge.id,
      entry_id: entryId,
      last4: device.phone_last4,
    },
    ip,
  });

  // Resposta sem o código e sem a chave inteira. O `amount` e o `payee_name`
  // voltam pra que a tela mostre EXATAMENTE o que a mensagem do WhatsApp diz —
  // se divergirem, quem está vendo as duas coisas percebe.
  return jsonResponse({
    transfer_id: transfer.id,
    challenge_id: challenge.id,
    last4: device.phone_last4,
    expires_at: expiresAt.toISOString(),
    amount,
    payee_name: transfer.payee_name,
    payee_pix_key_masked: maskPixKey(
      transfer.payee_pix_key_norm,
      transfer.payee_pix_key_type,
    ),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 2 — consome o código e manda o dinheiro
// ─────────────────────────────────────────────────────────────────────────────

async function handleExecute(ctx: {
  sbAdmin: Sb;
  user: Row;
  companyId: string;
  device: Row;
  body: PayBody;
  pepper: string;
  gwUrl: string;
  gwSecret: string;
  ip: string | null;
}): Promise<Response> {
  const { sbAdmin, user, companyId, device, body, pepper, gwUrl, gwSecret, ip } = ctx;

  if (!body.challenge_id || !body.code) {
    return jsonResponse(
      { error: "BAD_REQUEST", message: "Manda { challenge_id, code } pra confirmar." },
      400,
    );
  }

  // 6.1 Desafio — checagens de VÍNCULO antes de tocar no código.
  const { data: challenge } = await sbAdmin
    .from("payment_2fa_challenges")
    .select("id, company_id, user_id, purpose, device_id, transfer_id, salt, max_attempts")
    .eq("id", body.challenge_id)
    .maybeSingle();

  // Desafio inexistente, de outra pessoa, de outro propósito, solto (sem
  // transferência) ou de um APARELHO que não é mais o ativo: tudo INVALID_CODE.
  // A checagem de aparelho fecha a janela da troca — um código que foi pro
  // celular antigo (revogado no enroll seguinte) não pode autorizar pagamento
  // depois, senão a janela anti-SIM-swap teria uma porta lateral.
  if (
    !challenge ||
    challenge.user_id !== user.id ||
    challenge.purpose !== "payment" ||
    !challenge.transfer_id ||
    (challenge.device_id && challenge.device_id !== device.id)
  ) {
    await logEvent(sbAdmin, {
      company_id: challenge?.company_id ?? companyId,
      user_id: user.id,
      kind: "payment_code_failed",
      metadata: { reason: "challenge_mismatch", entry_id: body.entry_id },
      ip,
    });
    return jsonResponse(GENERIC_INVALID, 400);
  }

  const { data: transfer } = await sbAdmin
    .from("payroll_pix_transfers")
    .select(
      "id, company_id, period_id, entry_id, collaborator_id, attempt, idempotency_key, amount, " +
        "payee_name, payee_document, payee_pix_key_norm, payee_pix_key_type, " +
        "payer_snapshot, environment, status, provider_payment_id",
    )
    .eq("id", challenge.transfer_id)
    .maybeSingle();

  // A TRAVA CENTRAL desta função: o código autoriza a transferência que ELE
  // criou, e essa transferência precisa ser a do lançamento pedido. Sem isso,
  // pedir código pra pagar R$ 50 e mandá-lo junto com o entry_id de R$ 50.000
  // seria uma autorização válida — o segundo fator provaria a pessoa, não o
  // pagamento. Mismatch é INVALID_CODE genérico: a resposta não confirma se o
  // desafio existia, se era daquele lançamento ou nada disso.
  if (!transfer || transfer.entry_id !== body.entry_id) {
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_code_failed",
      metadata: {
        reason: "transfer_entry_mismatch",
        challenge_id: challenge.id,
        entry_id: body.entry_id,
      },
      ip,
    });
    return jsonResponse(GENERIC_INVALID, 400);
  }

  if (transfer.status !== "created") {
    return jsonResponse(
      {
        error: "TRANSFER_IN_FLIGHT",
        status: transfer.status,
        message: transfer.status === "unknown"
          ? "Esse pagamento está em conferência com o banco. Não reenviamos."
          : "Esse pagamento já saiu daqui e está com o banco.",
      },
      409,
    );
  }

  // 6.2 Consumo atômico. Código malformado NÃO toma atalho: vira hash como
  // qualquer outro e gasta tentativa igual — atalho aqui seria oráculo de
  // formato.
  const code = String(body.code).replace(/\D/g, "");
  const codeHash = await hmacHex(pepper, `${challenge.salt}:${code}`);

  const { data: consumed, error: consumeErr } = await sbAdmin.rpc(
    "payment_2fa_consume_challenge",
    { p_id: challenge.id, p_code_hash: codeHash, p_purpose: "payment" },
  );

  if (consumeErr) {
    return jsonResponse(
      { error: "CONSUME_FAILED", message: "Não deu pra validar o código agora." },
      500,
    );
  }

  const consumedRow = Array.isArray(consumed) ? consumed[0] : consumed;
  if (!consumedRow) {
    // Errou/expirou/já usou. A RPC já gastou a tentativa; se esgotou, o aparelho
    // fica de castigo — é o que a coluna locked_until (20260818120300) esperava
    // do desafio de pagamento.
    const { data: after } = await sbAdmin
      .from("payment_2fa_challenges")
      .select("attempts, max_attempts")
      .eq("id", challenge.id)
      .maybeSingle();

    let locked = false;
    if (after && after.attempts >= after.max_attempts) {
      const lockedUntil = new Date(Date.now() + DEVICE_LOCK_MS).toISOString();
      await sbAdmin
        .from("payment_2fa_devices")
        .update({ locked_until: lockedUntil })
        .eq("id", device.id);
      locked = true;
    }

    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_code_failed",
      metadata: {
        reason: "invalid_or_expired",
        challenge_id: challenge.id,
        transfer_id: transfer.id,
        device_locked: locked,
      },
      ip,
    });
    return jsonResponse(GENERIC_INVALID, 400);
  }

  // Aparelho destravado a cada acerto: a trava é freio de força bruta, não
  // punição acumulada.
  if (device.locked_until) {
    await sbAdmin
      .from("payment_2fa_devices")
      .update({ locked_until: null })
      .eq("id", device.id);
  }

  // 6.3 Corpo do pagamento. Montado SÓ com o snapshot congelado na abertura da
  // transferência — nada vem do cliente, nada é relido de collaborators (se
  // alguém trocou a chave depois da aprovação, o dinheiro vai pra onde a
  // diretoria aprovou, e a divergência aparece na conferência).
  const { data: period } = await sbAdmin
    .from("payroll_periods")
    .select("reference_month")
    .eq("id", transfer.period_id)
    .maybeSingle();

  const amountStr = Number(transfer.amount).toFixed(2);
  const requestPayload = {
    transfer_id: transfer.id,
    // Viaja em tags[] e VOLTA em tags[] — é o que torna um 'unknown'
    // recuperável: sem ela, uma transferência sem provider_payment_id seria
    // impossível de achar no banco (ADR 0006).
    idempotency_key: transfer.idempotency_key,
    environment: transfer.environment,
    amount: amountStr,
    dict_code: transfer.payee_pix_key_norm,
    // O enum do nosso banco é minúsculo; o dictCodeType do Santander é MAIÚSCULO.
    dict_code_type: String(transfer.payee_pix_key_type).toUpperCase(),
    remittance_information: remittanceFor(period?.reference_month),
    payee: {
      name: transfer.payee_name,
      document: transfer.payee_document,
    },
    payer: transfer.payer_snapshot,
    tags: [transfer.idempotency_key],
  };

  // request_payload é o único campo que nenhuma RPC preenche, e é justamente o
  // que responde "o que exatamente a gente mandou?" numa contestação. Gravado
  // ANTES da chamada: se der timeout, ele já está lá.
  await sbAdmin
    .from("payroll_pix_transfers")
    .update({ request_payload: requestPayload })
    .eq("id", transfer.id);

  // ── 6.4 POST: cria o pagamento no banco (READY_TO_PAY). NÃO move dinheiro ──
  const post = await callGateway({
    url: `${gwUrl}/pix/transfer`,
    method: "POST",
    secret: gwSecret,
    body: requestPayload,
    timeoutMs: GW_TIMEOUT_SEND_MS,
  });

  if (post.kind === "unknown") {
    // Timeout/5xx no POST é o caso BARATO (o POST não move dinheiro), mas ainda
    // assim é dúvida: o pagamento pode ter sido criado do lado de lá. Reenviar
    // por conta própria criaria uma segunda ordem — quem resolve é a consulta
    // (payroll-pix-reconcile) ou uma pessoa.
    await markUnknown(sbAdmin, transfer.id, `POST /pix/transfer: ${post.reason}`);
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_unknown",
      metadata: { transfer_id: transfer.id, step: "send", reason: post.reason },
      ip,
    });
    return jsonResponse(
      {
        status: "unknown",
        transfer_id: transfer.id,
        message:
          "O banco não respondeu a tempo. NÃO reenviamos o pagamento — estamos conferindo e o resultado aparece aqui em alguns minutos.",
      },
      202,
    );
  }

  if (post.kind === "failed") {
    await sbAdmin.rpc("payroll_pix_fail", {
      p_id: transfer.id,
      p_code: post.code,
      p_msg: post.detail,
      p_response: post.raw ?? null,
      p_http_status: post.status,
    });
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_failed",
      metadata: { transfer_id: transfer.id, step: "send", code: post.code },
      ip,
    });
    return jsonResponse({
      status: "failed",
      transfer_id: transfer.id,
      message: "O banco recusou esse pagamento.",
      // Motivo do banco. Volta pro cliente porque quem executa o pagamento já
      // tem acesso à transferência pela RLS da tabela (é RH/admin) — não é
      // vazamento, é poupar uma ida ao registro pra descobrir POR QUE recusou.
      error_code: post.code,
      detail: post.detail,
    });
  }

  const providerPaymentId = pickString(post.data, [
    "provider_payment_id",
    "providerPaymentId",
    "id",
  ]);

  if (!providerPaymentId) {
    // 2xx sem id é resposta ambígua: pode ter criado lá e perdido o id aqui.
    // Ambiguidade tem um nome só neste sistema, e é 'unknown'.
    await markUnknown(
      sbAdmin,
      transfer.id,
      "POST /pix/transfer respondeu 2xx sem provider_payment_id",
    );
    return jsonResponse(
      {
        status: "unknown",
        transfer_id: transfer.id,
        message:
          "A resposta do banco veio incompleta. NÃO reenviamos — estamos conferindo.",
      },
      202,
    );
  }

  const { error: sentErr } = await sbAdmin.rpc("payroll_pix_mark_sent", {
    p_id: transfer.id,
    p_provider_payment_id: providerPaymentId,
    p_provider_status: pickString(post.data, ["status", "provider_status"]) ?? null,
    p_response: post.raw ?? null,
    p_http_status: post.status,
  });
  if (sentErr) {
    // Não conseguimos registrar que o POST foi aceito. O pagamento EXISTE no
    // banco em READY_TO_PAY e nosso registro está desalinhado: dúvida.
    await markUnknown(
      sbAdmin,
      transfer.id,
      "POST aceito mas payroll_pix_mark_sent falhou",
    );
    return jsonResponse(
      {
        status: "unknown",
        transfer_id: transfer.id,
        message: "Registramos uma inconsistência nesse pagamento. Não reenviamos — o financeiro vai conferir.",
      },
      202,
    );
  }

  // ── 6.5 PATCH: a confirmação. É AQUI que o dinheiro anda ────────────────────
  // PATCH e não PUT/DELETE: os outros verbos devolvem 502 no sandbox (ADR 0006).
  // O `amount` vai junto porque o Santander exige `paymentValue` na confirmação
  // (provado contra o sandbox: sem ele o PATCH devolve 400 "Valor do pagamento é
  // obrigatório"). O gateway o transforma em paymentValue; o status vem do env
  // do gateway. É o valor CONGELADO da transferência, não um que o cliente mande.
  const confirm = await callGateway({
    url: `${gwUrl}/pix/transfer/${encodeURIComponent(providerPaymentId)}/confirm`,
    method: "PATCH",
    secret: gwSecret,
    body: {
      transfer_id: transfer.id,
      idempotency_key: transfer.idempotency_key,
      amount: String(transfer.amount),
    },
    timeoutMs: GW_TIMEOUT_CONFIRM_MS,
  });

  if (confirm.kind === "unknown") {
    // O CASO CARO: a confirmação pode ter chegado e o dinheiro estar andando.
    // 'unknown' é a resposta honesta, e dela ninguém sai por reenvio.
    await markUnknown(sbAdmin, transfer.id, `PATCH confirm: ${confirm.reason}`);
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_unknown",
      metadata: { transfer_id: transfer.id, step: "confirm", reason: confirm.reason },
      ip,
    });
    return jsonResponse(
      {
        status: "unknown",
        transfer_id: transfer.id,
        message:
          "O banco não respondeu a tempo. NÃO reenviamos o pagamento — estamos conferindo e o resultado aparece aqui em alguns minutos.",
      },
      202,
    );
  }

  if (confirm.kind === "failed") {
    await sbAdmin.rpc("payroll_pix_fail", {
      p_id: transfer.id,
      p_code: confirm.code,
      p_msg: confirm.detail,
      p_response: confirm.raw ?? null,
      p_http_status: confirm.status,
    });
    await logEvent(sbAdmin, {
      company_id: companyId,
      user_id: user.id,
      kind: "payment_failed",
      metadata: { transfer_id: transfer.id, step: "confirm", code: confirm.code },
      ip,
    });
    return jsonResponse({
      status: "failed",
      transfer_id: transfer.id,
      message: "O banco recusou a confirmação do pagamento.",
      error_code: confirm.code,
      detail: confirm.detail,
    });
  }

  await sbAdmin.rpc("payroll_pix_confirm", {
    p_id: transfer.id,
    p_provider_status: pickString(confirm.data, ["status", "provider_status"]) ?? null,
    p_response: confirm.raw ?? null,
    p_http_status: confirm.status,
  });

  // 6.6 endToEnd na própria resposta = liquidação provada, sem esperar o poller.
  const endToEnd = extractEndToEnd(confirm.data);
  if (endToEnd) {
    const { error: settleErr } = await sbAdmin.rpc("payroll_pix_settle", {
      p_transfer_id: transfer.id,
      p_end_to_end_id: endToEnd,
      p_settled_at: new Date().toISOString(),
      p_response: confirm.raw ?? null,
    });
    if (!settleErr) {
      await logEvent(sbAdmin, {
        company_id: companyId,
        user_id: user.id,
        kind: "payment_settled",
        metadata: { transfer_id: transfer.id, entry_id: transfer.entry_id },
        ip,
      });
      return jsonResponse({
        status: "settled",
        transfer_id: transfer.id,
        end_to_end_id: endToEnd,
        message: "Pagamento concluído.",
      });
    }
    // Liquidou no banco mas a projeção falhou: NÃO viramos 'unknown' (o dinheiro
    // saiu, isso é fato). Fica 'confirmed' e a reconciliação fecha o ciclo.
  }

  await logEvent(sbAdmin, {
    company_id: companyId,
    user_id: user.id,
    kind: "payment_confirmed",
    metadata: { transfer_id: transfer.id, entry_id: transfer.entry_id },
    ip,
  });

  return jsonResponse({
    status: "confirmed",
    transfer_id: transfer.id,
    message: "Enviado. Aguardando a confirmação final do banco.",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate
// ─────────────────────────────────────────────────────────────────────────────

interface GateResult {
  ok: boolean;
  error?: string;
  message?: string;
  device?: Row;
}

async function checkPaymentGate(
  sbUser: Sb,
  sbAdmin: Sb,
  userId: string,
  companyId: string,
  requireDevice = true,
): Promise<GateResult> {
  // 1. PAPEL. Bem mais estreito que o resto da folha: rh e gestor_gc montam e
  //    conferem a folha, mas quem manda dinheiro embora é admin_gc ou diretoria.
  const { data: roles } = await sbUser.from("user_roles").select("role").eq("user_id", userId);
  const roleStrings = (roles ?? []).map((r: { role: string }) => String(r.role));
  const roleOk = roleStrings.some((r: string) =>
    ["admin_gc", "admin", "diretoria"].includes(r)
  );
  if (!roleOk) {
    return {
      ok: false,
      error: "FORBIDDEN_ROLE",
      message: "Só a diretoria e o admin de G&C podem executar pagamento.",
    };
  }

  // 2. MÓDULO, na empresa do lançamento. O papel é global; a permissão de
  //    módulo é por empresa — as duas juntas respondem "pode pagar AQUI".
  const { data: isCompanyAdmin } = await sbUser.rpc("is_company_admin", {
    _user_id: userId,
    _company_id: companyId,
  });
  let moduleOk = isCompanyAdmin === true;
  if (!moduleOk) {
    const { data: perms } = await sbUser.rpc("get_user_permissions", {
      _user_id: userId,
      _company_id: companyId,
      _module: "folha_pagamento_exec",
    });
    const first = Array.isArray(perms) ? perms[0] : perms;
    moduleOk = Boolean(first?.can_create);
  }
  if (!moduleOk) {
    return {
      ok: false,
      error: "FORBIDDEN_MODULE",
      message: "Você não tem permissão de executar pagamento nessa empresa.",
    };
  }

  // Conferir estado ou cancelar uma transferência travada não move dinheiro —
  // exige o mesmo papel+módulo de quem paga, mas NÃO o aparelho de 2FA. Sem essa
  // saída, o operador não conseguiria destravar um sandbox sem antes cadastrar o
  // celular de aprovação, que nada tem a ver com conferir/cancelar.
  if (!requireDevice) {
    return { ok: true };
  }

  // 3. APARELHO. O dispositivo é por PESSOA e global (uq_payment_2fa_devices_
  //    active_per_user) — por isso a busca não filtra empresa: filtrar acharia
  //    "nenhum aparelho" pra quem cadastrou pela matriz e está pagando na filial.
  const { data: device } = await sbAdmin
    .from("payment_2fa_devices")
    .select("id, phone, phone_last4, status, active_from, locked_until")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!device) {
    return {
      ok: false,
      error: "PAYMENT_2FA_REQUIRED",
      message: "Cadastra seu celular de aprovação antes de pagar.",
    };
  }

  const now = Date.now();
  // active_from no futuro = troca recente de aparelho. A janela anti-SIM-swap
  // existe pra que o dono legítimo tenha tempo de revogar; ignorá-la aqui seria
  // desligar a defesa exatamente no lugar onde ela importa.
  if (device.active_from && new Date(device.active_from).getTime() > now) {
    return {
      ok: false,
      error: "PAYMENT_2FA_COOLDOWN",
      message: "Seu celular de aprovação foi trocado há pouco. Ele libera pagamentos em até 1 hora.",
    };
  }
  if (device.locked_until && new Date(device.locked_until).getTime() > now) {
    return {
      ok: false,
      error: "PAYMENT_2FA_LOCKED",
      message: "Muitos códigos errados. Seu aparelho está bloqueado por alguns minutos.",
    };
  }

  return { ok: true, device };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway
// ─────────────────────────────────────────────────────────────────────────────

// CONTRATO COM O santander-gw (rede docker interna, sem Traefik):
//   POST   /pix/transfer                 → { provider_payment_id, status, raw }
//   PATCH  /pix/transfer/{id}/confirm    → { status, raw }
//   Header Authorization: Bearer ${SANTANDER_GW_SECRET}
// O gateway é quem tem o certificado mTLS, faz o cache do token de 900s e
// traduz nossos nomes (dict_code_type minúsculo→MAIÚSCULO, tags[], workspace).
// Esta function nunca fala com o Santander direto — ver ADR 0006.

type GwResult =
  // 2xx
  | { kind: "ok"; status: number; data: Record<string, unknown>; raw: unknown }
  // 4xx de negócio: sabemos que não saiu
  | { kind: "failed"; status: number; code: string; detail: string; raw: unknown }
  // timeout, rede, 5xx: NÃO sabemos
  | { kind: "unknown"; reason: string };

async function callGateway(args: {
  url: string;
  method: "POST" | "PATCH" | "GET";
  secret: string;
  body?: unknown;
  timeoutMs: number;
}): Promise<GwResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const res = await fetch(args.url, {
      method: args.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.secret}`,
      },
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Corpo não-JSON (HTML do Akamai, por exemplo). Guardamos como texto pra
      // não perder a pista, mas ele não vira dado estruturado.
      parsed = { non_json_body: text.slice(0, 2000) };
    }
    const data = (parsed && typeof parsed === "object" ? parsed : {}) as Record<
      string,
      unknown
    >;

    if (res.ok) return { kind: "ok", status: res.status, data, raw: parsed };

    // 408/429 são "tenta de novo depois" — o provedor não disse que recusou, só
    // que não atendeu. Junto com 5xx, é dúvida.
    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      return { kind: "unknown", reason: `HTTP ${res.status}` };
    }

    // 401/403 do GATEWAY (não do Santander) significam que a requisição parou
    // no nosso próprio serviço: nada foi enviado ao banco. É determinístico —
    // erro de configuração, mas com o dinheiro parado, que é o que importa aqui.
    const code = res.status === 401 || res.status === 403
      ? "GW_AUTH"
      : String(
        pickString(data, ["error_code", "errorCode", "code", "error"]) ??
          `HTTP_${res.status}`,
      );
    const detail = String(
      pickString(data, ["message", "detail", "error_description", "error"]) ??
        text.slice(0, 500),
    );
    return { kind: "failed", status: res.status, code, detail, raw: parsed };
  } catch (e) {
    // AbortError (timeout) e TypeError (rede/DNS) caem no mesmo lugar de
    // propósito: dos dois a gente sabe a MESMA coisa — nada.
    const reason = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "network_error";
    return { kind: "unknown", reason };
  } finally {
    clearTimeout(timer);
  }
}

async function markUnknown(sbAdmin: Sb, transferId: string, motivo: string) {
  // Erro aqui é engolido de propósito: já estamos no caminho de exceção, e uma
  // falha ao registrar a dúvida não pode virar um 500 que o cliente interprete
  // como "não aconteceu nada". A reconciliação ainda pega a linha pelo status.
  const { error } = await sbAdmin.rpc("payroll_pix_mark_unknown", {
    p_id: transferId,
    p_motivo: motivo.slice(0, 500),
  });
  if (error) {
    console.error("[payroll-pix-pay] mark_unknown falhou", {
      transfer_id: transferId,
      error: error.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCompanyId(
  sbAdmin: Sb,
  entryId: string,
): Promise<string | null> {
  const { data: line } = await sbAdmin
    .from("payroll_payable_lines")
    .select("company_id")
    .eq("entry_id", entryId)
    .maybeSingle();
  if (line?.company_id) return line.company_id;

  // Sem linha pagável a folha não está aprovada — mas ainda precisamos da
  // empresa pra aplicar o gate e devolver a mensagem certa (quem não pode pagar
  // recebe 403 antes de descobrir se a folha está aprovada).
  const { data: entry } = await sbAdmin
    .from("payroll_entries")
    .select("period_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry?.period_id) return null;

  const { data: period } = await sbAdmin
    .from("payroll_periods")
    .select("company_id")
    .eq("id", entry.period_id)
    .maybeSingle();
  return period?.company_id ?? null;
}

// Mensagens das RPCs de pagamento são escritas em pt-BR pro financeiro ler.
// Erro sem mensagem reconhecível (falha de conexão, permissão) vira frase
// genérica — não repassamos stack nem detalhe de banco.
function businessMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (msg && msg.length < 300 && !/permission denied|does not exist|syntax/i.test(msg)) {
    return msg;
  }
  return "Não deu pra iniciar esse pagamento agora. Confere a folha e tenta de novo.";
}

// remittanceInformation aparece pro FAVORECIDO no extrato dele. Curto e claro:
// "Folha 08/2026".
function remittanceFor(referenceMonth: string | null | undefined): string {
  if (!referenceMonth) return "Folha SoftHouse";
  const [y, m] = String(referenceMonth).split("-");
  if (!y || !m) return "Folha SoftHouse";
  return `Folha ${m}/${y}`;
}

// O endToEnd é o identificador do PIX no SPI — é o que prova a liquidação. Ele
// pode chegar em lugares diferentes conforme o gateway repassa a resposta do
// Santander (transaction.endToEnd é o do contrato do ADR).
function extractEndToEnd(data: Record<string, unknown>): string | null {
  const direct = pickString(data, ["end_to_end_id", "endToEnd", "endToEndId", "e2e"]);
  if (direct) return direct;
  const tx = data["transaction"];
  if (tx && typeof tx === "object") {
    const nested = pickString(tx as Record<string, unknown>, [
      "endToEnd",
      "endToEndId",
      "end_to_end_id",
    ]);
    if (nested) return nested;
  }
  const raw = data["raw"];
  if (raw && typeof raw === "object") {
    return extractEndToEnd(raw as Record<string, unknown>);
  }
  return null;
}

function pickString(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

// A chave mascarada é pra CONFERÊNCIA visual (tela e WhatsApp mostram a mesma
// coisa), não pra identificação. Documento e telefone mostram só o fim; e-mail
// mostra as pontas; EVP mostra o começo. Nunca a chave inteira: a mensagem de
// WhatsApp pode ficar na tela de bloqueio de um celular na mesa.
function maskPixKey(key: string | null, type: string | null): string {
  const k = String(key ?? "");
  if (!k) return "—";
  switch (String(type)) {
    case "cpf":
      return `***.${k.slice(3, 6)}.${k.slice(6, 9)}-**`;
    case "cnpj":
      return `**.${k.slice(2, 5)}.${k.slice(5, 8)}/****-**`;
    case "phone":
      return `••••${k.slice(-4)}`;
    case "email": {
      const [userPart, domain] = k.split("@");
      if (!domain) return `${k.slice(0, 2)}•••`;
      const head = userPart.slice(0, 2);
      return `${head}${"•".repeat(Math.max(1, userPart.length - 2))}@${domain}`;
    }
    default:
      return `${k.slice(0, 6)}…${k.slice(-4)}`;
  }
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Math.random() é previsível. CSPRNG + rejeição de módulo mantém os 1.000.000
// de códigos equiprováveis (um `% 1000000` cru enviesaria os primeiros).
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

// MESMA forma de hash do payment-2fa-enroll-start/confirm: HMAC-SHA256 com
// PAYMENT_2FA_PEPPER sobre `${salt}:${code}`. Se divergir, nenhum código
// funciona — e o pepper fora do banco é o que torna o dump inútil.
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
  sbAdmin: Sb,
  event: {
    company_id: string | null;
    user_id: string | null;
    kind: string;
    metadata: Record<string, unknown>;
    ip: string | null;
  },
): Promise<void> {
  // Trilha nunca derruba a operação — e nunca carrega código, telefone completo
  // nem chave PIX inteira.
  await sbAdmin.from("payment_2fa_events").insert(event);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
