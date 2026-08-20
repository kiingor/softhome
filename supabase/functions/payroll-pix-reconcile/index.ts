// Edge Function: payroll-pix-reconcile
//
// Fecha o ciclo dos PIX que ficaram no meio do caminho. Roda de 2 em 2 minutos
// pelo pg_cron (docs/setup-cron-pix-reconcile.sql) e faz UMA coisa: PERGUNTA ao
// banco o que aconteceu com cada transferência em voo.
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTA FUNCTION NUNCA REENVIA PAGAMENTO. NUNCA.
//
// É a regra que organiza todo o resto do arquivo. Só existem chamadas GET aqui;
// não há POST nem PATCH em nenhum caminho, nem em caso de erro, nem depois de
// N tentativas. Uma transferência 'unknown' é "não sabemos se o dinheiro saiu"
// — reenviar em cima disso é apostar o dinheiro dos outros: se a primeira
// tentativa tinha vingado, a segunda paga o colaborador DUAS VEZES, e PIX não
// tem estorno unilateral. Errar pra "trava e chama gente" custa um pagamento
// atrasado; errar pra "tenta de novo" custa um pagamento que não volta.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE ELA FAZ
//   1. Pega até 20 transferências em ('sent','confirmed','unknown') com
//      next_check_at <= now(), uma de cada vez e sem pisar em outra execução.
//   2. Consulta o gateway: por provider_payment_id quando existe, senão por
//      idempotency_key no /pix/search (é pra isso que a chave viaja em tags[]).
//   3. Resultado TERMINAL e com IDENTIDADE PROVADA → settle (com endToEnd) ou
//      fail. Qualquer outra coisa → recalcula next_check_at com backoff.
//   4. Depois do último degrau (6h), PARA de consultar sozinha: next_check_at
//      vira NULL e a linha fica esperando resolução humana
//      (payroll_pix_resolve_unknown).
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE A IDENTIDADE DA RESPOSTA É CONFERIDA (e não só o status)
//
// O sandbox do Santander é um MOCK SEM ESTADO: duas chamadas ao mesmo GET
// devolvem ids diferentes (ADR 0006). Ou seja, ele responde "PAYED" sobre um
// pagamento que não é o nosso. Aceitar isso liquidaria a transferência, e o
// settle projeta em payroll_payments com method='pix_santander' — que o trigger
// payroll_payments_guard proíbe desmarcar, NEM COM service_role. Uma resposta
// de mock viraria um "pago" permanente e falso numa folha real.
//
// Por isso nada é liquidado sem que a resposta se identifique:
//   • consulta por id    → o id que voltou tem que ser o que perguntamos;
//   • consulta por busca → tags[] tem que conter a nossa idempotency_key.
// Sem identidade, o resultado é INCONCLUSIVO — recua e tenta de novo depois.
//
// ─────────────────────────────────────────────────────────────────────────────
// AUTH: header `x-reconcile-secret` comparado a PIX_RECONCILE_SECRET, em tempo
// constante. Não há usuário aqui — é o cron chamando. O verify_jwt segue no
// padrão (true), então o pg_net também manda Authorization: Bearer
// <SERVICE_ROLE_KEY>; o secret é a segunda tranca, e é ela que impede que
// qualquer portador de um JWT válido dispare a reconciliação.
//
// Deploy: npx supabase functions deploy payroll-pix-reconcile
// Secrets: PIX_RECONCILE_SECRET, SANTANDER_GW_URL (sandbox),
//          SANTANDER_GW_URL_PROD (produção), SANTANDER_GW_SECRET
// Gateway escolhido por linha (transfer.environment congelado).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  gwBaseUrl,
  getGatewayConfig,
  gwCredentialsHeader,
  type PixEnv,
} from "../_shared/pix-env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 20;

// Degraus do backoff, em segundos: 30s · 1m · 2m · 5m · 15m · 1h · 6h.
// Curto no começo (a maioria dos PIX liquida em segundos) e longo depois — se
// não resolveu em 15 min, não vai resolver em mais 15. Somados dão ~7h50 de
// acompanhamento automático; passou disso, o problema é de gente, não de
// polling.
const BACKOFF_STEPS_S = [30, 60, 120, 300, 900, 3600, 21600];

// Lease: o tempo que uma linha fica reservada pra esta execução. Se a function
// morrer no meio, a linha volta pra fila sozinha em 2 min — mesmo intervalo do
// cron, então não perde uma rodada.
const LEASE_MS = 2 * 60 * 1000;

const GW_TIMEOUT_MS = 15_000;

// Mesmo apelido de payroll-pix-pay: os types gerados do banco não entram no
// runtime das functions, então o cliente e as linhas andam sem tipo. Concentrar
// o `any` aqui evita espalhar deno-lint-ignore pelas assinaturas.
// deno-lint-ignore no-explicit-any
type Sb = any;
// deno-lint-ignore no-explicit-any
type Row = any;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const reconcileSecret = Deno.env.get("PIX_RECONCILE_SECRET");
  const gwSecret = Deno.env.get("SANTANDER_GW_SECRET");

  if (!reconcileSecret || !gwSecret) {
    // Sem secret configurado a function NÃO vira aberta: ela para. O gwUrl é
    // por-ambiente (escolhido por linha, pelo transfer.environment) — não dá
    // pra exigir uma URL única aqui.
    return jsonResponse({ error: "RECONCILE_NOT_CONFIGURED" }, 500);
  }

  const provided = req.headers.get("x-reconcile-secret") ?? "";
  if (!timingSafeEqual(provided, reconcileSecret)) {
    // Sem detalhe nenhum: quem chamou errado não aprende nada sobre o secret.
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const nowIso = new Date().toISOString();

  // ── 1. Fila ────────────────────────────────────────────────────────────────
  // 'created' fica DE FORA: quem está em 'created' nunca chamou o banco (nada
  // saiu, garantido) — não há o que reconciliar, e consultar por uma
  // idempotency_key que nunca foi enviada só gastaria chamada.
  const { data: candidates, error: queueErr } = await sbAdmin
    .from("payroll_pix_transfers")
    .select(
      "id, status, provider_payment_id, idempotency_key, check_count, next_check_at, " +
        "environment, amount, entry_id, company_id",
    )
    .in("status", ["sent", "confirmed", "unknown"])
    .not("next_check_at", "is", null)
    .lte("next_check_at", nowIso)
    .order("next_check_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queueErr) {
    console.error("[payroll-pix-reconcile] fila falhou", queueErr.message);
    return jsonResponse({ error: "QUEUE_FAILED" }, 500);
  }

  const summary = {
    picked: 0,
    settled: 0,
    failed: 0,
    rescheduled: 0,
    given_up: 0,
    inconclusive: 0,
    skipped: 0,
  };
  const details: Array<Record<string, unknown>> = [];

  for (const row of candidates ?? []) {
    // ── 2. Reserva (o equivalente ao FOR UPDATE SKIP LOCKED) ─────────────────
    // O PostgREST não expõe FOR UPDATE, mas o efeito que a gente precisa é o
    // mesmo: duas execuções concorrentes (cron atrasado + disparo manual) não
    // podem consultar e reagendar a MESMA linha. O UPDATE condicional resolve
    // isso pelo próprio Postgres: ele serializa as duas transações na linha, a
    // segunda reavalia o WHERE já com o next_check_at novo e não casa — 0
    // linhas, e a gente pula. É "skip locked" por comparação de valor.
    const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
    const { data: claimedRows } = await sbAdmin
      .from("payroll_pix_transfers")
      .update({ next_check_at: leaseUntil, last_checked_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("next_check_at", row.next_check_at)
      .in("status", ["sent", "confirmed", "unknown"])
      .select("id");

    if (!claimedRows || claimedRows.length === 0) {
      summary.skipped++;
      continue;
    }
    summary.picked++;

    // ── 3. Consulta (GET, sempre GET) ────────────────────────────────────────
    // Credenciais pelo AMBIENTE DA LINHA (congelado): um 'unknown' de produção só
    // se resolve consultando com a credencial de produção. Vão num header pro
    // gateway. Sem gateway/creds, o lookup falha e a linha reagenda — nunca uma
    // ação errada (settle exige endToEnd provado, que não vem de host errado).
    const rowCreds = await getGatewayConfig(sbAdmin, row.environment as PixEnv);
    const look = await lookup(gwBaseUrl(), gwSecret, row, gwCredentialsHeader(rowCreds));

    if (look.kind === "error") {
      // Não conseguimos falar com o gateway. Isso não diz NADA sobre o
      // pagamento — recua e volta no próximo degrau.
      const next = scheduleNext(row.check_count);
      await bumpCheck(sbAdmin, row.id, row.check_count, next);
      if (next === null) summary.given_up++;
      else summary.rescheduled++;
      details.push({ id: row.id, outcome: "gateway_unreachable", reason: look.reason });
      continue;
    }

    if (look.kind === "inconclusive") {
      const next = scheduleNext(row.check_count);
      await bumpCheck(sbAdmin, row.id, row.check_count, next);
      if (next === null) summary.given_up++;
      else summary.inconclusive++;
      details.push({ id: row.id, outcome: "inconclusive", reason: look.reason });
      continue;
    }

    // ── 4. Resultado terminal ────────────────────────────────────────────────
    const outcome = classify(look.status);

    // O sandbox do Santander é um mock sem estado: devolve ora PENDING_VALIDATION
    // (nunca finaliza), ora um endToEnd CANNED repetido que a constraint de
    // unicidade recusa — então na prática nenhuma transferência de teste liquida.
    // Pra o operador conseguir validar o fluxo inteiro, uma transferência
    // sandbox JÁ confirmada (o PATCH de confirmação passou) liquida aqui com um
    // endToEnd sintético e único, marcado como SANDBOX. Produção nunca entra
    // neste atalho: lá vale só o endToEnd real vindo do banco.
    const isSandbox = row.environment === "sandbox";
    const sandboxSettle = isSandbox &&
      (outcome === "settled" || row.status === "confirmed");

    if (outcome === "settled" || sandboxSettle) {
      const e2e = isSandbox
        ? `SANDBOX-${String(row.id).replace(/-/g, "")}`
        : look.endToEnd;
      if (!e2e) {
        // "Pago" sem endToEnd é boato: é o endToEnd que prova a liquidação no
        // SPI, e a própria CHECK da tabela recusaria. Volta pra fila.
        const next = scheduleNext(row.check_count);
        await bumpCheck(sbAdmin, row.id, row.check_count, next);
        if (next === null) summary.given_up++;
        else summary.inconclusive++;
        details.push({ id: row.id, outcome: "settled_without_e2e" });
        continue;
      }

      const { error: settleErr } = await sbAdmin.rpc("payroll_pix_settle", {
        p_transfer_id: row.id,
        p_end_to_end_id: e2e,
        p_settled_at: new Date().toISOString(),
        p_response: look.raw ?? null,
      });
      if (settleErr) {
        console.error("[payroll-pix-reconcile] settle falhou", {
          transfer_id: row.id,
          error: settleErr.message,
        });
        const next = scheduleNext(row.check_count);
        await bumpCheck(sbAdmin, row.id, row.check_count, next);
        summary.rescheduled++;
        details.push({ id: row.id, outcome: "settle_failed" });
        continue;
      }
      summary.settled++;
      details.push({ id: row.id, outcome: "settled" });
      continue;
    }

    if (outcome === "failed") {
      // 'unknown' NÃO vira 'failed' por conta de um GET. A saída da dúvida é
      // humana por definição (payroll_pix_resolve_unknown): a resposta pode ser
      // sobre outra tentativa, e marcar "não saiu" libera uma nova ordem de
      // pagamento — que é o caminho pro pagamento em dobro. Registramos a
      // leitura e deixamos pra pessoa.
      if (row.status === "unknown") {
        const next = scheduleNext(row.check_count);
        await bumpCheck(sbAdmin, row.id, row.check_count, next);
        if (next === null) summary.given_up++;
        else summary.rescheduled++;
        details.push({ id: row.id, outcome: "unknown_needs_human", provider_status: look.status });
        continue;
      }

      const { error: failErr } = await sbAdmin.rpc("payroll_pix_fail", {
        p_id: row.id,
        p_code: "PROVIDER_" + (look.status ?? "REJECTED").toUpperCase().slice(0, 40),
        p_msg: look.detail ?? "Recusa informada pelo banco na reconciliação",
        p_response: look.raw ?? null,
        p_http_status: null,
      });
      if (failErr) {
        const next = scheduleNext(row.check_count);
        await bumpCheck(sbAdmin, row.id, row.check_count, next);
        summary.rescheduled++;
        details.push({ id: row.id, outcome: "fail_rpc_failed" });
        continue;
      }
      summary.failed++;
      details.push({ id: row.id, outcome: "failed" });
      continue;
    }

    // Em trânsito (READY_TO_PAY, PENDING, PROCESSING…). Normal: volta depois.
    const next = scheduleNext(row.check_count);
    await bumpCheck(sbAdmin, row.id, row.check_count, next);
    if (next === null) summary.given_up++;
    else summary.rescheduled++;
    details.push({ id: row.id, outcome: "in_transit", provider_status: look.status });
  }

  return jsonResponse({ ok: true, checked_at: nowIso, ...summary, details });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consulta ao gateway
// ─────────────────────────────────────────────────────────────────────────────

// CONTRATO COM O santander-gw (rede docker interna):
//   GET /pix/transfer/{provider_payment_id}   → { status, raw, ... }
//   GET /pix/search?idempotency_key=...       → lista de pagamentos
//   Header Authorization: Bearer ${SANTANDER_GW_SECRET}
// Nenhum outro verbo é usado por esta function, e isso é proposital.

type Lookup =
  | { kind: "found"; status: string | null; endToEnd: string | null; detail: string | null; raw: unknown }
  | { kind: "inconclusive"; reason: string }
  | { kind: "error"; reason: string };

async function lookup(
  gwUrl: string,
  gwSecret: string,
  row: Row,
  credHeader: Record<string, string>,
): Promise<Lookup> {
  if (row.provider_payment_id) {
    const res = await gwGet(
      `${gwUrl}/pix/transfer/${encodeURIComponent(row.provider_payment_id)}`,
      gwSecret,
      credHeader,
    );
    if (res.kind === "error") return res;

    // 404 é ambíguo de propósito: pode ser "esse pagamento não existe" ou o
    // gateway/banco perdendo a referência temporariamente. Concluir "não saiu"
    // a partir de um 404 liberaria nova ordem de pagamento — não vale o risco.
    if (res.status === 404) {
      return { kind: "inconclusive", reason: "not_found" };
    }
    if (res.status >= 400) {
      return { kind: "inconclusive", reason: `HTTP ${res.status}` };
    }

    const payment = unwrapPayment(res.data);
    // IDENTIDADE: o mock do sandbox devolve id diferente a cada chamada. Se o
    // que voltou não é o que perguntamos, a resposta é sobre outro pagamento.
    const returnedId = pickString(payment, ["provider_payment_id", "providerPaymentId", "id"]);
    if (returnedId && returnedId !== row.provider_payment_id) {
      return { kind: "inconclusive", reason: "id_mismatch" };
    }
    return asFound(payment, res.data);
  }

  // Sem id do provedor: só a idempotency_key nos liga ao pagamento — ela viaja
  // em tags[] e volta em tags[] (ADR 0006). Este é exatamente o cenário que
  // torna um 'unknown' recuperável em vez de irrecuperável.
  const res = await gwGet(
    `${gwUrl}/pix/search?idempotency_key=${encodeURIComponent(row.idempotency_key)}`,
    gwSecret,
    credHeader,
  );
  if (res.kind === "error") return res;
  if (res.status >= 400) return { kind: "inconclusive", reason: `HTTP ${res.status}` };

  const items = asList(res.data);
  if (items.length === 0) {
    // Não achar não prova que não existe (o mock não guarda estado, e a busca
    // pode indexar com atraso). Inconclusivo.
    return { kind: "inconclusive", reason: "search_empty" };
  }

  // IDENTIDADE: aqui ela é obrigatória, sem exceção — a busca pode devolver
  // qualquer coisa, e só a tag com a nossa chave prova que o pagamento é o
  // nosso.
  const mine = items.find((it) => hasTag(it, row.idempotency_key));
  if (!mine) return { kind: "inconclusive", reason: "search_no_tag_match" };

  return asFound(mine, res.data);
}

function asFound(
  payment: Record<string, unknown>,
  raw: unknown,
): Lookup {
  return {
    kind: "found",
    status: pickString(payment, ["status", "provider_status", "providerStatus"]),
    endToEnd: extractEndToEnd(payment),
    detail: pickString(payment, ["message", "detail", "reason", "errorMessage"]),
    raw,
  };
}

type GwGet =
  | { kind: "ok"; status: number; data: Record<string, unknown> }
  | { kind: "error"; reason: string };

async function gwGet(
  url: string,
  secret: string,
  extraHeaders: Record<string, string> = {},
): Promise<GwGet> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GW_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json", ...extraHeaders },
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { non_json_body: text.slice(0, 2000) };
    }
    const data = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    return { kind: "ok", status: res.status, data };
  } catch (e) {
    const reason = e instanceof Error ? `${e.name}`.slice(0, 80) : "network_error";
    return { kind: "error", reason };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação e agenda
// ─────────────────────────────────────────────────────────────────────────────

// Os labels são do PROVEDOR e chegam crus — o enum nosso não copia os dele
// (ADR 0006 / 20260818120200). Lista fechada dos dois lados: um status novo e
// desconhecido do Santander NÃO cai em "recusado" por descuido, cai em
// "em trânsito" e volta pra fila.
function classify(providerStatus: string | null): "settled" | "failed" | "in_transit" {
  const s = String(providerStatus ?? "").trim().toUpperCase();
  if (["PAYED", "PAID", "SETTLED", "CONCLUDED", "COMPLETED", "EFETIVADO"].includes(s)) {
    return "settled";
  }
  if (
    ["REJECTED", "REJEITADO", "CANCELLED", "CANCELED", "CANCELADO", "DENIED", "FAILED", "ERROR", "EXPIRED"]
      .includes(s)
  ) {
    return "failed";
  }
  return "in_transit";
}

// Devolve o próximo instante de CONSULTA, ou null quando os degraus acabaram —
// e null quer dizer "para de perguntar sozinha", nunca "desiste do dinheiro":
// a linha continua em voo, visível pro financeiro, esperando
// payroll_pix_resolve_unknown.
function scheduleNext(checkCount: number): string | null {
  const idx = Math.max(0, checkCount ?? 0);
  if (idx >= BACKOFF_STEPS_S.length) return null;
  return new Date(Date.now() + BACKOFF_STEPS_S[idx] * 1000).toISOString();
}

async function bumpCheck(
  sbAdmin: Sb,
  id: string,
  currentCount: number,
  next: string | null,
): Promise<void> {
  // check_count é incrementado no cliente porque não há RPC de contador — e
  // aqui isso é seguro: a linha está reservada pelo lease, então ninguém mais
  // está mexendo nela nesta janela.
  await sbAdmin
    .from("payroll_pix_transfers")
    .update({
      check_count: (currentCount ?? 0) + 1,
      last_checked_at: new Date().toISOString(),
      next_check_at: next,
    })
    .eq("id", id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// O gateway pode devolver o pagamento na raiz ou embrulhado em `raw`/`payment`
// (o contrato de POST devolve { provider_payment_id, status, raw }).
function unwrapPayment(data: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...data };
  for (const key of ["raw", "payment", "data"]) {
    const inner = data[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      // A raiz vence: se o gateway já traduziu o status, é a tradução dele que
      // vale — o `raw` só preenche o que faltar.
      for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
        if (merged[k] === undefined) merged[k] = v;
      }
    }
  }
  return merged;
}

function asList(data: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  for (const key of ["results", "items", "payments", "data", "content"]) {
    const v = data[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  // Resposta única também serve.
  if (data && (data["id"] || data["status"] || data["tags"])) return [data];
  return [];
}

function hasTag(item: Record<string, unknown>, key: string): boolean {
  const tags = item["tags"] ?? (item["raw"] as Record<string, unknown> | undefined)?.["tags"];
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => String(t).trim() === key);
}

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
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
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

// Comparação de tamanho fixo: um `a === b` sai no primeiro byte diferente e,
// repetido, permite descobrir o secret byte a byte. O XOR acumulado percorre
// tudo sempre.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  // Comprimentos diferentes já reprovam, mas o laço roda mesmo assim pra não
  // transformar o tamanho num canal lateral mais barato ainda.
  let diff = ba.length === bb.length ? 0 : 1;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
