// Edge Function: sync-collaborator-details
//
// Sincroniza sub-abas de UM colaborador específico. Usa o mesmo helper
// `applyCollaboratorDetails` que o sync bulk de colaboradores usa quando
// `includeDetails=true`. Útil pra retentar 1 colab que falhou no bulk.
//
// Body: { collaboratorId: uuid }
// Response: { success, results: ApplyDetailsResult, financials? }
//
// Permissão: colaboradores:can_view ou can_create.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { applyCollaboratorDetails } from "../_shared/apply-collaborator-details.ts";
import { applyFinancials } from "../_shared/apply-financials.ts";
import { isAgendaSyncDisabled, listAdicionais, SoftcomCloudError } from "../_shared/softcom-cloud.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  let collaboratorId: string;
  try {
    const body = await req.json();
    collaboratorId = String(body.collaboratorId ?? "").trim();
    if (!collaboratorId) throw new Error("missing collaboratorId");
  } catch (e) {
    return jsonResponse(
      { error: "Body deve ter { collaboratorId }: " + (e as Error).message },
      400,
    );
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: collab, error: collabErr } = await sbAdmin
    .from("collaborators")
    .select("id, company_id, external_id, store_id, current_salary")
    .eq("id", collaboratorId)
    .single();
  if (collabErr || !collab) {
    return jsonResponse({ error: "Colaborador não encontrado" }, 404);
  }
  if (!collab.external_id) {
    return jsonResponse(
      { error: "Colaborador sem external_id — não vinculado à agenda" },
      400,
    );
  }

  const allowed = await checkPermission(sbUser, user.id, collab.company_id, "colaboradores");
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  // Kill-switch global da agenda: não puxa detalhes. O colaborador já
  // persistido não é tocado; a UI segue lendo dados locais.
  if (isAgendaSyncDisabled()) {
    return jsonResponse({
      success: true,
      disabled: true,
      message: "Sincronização com a agenda desativada.",
    });
  }

  let results;
  let financials;
  try {
    results = await applyCollaboratorDetails(sbAdmin, {
      companyId: collab.company_id,
      collaboratorId: collab.id,
      remoteId: collab.external_id,
    });

    // Também aplica financeiros (salário + adicionais) — alinhado com o que
    // o sync bulk faz quando includeFinancials=true.
    try {
      const adicionais = await listAdicionais(collab.external_id);
      financials = await applyFinancials(sbAdmin, {
        companyId: collab.company_id,
        collaboratorId: collab.id,
        storeId: collab.store_id,
        currentSalary: collab.current_salary,
        adicionais,
      });
    } catch (finErr) {
      financials = { error: (finErr as Error).message };
    }
  } catch (err) {
    const status = err instanceof SoftcomCloudError ? err.status : 502;
    return jsonResponse(
      { error: "Falha ao sincronizar detalhes", details: (err as Error).message },
      status,
    );
  }

  return jsonResponse({ success: true, results, financials });
});

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
  return Boolean(first?.can_view) || Boolean(first?.can_create);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
