// Edge Function: payroll-pix-account
//
// Saldo e extrato da conta pagadora, lidos pelo santander-gw (que tem o mTLS).
// É SÓ LEITURA — não move dinheiro, não abre transferência, não tem 2FA. O que
// protege aqui é o gate de papel+módulo (o mesmo de quem paga, menos o
// dispositivo): saldo e extrato da empresa não são pra qualquer um do RH.
//
// ─────────────────────────────────────────────────────────────────────────────
// AÇÕES (body { action, company_id, ... }):
//   balance   → GET /account/balance no gateway
//   statement → GET /account/statement?initial_date=&final_date= (YYYY-MM-DD)
//   accounts  → GET /account/accounts (descobrir agência/conta na configuração)
//
// A conta é a CONFIGURADA no gateway (SANTANDER_DEBIT_BRANCH/_ACCOUNT). O cliente
// NÃO escolhe conta — company_id serve só pro gate de permissão. Assim ninguém
// aponta a leitura pra uma conta que não é da empresa dele.
//
// Deploy: npx supabase functions deploy payroll-pix-account
// verify_jwt: padrão (true) — leitura de conta não é pública.
// Secrets: SANTANDER_GW_URL (sandbox), SANTANDER_GW_URL_PROD (produção), SANTANDER_GW_SECRET
// O saldo/extrato seguem o AMBIENTE ATIVO (flag pix_environment_settings), pra a
// tela mostrar a conta de produção quando produção estiver ligada.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { activeEnvironment, gwUrlFor } from "../_shared/pix-env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GW_TIMEOUT_MS = 20_000;

// deno-lint-ignore no-explicit-any
type Sb = any;

interface AccountBody {
  action: "balance" | "statement" | "accounts";
  company_id: string;
  initial_date?: string;
  final_date?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const gwSecret = Deno.env.get("SANTANDER_GW_SECRET");
  if (!gwSecret) {
    // 200 com erro no corpo, não 5xx: o proxy (Cloudflare/envoy) troca respostas
    // 5xx por uma página sem CORS, e o navegador vê "Failed to send a request"
    // em vez da mensagem. Todo erro de gateway/banco sai como 200 { error } e o
    // unwrap do cliente lança a mensagem. (Auth/permissão seguem em 4xx — o proxy
    // repassa 4xx sem mexer.)
    return jsonResponse(
      { error: "ACCOUNT_NOT_CONFIGURED", message: "Consulta de conta indisponível. Fala com o admin." },
      200,
    );
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: "Invalid or expired token" }, 401);

  // ── Body ─────────────────────────────────────────────────────────────────
  let body: AccountBody;
  try {
    const raw = await req.json();
    const action = String(raw.action ?? "");
    if (!["balance", "statement", "accounts"].includes(action)) {
      throw new Error("action precisa ser 'balance', 'statement' ou 'accounts'");
    }
    body = {
      action: action as AccountBody["action"],
      company_id: String(raw.company_id ?? "").trim(),
      initial_date: raw.initial_date ? String(raw.initial_date) : undefined,
      final_date: raw.final_date ? String(raw.final_date) : undefined,
    };
    if (!body.company_id) throw new Error("company_id obrigatório");
  } catch (e) {
    return jsonResponse({ error: "BAD_REQUEST", message: (e as Error).message }, 400);
  }

  // ── Gate: papel + módulo (sem dispositivo — não move dinheiro) ────────────
  const gate = await checkReadGate(sbUser, user.id, body.company_id);
  if (!gate.ok) return jsonResponse({ error: gate.error, message: gate.message }, 403);

  // Gateway do ambiente ATIVO (a flag é global; sbUser lê pela RLS). Assim o
  // saldo/extrato mostra a conta de produção quando produção está ligada.
  const gwUrl = gwUrlFor(await activeEnvironment(sbUser));
  if (!gwUrl) {
    return jsonResponse(
      { error: "ACCOUNT_NOT_CONFIGURED", message: "Consulta de conta indisponível pra esse ambiente. Fala com o admin." },
      200,
    );
  }

  // ── Chamada ao gateway ─────────────────────────────────────────────────────
  let path: string;
  if (body.action === "balance") {
    path = "/account/balance";
  } else if (body.action === "accounts") {
    path = "/account/accounts";
  } else {
    // statement
    const from = (body.initial_date ?? "").trim();
    const to = (body.final_date ?? "").trim();
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      return jsonResponse(
        { error: "BAD_REQUEST", message: "Informe initial_date e final_date no formato YYYY-MM-DD." },
        400,
      );
    }
    path = `/account/statement?initial_date=${encodeURIComponent(from)}&final_date=${encodeURIComponent(to)}`;
  }

  const gw = await gwGet(`${gwUrl}${path}`, gwSecret);
  if (gw.kind === "error") {
    return jsonResponse(
      { error: "GATEWAY_UNREACHABLE", message: "Não deu pra falar com o banco agora. Tenta de novo em instantes." },
      200,
    );
  }
  if (gw.status >= 400) {
    // Erro do banco/gateway. Não repassa o corpo cru (pode conter dado de conta);
    // devolve uma frase e o status pra depuração. 200 de propósito — ver o
    // comentário no ACCOUNT_NOT_CONFIGURED (proxy engole 5xx).
    return jsonResponse(
      {
        error: "ACCOUNT_QUERY_FAILED",
        message: gw.status === 401 || gw.status === 403
          ? "O banco recusou a consulta de conta. Confere as credenciais/ambiente."
          : "O banco não conseguiu responder a consulta agora (indisponível neste ambiente).",
        provider_status: gw.status,
      },
      200,
    );
  }

  return jsonResponse({ ok: true, action: body.action, ...gw.data }, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate de leitura: papel restrito + módulo, na empresa pedida. Reusa a mesma
// regra da payroll-pix-pay (papel admin_gc/admin/diretoria E módulo
// folha_pagamento_exec), sem o dispositivo de 2FA — que só faz sentido pra quem
// MOVE dinheiro, não pra quem consulta.
// ─────────────────────────────────────────────────────────────────────────────

async function checkReadGate(
  sbUser: Sb,
  userId: string,
  companyId: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { data: roles } = await sbUser.from("user_roles").select("role").eq("user_id", userId);
  const roleStrings = (roles ?? []).map((r: { role: string }) => String(r.role));
  const roleOk = roleStrings.some((r: string) =>
    ["admin_gc", "admin", "diretoria"].includes(r)
  );
  if (!roleOk) {
    return {
      ok: false,
      error: "FORBIDDEN_ROLE",
      message: "Só a diretoria e o admin de G&C podem consultar a conta.",
    };
  }

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
      message: "Você não tem permissão de consultar a conta nessa empresa.",
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway
// ─────────────────────────────────────────────────────────────────────────────

type GwGet =
  | { kind: "ok"; status: number; data: Record<string, unknown> }
  | { kind: "error"; reason: string };

async function gwGet(url: string, secret: string): Promise<GwGet> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GW_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { non_json_body: text.slice(0, 500) };
    }
    const data = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    return { kind: "ok", status: res.status, data };
  } catch (e) {
    const reason = e instanceof Error ? e.name : "network_error";
    return { kind: "error", reason };
  } finally {
    clearTimeout(timer);
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
