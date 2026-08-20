// Edge Function: payroll-pix-voucher
//
// Comprovante (recibo) de um PIX já LIQUIDADO, via santander-gw. É reemissão de
// documento — SÓ LEITURA, não move dinheiro. Fluxo assíncrono do Santander
// (Consult Payment Receipts), orquestrado aqui porque é a edge que tem a data, o
// valor e o beneficiário da transferência pra CASAR o comprovante:
//
//   1. lista comprovantes do dia da liquidação (± 1 dia, no fuso de São Paulo),
//      categoria PIX, filtrando pelo documento do beneficiário quando ele é
//      válido (11/14 dígitos);
//   2. casa pelo VALOR (centavo a centavo) + beneficiário → paymentId;
//   3. POST cria o pedido de arquivo (assíncrono) → requestId;
//   4. poll até o PDF ficar AVAILABLE → devolve a location.
//
// UMA AÇÃO SÓ ('start'). O cliente manda APENAS transfer_id — nunca payment_id
// nem request_id. O paymentId é sempre DERIVADO da transferência já autorizada
// pelo gate, então não há como pedir o comprovante de outra empresa passando um
// id de fora (era um vazamento cross-CNPJ que a revisão pegou). Se o PDF não sair
// no poll do servidor, respondemos 'pending' e o cliente chama 'start' de novo —
// idempotente: rederiva o paymentId e refaz o pedido.
//
// SEM SANDBOX: a API de comprovante só existe em trust-open/-h. Com credencial de
// sandbox isto provavelmente responde 401/403 até a virada de produção — o
// recurso foi montado agora e será exercitado de verdade na produção.
//
// Deploy: npx supabase functions deploy payroll-pix-voucher
// verify_jwt: padrão (true) — comprovante não é público.
// Secrets: SANTANDER_GW_URL (sandbox), SANTANDER_GW_URL_PROD (produção), SANTANDER_GW_SECRET
// O gateway é escolhido pelo transfer.environment (o recibo de um PIX de produção
// só existe no host de produção).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { gwUrlFor, type PixEnv } from "../_shared/pix-env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GW_TIMEOUT_MS = 25_000;
// Poll do lado do servidor: o PDF costuma sair rápido. Se não sair, o cliente
// chama 'start' de novo. Nunca segura a function além do timeout dela.
const POLL_TRIES = 4;
const POLL_DELAY_MS = 1800;

// deno-lint-ignore no-explicit-any
type Sb = any;
// deno-lint-ignore no-explicit-any
type Row = any;

interface VoucherBody {
  transfer_id: string;
}

// Resposta única de "não encontrada" — usada tanto pra transferência inexistente
// quanto pra sem-permissão, pra não virar um oráculo de existência (a revisão
// pegou o 404-vs-403 distinguindo ids válidos).
const NOT_FOUND = { error: "TRANSFER_NOT_FOUND", message: "Transferência não encontrada." };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const gwSecret = Deno.env.get("SANTANDER_GW_SECRET");
  if (!gwSecret) {
    // 200 com erro no corpo, não 5xx: o proxy troca 5xx por página sem CORS e o
    // cliente vê "Failed to send a request" em vez da mensagem. O unwrap lança a
    // mensagem a partir do corpo 200. (4xx de auth/permissão seguem como estão.)
    return jsonResponse(
      { error: "VOUCHER_NOT_CONFIGURED", message: "Comprovante indisponível. Fala com o admin." },
      200,
    );
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: "Invalid or expired token" }, 401);

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Body ─────────────────────────────────────────────────────────────────
  let body: VoucherBody;
  try {
    const raw = await req.json();
    body = { transfer_id: String(raw.transfer_id ?? "").trim() };
    if (!body.transfer_id) throw new Error("transfer_id obrigatório");
  } catch (e) {
    return jsonResponse({ error: "BAD_REQUEST", message: (e as Error).message }, 400);
  }

  // ── Transferência (fonte da verdade do que pode gerar comprovante) ────────
  const { data: transfer } = await sbAdmin
    .from("payroll_pix_transfers")
    .select("id, company_id, status, amount, settled_at, payee_name, payee_document, environment")
    .eq("id", body.transfer_id)
    .maybeSingle();

  // ── Gate: papel + módulo na empresa da transferência ──────────────────────
  // Transferência inexistente OU sem permissão devolvem a MESMA coisa (404), pra
  // não revelar quais ids existem a quem não pode vê-los.
  if (!transfer) return jsonResponse(NOT_FOUND, 404);
  const gate = await checkReadGate(sbUser, user.id, transfer.company_id);
  if (!gate.ok) return jsonResponse(NOT_FOUND, 404);

  // Comprovante só existe pra pagamento que de fato saiu.
  if (transfer.status !== "settled") {
    return jsonResponse(
      { error: "NOT_SETTLED", message: "O comprovante só fica disponível depois que o PIX é liquidado." },
      409,
    );
  }
  if (!transfer.settled_at) {
    return jsonResponse({ error: "NO_SETTLE_DATE", message: "Sem data de liquidação registrada." }, 409);
  }

  // O comprovante fala com o gateway do AMBIENTE DA TRANSFERÊNCIA (congelado):
  // um PIX liquidado em produção só tem recibo no host de produção.
  const gwUrl = gwUrlFor(transfer.environment as PixEnv);
  if (!gwUrl) {
    return jsonResponse(
      { error: "VOUCHER_NOT_CONFIGURED", message: "Comprovante indisponível pra esse ambiente. Fala com o admin." },
      200,
    );
  }

  // ── 1. Acha o comprovante (paymentId) SEMPRE a partir da transferência ────
  const resolved = await resolveReceipt(transfer, gwUrl, gwSecret);
  if (resolved.kind === "gateway_error") {
    return jsonResponse({ error: "GATEWAY_UNREACHABLE", message: gwErrorMessage(resolved.status) }, 200);
  }
  if (resolved.kind === "not_found") {
    return jsonResponse(
      {
        error: "RECEIPT_NOT_FOUND",
        message: "Não achei o comprovante desse pagamento no banco ainda. Pode levar um tempo pra ficar disponível.",
      },
      404,
    );
  }
  if (resolved.kind === "ambiguous") {
    // Mais de um comprovante bate com valor + beneficiário: não escolhemos por
    // conta própria (poderia ser a pessoa errada). Melhor um erro claro.
    return jsonResponse(
      {
        error: "RECEIPT_AMBIGUOUS",
        message: "Há mais de um pagamento igual nesse dia e não dá pra distinguir o comprovante com segurança. Confere no banco.",
      },
      409,
    );
  }

  const paymentId = resolved.paymentId;
  const { ym: month } = spDateParts(new Date(transfer.settled_at));

  // ── 2. Cria o pedido de arquivo (assíncrono) ───────────────────────────────
  const created = await gwPost(
    `${gwUrl}/receipts/${encodeURIComponent(paymentId)}/file_requests`,
    gwSecret,
    { request_value_date: month },
  );
  if (created.kind === "error") {
    return jsonResponse({ error: "GATEWAY_UNREACHABLE", message: gwErrorMessage(null) }, 200);
  }
  if (created.status >= 400) {
    return jsonResponse({ error: "VOUCHER_CREATE_FAILED", message: gwErrorMessage(created.status) }, 200);
  }

  const requestId = String((created.data as Record<string, unknown>).requestId ?? "");
  if (!requestId) {
    return jsonResponse({ error: "VOUCHER_NO_REQUEST_ID", message: "O banco não devolveu o id do pedido." }, 200);
  }

  // ── 3. Poll curto: talvez já esteja pronto ─────────────────────────────────
  let last = fileResult(created.data);
  for (let i = 0; i < POLL_TRIES && last.status !== "available"; i++) {
    await sleep(POLL_DELAY_MS);
    const file = await gwGet(
      `${gwUrl}/receipts/${encodeURIComponent(paymentId)}/file_requests/${encodeURIComponent(requestId)}`,
      gwSecret,
    );
    if (file.kind === "ok" && file.status < 400) last = fileResult(file.data);
  }
  return jsonResponse(last, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Acha o comprovante da transferência
//
// Sinais disponíveis na LISTAGEM do banco: valor, nome do favorecido, categoria,
// e o filtro server-side por beneficiary_document (que filtra mas NÃO ecoa o
// documento, então não dá pra reconferir o doc na resposta — nem o endToEnd, que
// a listagem não devolve). A regra:
//   • documento VÁLIDO (11/14) → confia no filtro do banco + casa por centavos;
//   • documento ausente/inválido → casa por centavos + nome EXATO (normalizado).
// Mais de um candidato → 'ambiguous' (nunca escolhe o primeiro no escuro).
// ─────────────────────────────────────────────────────────────────────────────

type ResolveResult =
  | { kind: "ok"; paymentId: string }
  | { kind: "not_found" }
  | { kind: "ambiguous" }
  | { kind: "gateway_error"; status: number | null };

async function resolveReceipt(
  transfer: Row,
  gwUrl: string,
  gwSecret: string,
): Promise<ResolveResult> {
  const settled = new Date(transfer.settled_at);
  const { ymd: settledYmd } = spDateParts(settled);
  const start = shiftYmd(settledYmd, -1);
  const end = shiftYmd(settledYmd, 1);

  const doc = onlyDigits(String(transfer.payee_document ?? ""));
  const docValid = doc.length === 11 || doc.length === 14;
  const docParam = docValid ? `&beneficiary_document=${encodeURIComponent(doc)}` : "";

  const listRes = await gwGet(
    `${gwUrl}/receipts?start_date=${start}&end_date=${end}&category=PIX${docParam}`,
    gwSecret,
  );
  if (listRes.kind === "error") return { kind: "gateway_error", status: null };
  if (listRes.status >= 400) return { kind: "gateway_error", status: listRes.status };

  const receipts: Row[] = Array.isArray((listRes.data as Record<string, unknown>).receipts)
    ? (listRes.data as { receipts: Row[] }).receipts
    : [];

  const wantCents = parseCents(transfer.amount);
  const wantName = normalize(String(transfer.payee_name ?? ""));

  const candidates = receipts.filter((r) => {
    const cents = parseCents(r.amount);
    if (cents === null || wantCents === null || cents !== wantCents) return false;
    // Só confia no filtro de documento quando ELE foi de fato enviado (docParam).
    // Documento inválido/ausente cai no nome EXATO — nunca em "só o valor".
    if (docParam) return true;
    const name = normalize(String(r.payeeName ?? ""));
    return !!name && !!wantName && name === wantName;
  });

  if (candidates.length === 0) return { kind: "not_found" };
  if (candidates.length > 1) {
    // Dedup por paymentId: o mesmo comprovante repetido não é ambiguidade.
    const ids = new Set(candidates.map((c) => String(c.paymentId ?? "")));
    ids.delete("");
    if (ids.size > 1) return { kind: "ambiguous" };
  }

  const paymentId = String(candidates[0].paymentId ?? "");
  if (!paymentId) return { kind: "not_found" };
  return { kind: "ok", paymentId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado do arquivo
// ─────────────────────────────────────────────────────────────────────────────

function fileResult(data: Record<string, unknown>) {
  const statusCode = String(data.statusCode ?? "").toUpperCase();
  const location = typeof data.location === "string" && data.location ? data.location : null;
  const available = statusCode === "AVAILABLE" && !!location;
  return {
    ok: true,
    status: available ? "available" : "pending",
    location: available ? location : null,
    mime_type: typeof data.mimeType === "string" ? data.mimeType : null,
    expiration_date: typeof data.expirationDate === "string" ? data.expirationDate : null,
    provider_status: statusCode || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate (igual ao da payroll-pix-account): papel + módulo, sem dispositivo.
// ─────────────────────────────────────────────────────────────────────────────

async function checkReadGate(
  sbUser: Sb,
  userId: string,
  companyId: string,
): Promise<{ ok: boolean }> {
  const { data: roles } = await sbUser.from("user_roles").select("role").eq("user_id", userId);
  const roleStrings = (roles ?? []).map((r: { role: string }) => String(r.role));
  const roleOk = roleStrings.some((r: string) =>
    ["admin_gc", "admin", "diretoria"].includes(r)
  );
  if (!roleOk) return { ok: false };

  const { data: isCompanyAdmin } = await sbUser.rpc("is_company_admin", {
    _user_id: userId,
    _company_id: companyId,
  });
  if (isCompanyAdmin === true) return { ok: true };

  const { data: perms } = await sbUser.rpc("get_user_permissions", {
    _user_id: userId,
    _company_id: companyId,
    _module: "folha_pagamento_exec",
  });
  const first = Array.isArray(perms) ? perms[0] : perms;
  return { ok: Boolean(first?.can_create) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway + helpers
// ─────────────────────────────────────────────────────────────────────────────

type Gw =
  | { kind: "ok"; status: number; data: Record<string, unknown> }
  | { kind: "error"; reason: string };

async function gwGet(url: string, secret: string): Promise<Gw> {
  return await gwCall("GET", url, secret);
}
async function gwPost(url: string, secret: string, body: unknown): Promise<Gw> {
  return await gwCall("POST", url, secret, body);
}

async function gwCall(
  method: "GET" | "POST",
  url: string,
  secret: string,
  body?: unknown,
): Promise<Gw> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GW_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
    return { kind: "error", reason: e instanceof Error ? e.name : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

function gwErrorMessage(status: number | null): string {
  if (status === 401 || status === 403) {
    return "O banco recusou a consulta de comprovante (credenciais/ambiente). Em sandbox essa API não existe — só vale em produção.";
  }
  return "Não deu pra falar com o banco pra emitir o comprovante agora. Tenta de novo em instantes.";
}

function onlyDigits(v: string): string {
  return v.replace(/\D+/g, "");
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Valor → centavos inteiros. Aceita número (99.99), string com ponto decimal
 *  ("99.99"/"1234.56") e string pt-BR com milhar e vírgula ("1.234,56"). */
function parseCents(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Data-valor do PIX é BRT; o edge roda em UTC. Componentes no fuso de São Paulo
 *  pra a janela de datas e o mês do request_value_date não virarem na meia-noite. */
function spDateParts(d: Date): { ymd: string; ym: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year"), m = get("month"), day = get("day");
  return { ymd: `${y}-${m}-${day}`, ym: `${y}-${m}` };
}

/** Soma dias a uma data YYYY-MM-DD usando aritmética UTC (data pura, sem hora),
 *  então não sofre com fuso nem horário de verão. */
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${
    String(dt.getUTCDate()).padStart(2, "0")
  }`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
