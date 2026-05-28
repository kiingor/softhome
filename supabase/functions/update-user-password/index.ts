// update-user-password
//
// Reset de senha de um usuario pelo admin da empresa.
//
// Permissoes aceitas (qualquer uma):
//   - Caller é owner da company (se company_id vier no body)
//   - Caller é is_company_admin (se company_id vier)
//   - Caller tem can_edit em modulo 'permissoes' (se company_id vier)
//   - Fallback: caller tem role global 'admin' ou 'admin_gc' (compat)
//
// Body: { user_id, password OR new_password, company_id? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authError } =
      await userClient.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const user_id: string | undefined = body?.user_id;
    // Aceita tanto `password` (legacy) quanto `new_password` (atual)
    const password: string | undefined = body?.password ?? body?.new_password;
    const company_id: string | undefined = body?.company_id;

    if (!user_id || !password) {
      return new Response(
        JSON.stringify({ error: "ID do usuário e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha precisa de pelo menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Permissão ──────────────────────────────────────────────
    let allowed = false;
    let reason = "";

    // 1. Se company_id veio, check por owner + admin da company + can_edit
    if (company_id) {
      const { data: companyData } = await adminClient
        .from("companies")
        .select("id, owner_id")
        .eq("id", company_id)
        .maybeSingle();

      if (companyData?.owner_id === callerUser.id) {
        allowed = true;
        reason = "owner";
      }

      if (!allowed) {
        const { data: adminCheck } = await adminClient.rpc("is_company_admin", {
          _user_id: callerUser.id,
          _company_id: company_id,
        });
        if (adminCheck) {
          allowed = true;
          reason = "company_admin";
        }
      }

      if (!allowed) {
        const { data: permCheck } = await adminClient
          .from("user_permissions")
          .select("can_edit")
          .eq("user_id", callerUser.id)
          .eq("company_id", company_id)
          .eq("module", "permissoes")
          .maybeSingle();
        if (permCheck?.can_edit) {
          allowed = true;
          reason = "permissoes.can_edit";
        }
      }
    }

    // 2. Fallback: role global 'admin' ou 'admin_gc' (compat com chamadas antigas)
    if (!allowed) {
      const { data: roles } = await userClient.rpc("get_user_roles", {
        _user_id: callerUser.id,
      });
      const rolesList: string[] = Array.isArray(roles) ? roles : [];
      if (rolesList.includes("admin") || rolesList.includes("admin_gc")) {
        allowed = true;
        reason = "role_admin";
      }
    }

    if (!allowed) {
      console.error("Permissão negada — caller:", callerUser.id, "user_id:", user_id, "company_id:", company_id);
      return new Response(
        JSON.stringify({ error: "Sem permissão para resetar senha deste usuário" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Update senha ──────────────────────────────────────────
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user_id,
      { password },
    );

    if (updateError) {
      console.error("Erro ao atualizar senha:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message ?? "Erro ao atualizar senha" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Senha atualizada — user_id:", user_id, "via:", reason);

    return new Response(
      JSON.stringify({ success: true, message: "Senha atualizada" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("update-user-password error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
