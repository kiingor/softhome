// Edge Function: sync-stores
//
// Sincroniza empresas (tabela `stores`) com a API legada api.softcom.cloud.
// Estratégia espelho 100%: insere novos, atualiza existentes por
// external_id e marca como is_active=false quem sumiu da API. Detalhes em
// docs/adr/0005-integration-softcom-cloud.md.
//
// Body: { companyId: uuid }   — empresa-tenant (grupo Softcom) no SoftHouse
// Response:
//   { success, fetched, inserted, updated, deactivated }
//
// Permissão: admin da company OU permissão 'empresas:can_create'.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { isAgendaSyncDisabled, listEmpresasPdv, SoftcomCloudError } from "../_shared/softcom-cloud.ts";
import {
  composeAddress,
  resolveEmpresaName,
} from "../_shared/softcom-cloud-types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

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
  if (authErr || !user) return jsonResponse({ error: "Invalid token" }, 401);

  // Body
  let companyId: string;
  try {
    const body = await req.json();
    companyId = String(body.companyId ?? "").trim();
    if (!companyId) throw new Error("missing companyId");
  } catch (e) {
    return jsonResponse(
      { error: "Body deve ter { companyId }: " + (e as Error).message },
      400,
    );
  }

  // Permissão: admin OU empresas:can_create
  const allowed = await checkPermission(sbUser, user.id, companyId, "empresas");
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  // Kill-switch global da agenda: não puxa nada (mesmo shape pra UI não quebrar).
  if (isAgendaSyncDisabled()) {
    return jsonResponse({
      success: true,
      disabled: true,
      message: "Sincronização com a agenda desativada.",
      fetched: 0,
      inserted: 0,
      updated: 0,
      deactivated: 0,
    });
  }

  // Fetch da API legada
  let remote;
  try {
    remote = await listEmpresasPdv();
  } catch (err) {
    const status = err instanceof SoftcomCloudError ? err.status : 502;
    return jsonResponse(
      {
        error: "Falha ao ler Softcom Cloud",
        details: (err as Error).message,
      },
      status,
    );
  }
  if (!Array.isArray(remote)) {
    return jsonResponse({ error: "Softcom Cloud retornou payload inválido" }, 502);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Carrega stores existentes desta company com external_id preenchido
  const { data: existing, error: existErr } = await sbAdmin
    .from("stores")
    .select("id, external_id, is_active")
    .eq("company_id", companyId)
    .not("external_id", "is", null);
  if (existErr) {
    return jsonResponse(
      { error: "Falha lendo stores locais", details: existErr.message },
      500,
    );
  }

  const existingByExt = new Map<string, { id: string; is_active: boolean }>(
    (existing ?? []).map((s) => [
      s.external_id as string,
      { id: s.id as string, is_active: s.is_active as boolean },
    ]),
  );
  const remoteExtIds = new Set(remote.map((r) => String(r.id)));

  // Diff. API legada não expõe campo "ativo" no PDV (primeAtivo é flag de
  // plano, não status operacional); usamos is_active=true em tudo que veio
  // e deixamos a etapa de desativação cuidar de quem sumiu.
  const rowsToUpsert = remote.map((r) => ({
    company_id: companyId,
    external_id: String(r.id),
    store_name: resolveEmpresaName(r),
    cnpj: r.cnpj ?? null,
    address: composeAddress(r),
    is_active: true,
  }));

  const idsToDeactivate = (existing ?? [])
    .filter(
      (s) => !remoteExtIds.has(s.external_id as string) && s.is_active === true,
    )
    .map((s) => s.id as string);

  // Upsert
  let inserted = 0;
  let updated = 0;
  if (rowsToUpsert.length > 0) {
    const { data: upsertData, error: upErr } = await sbAdmin
      .from("stores")
      .upsert(rowsToUpsert, {
        onConflict: "company_id,external_id",
        ignoreDuplicates: false,
      })
      .select("external_id");
    if (upErr) {
      return jsonResponse(
        { error: "Upsert falhou", details: upErr.message },
        500,
      );
    }
    for (const row of upsertData ?? []) {
      if (existingByExt.has(row.external_id as string)) updated++;
      else inserted++;
    }
  }

  // Desativar os que sumiram
  let deactivated = 0;
  if (idsToDeactivate.length > 0) {
    const { error: deactErr } = await sbAdmin
      .from("stores")
      .update({ is_active: false })
      .in("id", idsToDeactivate);
    if (deactErr) {
      return jsonResponse(
        { error: "Desativação falhou", details: deactErr.message },
        500,
      );
    }
    deactivated = idsToDeactivate.length;
  }

  return jsonResponse({
    success: true,
    fetched: remote.length,
    inserted,
    updated,
    deactivated,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function checkPermission(
  // deno-lint-ignore no-explicit-any
  sbUser: any,
  userId: string,
  companyId: string,
  module: string,
): Promise<boolean> {
  const { data: isAdmin } = await sbUser.rpc("is_company_admin", {
    _user_id: userId,
    _company_id: companyId,
  });
  if (isAdmin === true) return true;

  const { data: perms } = await sbUser.rpc("get_user_permissions", {
    _user_id: userId,
    _company_id: companyId,
    _module: module,
  });
  const first = Array.isArray(perms) ? perms[0] : perms;
  return Boolean(first?.can_create);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
