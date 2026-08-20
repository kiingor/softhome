// Edge Function: payroll-pix-webhook
//
// Recebe o aviso do Santander de que um pagamento mudou de estado (o webhookURL
// do workspace aponta pra cá) e ACELERA a reconciliação — sem esperar o cron de
// 2 min. É a contrapartida do polling: quando chega, o resultado aparece na hora;
// quando não chega (rede, downtime), o polling continua de rede de segurança.
//
// ─────────────────────────────────────────────────────────────────────────────
// A GARANTIA CENTRAL: ESTE WEBHOOK NUNCA LIQUIDA PELO CORPO. NUNCA.
//
// Um webhook é uma chamada de FORA. Aceitar "status: PAYED" do corpo e liquidar
// a transferência seria deixar qualquer um que descubra a URL marcar um
// colaborador como "pago" — de forma PERMANENTE e FALSA (o trigger
// payroll_payments_guard proíbe desmarcar um PIX, nem com service_role) numa
// folha real. Então o corpo aqui é só uma DICA: extraímos o identificador,
// achamos a transferência em voo e disparamos o payroll-pix-reconcile, que
// pergunta ao banco e só liquida com IDENTIDADE PROVADA. O corpo do webhook não
// tem poder de decisão sobre dinheiro — só o GET verificado tem.
//
// Consequência boa: mesmo que a autenticação do webhook seja fraca (não sabemos
// o mecanismo exato do Santander ainda — hoje é um segredo compartilhado na URL/
// header), o pior que um webhook forjado consegue é disparar uma CONSULTA a mais.
// Nada liquida. A segurança do dinheiro não depende de confiar no chamador.
//
// ─────────────────────────────────────────────────────────────────────────────
// PÚBLICA: precisa estar em FUNCTIONS_PUBLICAS do dispatcher da VPS e com
// verify_jwt=false no config.toml — o Santander não manda JWT do Supabase. A
// tranca é o PIX_WEBHOOK_SECRET (header x-webhook-secret ou query ?token=),
// comparado em tempo constante.
//
// Deploy: npx supabase functions deploy payroll-pix-webhook
// Secrets: PIX_WEBHOOK_SECRET, PIX_RECONCILE_SECRET, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
type Sb = any;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("PIX_WEBHOOK_SECRET");
  const reconcileSecret = Deno.env.get("PIX_RECONCILE_SECRET");
  if (!webhookSecret || !reconcileSecret) {
    // Sem segredo configurado a function NÃO vira aberta: ela recusa.
    return jsonResponse({ error: "WEBHOOK_NOT_CONFIGURED" }, 500);
  }

  // ── Tranca: segredo no header ou na query, em tempo constante ──────────────
  const url = new URL(req.url);
  const provided = req.headers.get("x-webhook-secret") ??
    url.searchParams.get("token") ?? "";
  if (!timingSafeEqual(provided, webhookSecret)) {
    // Sem detalhe: quem chamou errado não aprende nada sobre o segredo.
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── Corpo (DICA, nunca decisão) ─────────────────────────────────────────────
  let payload: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
  } catch {
    // Corpo não-JSON: registra e devolve 200. Um 4xx faria o Santander reenviar
    // em loop por um corpo que a gente nunca vai conseguir parsear.
    console.warn("[payroll-pix-webhook] corpo não-JSON ignorado");
    return jsonResponse({ ok: true, ignored: "non_json_body" }, 200);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Identifica a transferência (por id do provedor, endToEnd ou chave) ─────
  const providerPaymentId = pickDeep(payload, [
    "id", "paymentId", "provider_payment_id", "providerPaymentId",
  ]);
  const endToEnd = pickDeep(payload, ["endToEnd", "endToEndId", "end_to_end_id", "e2e"]);
  const idempotencyKey = pickTag(payload);

  const transfer = await findTransfer(sbAdmin, {
    providerPaymentId,
    endToEnd,
    idempotencyKey,
  });

  if (!transfer) {
    // Não achamos a transferência (aviso de algo que não é nosso, ou tentativa
    // já resolvida). 200 pra não gerar reenvio; nada a fazer.
    console.info("[payroll-pix-webhook] sem transferência correspondente", {
      has_ppid: !!providerPaymentId,
      has_e2e: !!endToEnd,
      has_key: !!idempotencyKey,
    });
    return jsonResponse({ ok: true, matched: false }, 200);
  }

  // Só faz sentido cutucar o que está EM VOO. settled/failed já acabaram, e
  // 'created' nunca saiu ao banco (nada a consultar).
  if (!["sent", "confirmed", "unknown"].includes(transfer.status)) {
    return jsonResponse({ ok: true, matched: true, status: transfer.status, action: "noop" }, 200);
  }

  // Fura o backoff: a linha passa a ser elegível pra fila agora.
  await sbAdmin
    .from("payroll_pix_transfers")
    .update({ next_check_at: new Date().toISOString() })
    .eq("id", transfer.id);

  // Dispara a reconciliação — que é quem, com identidade provada, liquida ou
  // recusa. O webhook não decide o desfecho; só apressa a pergunta.
  let reconcileOk = false;
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
    reconcileOk = r.ok;
  } catch (_e) {
    // A reconciliação não rodou agora — tudo bem: o cron pega a linha no próximo
    // ciclo (já zeramos o next_check_at). O webhook cumpriu o papel de marcar.
    reconcileOk = false;
  }

  return jsonResponse(
    { ok: true, matched: true, transfer_id: transfer.id, reconcile_triggered: reconcileOk },
    200,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Busca da transferência
// ─────────────────────────────────────────────────────────────────────────────

async function findTransfer(
  sbAdmin: Sb,
  ids: { providerPaymentId: string | null; endToEnd: string | null; idempotencyKey: string | null },
): Promise<{ id: string; status: string } | null> {
  const cols = "id, status";

  if (ids.providerPaymentId) {
    const { data } = await sbAdmin
      .from("payroll_pix_transfers")
      .select(cols)
      .eq("provider_payment_id", ids.providerPaymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (ids.endToEnd) {
    const { data } = await sbAdmin
      .from("payroll_pix_transfers")
      .select(cols)
      .eq("end_to_end_id", ids.endToEnd)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (ids.idempotencyKey) {
    const { data } = await sbAdmin
      .from("payroll_pix_transfers")
      .select(cols)
      .eq("idempotency_key", ids.idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extração tolerante do payload (não sabemos o shape exato do Santander)
// ─────────────────────────────────────────────────────────────────────────────

// Profundidade máxima da recursão. O payload real é raso (raiz + 1-2 níveis); um
// corpo aninhado a milhares de níveis (que o JSON.parse iterativo do V8 aceita)
// estouraria a pilha do worker e viraria um 500 — e 500 faz o Santander reenviar
// em loop. O teto corta isso sem afetar payload legítimo.
const MAX_NEST_DEPTH = 6;
const CONTAINERS = ["data", "payment", "transaction", "raw", "resource"];

/** Procura uma das chaves na raiz e em `data`/`payment`/`transaction`/`raw`. */
function pickDeep(obj: Record<string, unknown>, keys: string[], depth = 0): string | null {
  const direct = pickString(obj, keys);
  if (direct) return direct;
  if (depth >= MAX_NEST_DEPTH) return null;
  for (const container of CONTAINERS) {
    const inner = obj[container];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const found = pickDeep(inner as Record<string, unknown>, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** A idempotency_key viaja em tags[] (é assim que a reconciliação a acha). Pega
 *  a primeira tag com a cara da nossa chave (sh-...). */
function pickTag(obj: Record<string, unknown>): string | null {
  const tags = findTags(obj);
  for (const t of tags) {
    const s = String(t).trim();
    if (/^sh-/.test(s)) return s;
  }
  // Sem prefixo reconhecível: se houver uma única tag, usa ela.
  return tags.length === 1 ? String(tags[0]).trim() : null;
}

function findTags(obj: Record<string, unknown>, depth = 0): unknown[] {
  if (Array.isArray(obj.tags)) return obj.tags;
  if (depth >= MAX_NEST_DEPTH) return [];
  for (const container of CONTAINERS) {
    const inner = obj[container];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const t = findTags(inner as Record<string, unknown>, depth + 1);
      if (t.length) return t;
    }
  }
  return [];
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

// Comparação de tamanho fixo — mesmo padrão da payroll-pix-reconcile.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ba.length === bb.length ? 0 : 1;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
