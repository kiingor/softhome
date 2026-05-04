// Edge Function: delete-collaborator
//
// Exclusão completa de um colaborador:
//   1. Auth check (admin_gc / gestor_gc da empresa)
//   2. Busca colaborador pra pegar user_id
//   3. Se tem user_id → deleta usuário do supabase auth (admin.deleteUser)
//   4. Deleta linhas dependentes (profiles, user_roles, company_users) idempotente
//   5. Deleta o colaborador (cascata pega payroll_entries/benefits_assignments etc)
//
// Body: { collaboratorId: uuid }
// Response: { success: true, deletedAuthUser: boolean }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

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

  // Permission: admin_gc ou gestor_gc
  const { data: roles } = await sbUser
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleStrings = (roles ?? []).map((r) =>
    String((r as { role: string }).role),
  );
  const isAdmin = roleStrings.some((r) =>
    ["admin_gc", "admin"].includes(r),
  );
  const isGestor = roleStrings.includes("gestor_gc");
  if (!isAdmin && !isGestor) {
    return jsonResponse(
      { error: "Sem permissão pra excluir colaboradores" },
      403,
    );
  }

  let collaboratorId: string;
  try {
    const body = await req.json();
    collaboratorId = String(body.collaboratorId ?? "").trim();
    if (!collaboratorId) throw new Error("missing collaboratorId");
  } catch {
    return jsonResponse(
      { error: "Body must include { collaboratorId: uuid }" },
      400,
    );
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Busca colaborador
  const { data: collaborator, error: fetchErr } = await sbAdmin
    .from("collaborators")
    .select("id, user_id, company_id, name")
    .eq("id", collaboratorId)
    .single();

  if (fetchErr || !collaborator) {
    return jsonResponse({ error: "Colaborador não encontrado" }, 404);
  }

  // Gestor só deleta colaborador da própria empresa
  if (!isAdmin && isGestor) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: collaborator.company_id,
      _user_id: user.id,
    });
    if (!belongs) {
      return jsonResponse(
        { error: "Colaborador não é da sua empresa" },
        403,
      );
    }
  }

  let deletedAuthUser = false;

  // Se tem user_id, deleta auth user + linhas auxiliares
  if (collaborator.user_id) {
    const targetUserId = collaborator.user_id;

    // Cleanup tabelas que referenciam o user (idempotente)
    await sbAdmin.from("user_roles").delete().eq("user_id", targetUserId);
    await sbAdmin.from("profiles").delete().eq("user_id", targetUserId);
    // company_users pode ou não existir dependendo do schema atual
    try {
      await sbAdmin.from("company_users").delete().eq("user_id", targetUserId);
    } catch (_) {
      // Tabela pode não existir — ignora
    }

    // Deleta auth user
    const { error: deleteAuthErr } = await sbAdmin.auth.admin.deleteUser(
      targetUserId,
    );
    if (deleteAuthErr) {
      console.error("[delete-collaborator] auth.deleteUser falhou:", deleteAuthErr);
      // Não trava o fluxo — pode ser que o user já tenha sido deletado
    } else {
      deletedAuthUser = true;
    }
  }

  // Deleta o colaborador (FK cascade nas tabelas dependentes)
  const { error: deleteErr } = await sbAdmin
    .from("collaborators")
    .delete()
    .eq("id", collaboratorId);

  if (deleteErr) {
    return jsonResponse(
      { error: "Falha ao excluir colaborador", details: deleteErr.message },
      500,
    );
  }

  return jsonResponse({
    success: true,
    deletedAuthUser,
    collaboratorId,
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
