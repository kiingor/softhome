// update-user-name
//
// Atualiza o nome (full_name) de um usuário da empresa.
//
// Onde grava:
//   1. SEMPRE em auth.users.user_metadata.full_name (fonte canônica)
//   2. Se existir linha em company_users desta company → atualiza full_name lá
//   3. Se existir linha em profiles do user → atualiza full_name lá também
//
// Permissão: owner da company OU is_company_admin OU can_view em 'permissoes'.

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
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const company_id: string | undefined = body?.company_id;
    const target_user_id: string | undefined = body?.user_id;
    const full_name_raw: string | undefined = body?.full_name;

    if (!company_id || !target_user_id) {
      return new Response(
        JSON.stringify({ error: "company_id e user_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const full_name = (full_name_raw ?? "").trim();
    if (!full_name) {
      return new Response(
        JSON.stringify({ error: "Nome não pode ser vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (full_name.length > 120) {
      return new Response(
        JSON.stringify({ error: "Nome muito longo (máx 120 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Permissão ──────────────────────────────────────────────────────
    const { data: companyData, error: companyError } = await adminClient
      .from("companies")
      .select("id, owner_id")
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !companyData) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwner = companyData.owner_id === callerUser.id;
    let isAdmin = false;
    if (!isOwner) {
      const { data: adminCheck } = await adminClient.rpc("is_company_admin", {
        _user_id: callerUser.id,
        _company_id: company_id,
      });
      isAdmin = Boolean(adminCheck);
    }

    let hasPermPermission = false;
    if (!isOwner && !isAdmin) {
      const { data: permCheck } = await adminClient
        .from("user_permissions")
        .select("can_edit, can_view")
        .eq("user_id", callerUser.id)
        .eq("company_id", company_id)
        .eq("module", "permissoes")
        .maybeSingle();
      // Pra editar precisa de can_edit; se só tem can_view, bloqueia
      hasPermPermission = Boolean(permCheck?.can_edit);
    }

    if (!isOwner && !isAdmin && !hasPermPermission) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para editar usuários desta empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Atualiza ───────────────────────────────────────────────────────
    // 1. auth.users.user_metadata.full_name — fonte canônica
    // Preserva user_metadata existente, só mescla full_name
    const { data: targetAuth, error: getErr } =
      await adminClient.auth.admin.getUserById(target_user_id);
    if (getErr || !targetAuth?.user) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado no auth" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const mergedMetadata = { ...(targetAuth.user.user_metadata ?? {}), full_name };
    const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { user_metadata: mergedMetadata },
    );
    if (updateAuthErr) {
      return new Response(
        JSON.stringify({ error: `auth: ${updateAuthErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. company_users (se existir) — opcional, ignora erro
    const { data: cuRow } = await adminClient
      .from("company_users")
      .select("id")
      .eq("company_id", company_id)
      .eq("user_id", target_user_id)
      .maybeSingle();

    if (cuRow?.id) {
      await adminClient
        .from("company_users")
        .update({ full_name })
        .eq("id", cuRow.id);
    }

    // 3. profiles (se existir) — opcional, ignora erro
    const { data: profileRow } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("user_id", target_user_id)
      .maybeSingle();
    if (profileRow) {
      await adminClient
        .from("profiles")
        .update({ full_name })
        .eq("user_id", target_user_id);
    }

    return new Response(
      JSON.stringify({ success: true, full_name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("update-user-name error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
