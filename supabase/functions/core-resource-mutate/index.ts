// Edge Function: core-resource-mutate
//
// CRUD bidirecional pra `stores`, `teams`, `positions` — espelha a mutação
// local na API legada softcom.cloud (PUSH on WRITE). Substitui as chamadas
// supabase.from('stores').insert(...) etc. das páginas Empresas/Setores/Cargos.
//
// Body: {
//   resource: 'stores' | 'teams' | 'positions',
//   action: 'create' | 'update' | 'delete',
//   companyId: uuid,
//   id?: uuid (obrigatório em update/delete),
//   data?: {<campos>}, (em create/update)
//   syncToRemote?: boolean (default true)
// }
//
// Response: { success, localId?, remote? }
//
// Padrão de auth/permissão idêntico a collaborator-update:
//   - Token JWT do user → user.id
//   - user precisa ter is_company_admin OU permissão `can_create/can_edit/can_delete`
//     no módulo (empresas/setores/cargos)
//   - Service role escreve direto na tabela (bypass RLS)
//
// Quando sync falha na agenda, NÃO grava local (consistência > tolerância).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  isAgendaSyncDisabled,
  SoftcomCloudError,
  createEmpresaPdv,
  updateEmpresaPdv,
  deleteEmpresaPdv,
  createSetor,
  updateSetor,
  deleteSetor,
  createCargo,
  updateCargo,
  deleteCargo,
} from "../_shared/softcom-cloud.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Resource = "stores" | "teams" | "positions";
type Action = "create" | "update" | "delete";

interface Body {
  resource: Resource;
  action: Action;
  companyId: string;
  id?: string;
  data?: Record<string, unknown>;
  syncToRemote?: boolean;
}

const MODULE_BY_RESOURCE: Record<Resource, string> = {
  stores: "empresas",
  teams: "setores",
  positions: "cargos",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: "Invalid token" }, 401);

  let body: Body;
  try {
    const raw = await req.json();
    body = {
      resource: raw.resource,
      action: raw.action,
      companyId: String(raw.companyId ?? "").trim(),
      id: raw.id ? String(raw.id) : undefined,
      data: raw.data ?? undefined,
      syncToRemote: typeof raw.syncToRemote === "boolean" ? raw.syncToRemote : true,
    };
    if (!["stores", "teams", "positions"].includes(body.resource)) {
      throw new Error("resource inválido (stores | teams | positions)");
    }
    if (!["create", "update", "delete"].includes(body.action)) {
      throw new Error("action inválido (create | update | delete)");
    }
    if (!body.companyId) throw new Error("missing companyId");
    if ((body.action === "update" || body.action === "delete") && !body.id) {
      throw new Error("id obrigatório em update/delete");
    }
    if ((body.action === "create" || body.action === "update") && !body.data) {
      throw new Error("data obrigatório em create/update");
    }
  } catch (e) {
    return jsonResponse({ error: "Body inválido: " + (e as Error).message }, 400);
  }

  // Kill-switch global da agenda: pula o PUSH remoto. Create grava
  // external_id=null (fallback abaixo); update/delete locais independem do remoto.
  if (isAgendaSyncDisabled()) body.syncToRemote = false;

  // Permissão por módulo + ação
  const module = MODULE_BY_RESOURCE[body.resource];
  const allowed = await checkPermission(sbUser, user.id, body.companyId, module, body.action);
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Carrega external_id do row local (em update/delete) pra mandar pra agenda
  let externalId: string | null = null;
  if (body.action === "update" || body.action === "delete") {
    const { data: row, error } = await sbAdmin
      .from(body.resource)
      .select("id, external_id, company_id")
      .eq("id", body.id!)
      .single();
    if (error || !row) {
      return jsonResponse({ error: `${body.resource} não encontrado` }, 404);
    }
    if (row.company_id !== body.companyId) {
      return jsonResponse({ error: "Recurso de outra empresa" }, 403);
    }
    externalId = (row as { external_id: string | null }).external_id;
  }

  // ─── PUSH pra agenda primeiro (se aplicável) ───
  let remoteResponse: unknown = null;
  if (body.syncToRemote) {
    try {
      remoteResponse = await pushToAgenda(body, externalId);
    } catch (err) {
      const status = err instanceof SoftcomCloudError ? err.status : 502;
      return jsonResponse(
        {
          error: `${body.action} ${body.resource} na agenda falhou`,
          details: (err as Error).message,
        },
        status,
      );
    }
  }

  // ─── Local DB ───
  let localId: string | undefined = body.id;
  try {
    if (body.action === "create") {
      const insertPayload = {
        ...body.data,
        company_id: body.companyId,
        // Se a agenda retornou um id remoto, salva como external_id
        external_id:
          remoteResponse && typeof remoteResponse === "object" && "id" in (remoteResponse as object)
            ? String((remoteResponse as { id: unknown }).id)
            : (body.data as { external_id?: string | null }).external_id ?? null,
      };
      const { data, error } = await sbAdmin
        .from(body.resource)
        .insert(insertPayload)
        .select("id")
        .single();
      if (error) throw error;
      localId = (data as { id: string }).id;
    } else if (body.action === "update") {
      const { error } = await sbAdmin
        .from(body.resource)
        .update(body.data!)
        .eq("id", body.id!);
      if (error) throw error;
    } else if (body.action === "delete") {
      const { error } = await sbAdmin
        .from(body.resource)
        .delete()
        .eq("id", body.id!);
      if (error) throw error;
    }
  } catch (e) {
    return jsonResponse(
      {
        error: `${body.action} ${body.resource} local falhou (remoto ok)`,
        details: (e as Error).message,
      },
      500,
    );
  }

  return jsonResponse({ success: true, localId, remote: remoteResponse });
});

// ─────────────────────────────────────────────────────────────────────────────
// Push pra agenda — mapeia tabela local → endpoint remoto + payload
// ─────────────────────────────────────────────────────────────────────────────

async function pushToAgenda(body: Body, externalId: string | null): Promise<unknown> {
  const { resource, action, data } = body;

  if (resource === "stores") {
    const payload = mapStoreToRemote(data ?? {});
    if (action === "create") return await createEmpresaPdv(payload);
    if (!externalId) return null; // nada pra fazer remotamente
    if (action === "update") return await updateEmpresaPdv(externalId, payload);
    if (action === "delete") return await deleteEmpresaPdv(externalId);
  }

  if (resource === "teams") {
    const payload = mapTeamToRemote(data ?? {});
    if (action === "create") return await createSetor(payload);
    if (!externalId) return null;
    if (action === "update") return await updateSetor(externalId, payload);
    if (action === "delete") return await deleteSetor(externalId);
  }

  if (resource === "positions") {
    const payload = mapPositionToRemote(data ?? {});
    if (action === "create") return await createCargo(payload);
    if (!externalId) return null;
    if (action === "update") return await updateCargo(externalId, payload);
    if (action === "delete") return await deleteCargo(externalId);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers local → remoto
//
// Os nomes dos campos remotos seguem os payloads de listEmpresasPdv,
// listSetores, listCargos (camelCase pt-BR). Confirmar contrato exato com
// OpenAPI antes de ativar em prod.
// ─────────────────────────────────────────────────────────────────────────────

function mapStoreToRemote(local: Record<string, unknown>): Record<string, unknown> {
  // stores.store_name, cnpj, address, store_code, is_matriz, etc.
  return {
    razaoSocial: local.store_name,
    nomeFantasia: local.fantasy_name ?? local.store_name,
    cnpj: local.cnpj,
    endereco: local.address,
    bairro: local.district,
    cidade: local.city,
    uf: local.state,
    cep: local.postal_code,
    telefone: local.phone,
    email: local.email,
    codigo: local.store_code,
    desativado: local.is_active === false,
  };
}

function mapTeamToRemote(local: Record<string, unknown>): Record<string, unknown> {
  // teams.name, description, store_id (opcional, lookup feito antes)
  return {
    nome: local.name,
    descricao: local.description,
    desativado: local.is_active === false,
  };
}

function mapPositionToRemote(local: Record<string, unknown>): Record<string, unknown> {
  // positions.name, salary, team_id, level, etc.
  return {
    nome: local.name,
    salario: local.salary,
    nivel: local.level,
    descricao: local.description,
    desativado: local.is_active === false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissão por módulo + ação
// ─────────────────────────────────────────────────────────────────────────────

async function checkPermission(
  // deno-lint-ignore no-explicit-any
  sbUser: any,
  userId: string,
  companyId: string,
  module: string,
  action: Action,
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
  if (!first) return false;
  if (action === "create") return Boolean(first.can_create);
  if (action === "update") return Boolean(first.can_edit);
  if (action === "delete") return Boolean(first.can_delete);
  return false;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
