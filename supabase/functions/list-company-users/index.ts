// list-company-users
//
// Consolida usuários da empresa juntando:
//   - company_users (cadastro explícito)
//   - user_permissions (qualquer user com permissão na company, mesmo sem
//     registro em company_users — caso comum de "órfão" criado direto via
//     create-collaborator-user ou via signup antigo)
//   - owner da company (sempre incluído)
//
// Pra cada user_id, busca email/created_at via auth.admin.getUserById,
// que precisa SERVICE_ROLE — daí ser edge function e não query direto.
//
// Exclui colabs sincronizados: se user_id está em collaborators.user_id,
// não aparece aqui (acesso pelo Portal, não pelo dashboard). Filtro só
// por user_id — NÃO por email (frágil, gerava falsos positivos).
//
// Permissão: caller precisa ser owner da company OU ter permissão
// `permissoes` (módulo) com can_view. Admin bypass via is_company_admin.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResponseUser {
  id: string;          // id estável: prefere company_users.id, fallback `user:<auth_id>`
  user_id: string;     // auth.users.id
  email: string;
  full_name: string | null;
  is_active: boolean;
  accepted_at: string | null;
  source: "company_users" | "permissions_only" | "owner";
  /** True quando o user existe no auth + tem permissões mas não tem registro em company_users. */
  is_orphan: boolean;
}

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

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Permissão ──────────────────────────────────────────────────────
    // 1. Owner da company → ok
    // 2. is_company_admin (RPC) → ok
    // 3. can_view em módulo 'permissoes' → ok
    const { data: companyData, error: companyError } = await adminClient
      .from("companies")
      .select("id, owner_id, company_name")
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
        .select("can_view")
        .eq("user_id", callerUser.id)
        .eq("company_id", company_id)
        .eq("module", "permissoes")
        .maybeSingle();
      hasPermPermission = Boolean(permCheck?.can_view);
    }

    if (!isOwner && !isAdmin && !hasPermPermission) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para listar usuários desta empresa" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Coleta de IDs ──────────────────────────────────────────────────
    const [cuRes, permsRes, collabsRes] = await Promise.all([
      adminClient
        .from("company_users")
        .select("id, user_id, email, full_name, is_active, accepted_at, created_at")
        .eq("company_id", company_id),
      adminClient
        .from("user_permissions")
        .select("user_id")
        .eq("company_id", company_id),
      adminClient
        .from("collaborators")
        .select("user_id")
        .eq("company_id", company_id)
        .not("user_id", "is", null),
    ]);

    if (cuRes.error) {
      return new Response(
        JSON.stringify({ error: `company_users: ${cuRes.error.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const collabUserIds = new Set(
      (collabsRes.data ?? [])
        .map((c) => (c as { user_id: string | null }).user_id)
        .filter((id): id is string => !!id),
    );

    // Map user_id → CompanyUser row (pra mesclar com perms_only depois)
    const cuByUserId = new Map<string, (typeof cuRes.data)[number]>();
    const cuByEmail = new Map<string, (typeof cuRes.data)[number]>();
    for (const u of cuRes.data ?? []) {
      if (u.user_id) cuByUserId.set(u.user_id, u);
      if (u.email) cuByEmail.set(u.email.toLowerCase().trim(), u);
    }

    // User IDs distintos de user_permissions
    const permUserIds = new Set(
      (permsRes.data ?? [])
        .map((p) => (p as { user_id: string }).user_id)
        .filter(Boolean),
    );

    // ── Monta lista final ──────────────────────────────────────────────
    const finalUsers: ResponseUser[] = [];

    // 1. Todos de company_users que NÃO são colabs sincronizados
    for (const u of cuRes.data ?? []) {
      if (u.user_id && collabUserIds.has(u.user_id)) continue;
      finalUsers.push({
        id: u.id,
        user_id: u.user_id ?? "",
        email: u.email,
        full_name: u.full_name,
        is_active: u.is_active ?? true,
        accepted_at: u.accepted_at,
        source: "company_users",
        is_orphan: false,
      });
    }

    // 2. Órfãos: user_ids em user_permissions mas não em company_users
    const orphanIds = Array.from(permUserIds).filter(
      (uid) => !cuByUserId.has(uid) && !collabUserIds.has(uid),
    );

    for (const uid of orphanIds) {
      // Busca dados do auth.users
      const { data: authUserData, error: authErr } =
        await adminClient.auth.admin.getUserById(uid);
      if (authErr || !authUserData?.user) {
        // User deletado do auth mas ainda tem perms → mostra como "(usuário removido)"
        finalUsers.push({
          id: `orphan:${uid}`,
          user_id: uid,
          email: "(usuário removido do auth)",
          full_name: null,
          is_active: false,
          accepted_at: null,
          source: "permissions_only",
          is_orphan: true,
        });
        continue;
      }
      const authUser = authUserData.user;
      finalUsers.push({
        id: `orphan:${uid}`,
        user_id: uid,
        email: authUser.email ?? "(sem email)",
        full_name:
          (authUser.user_metadata as { full_name?: string } | undefined)?.full_name ??
          null,
        is_active: true,
        accepted_at: authUser.confirmed_at ?? null,
        source: "permissions_only",
        is_orphan: true,
      });
    }

    // 3. Owner — garante que aparece mesmo se não estiver nas listas acima
    const ownerId = companyData.owner_id;
    if (ownerId && !finalUsers.some((u) => u.user_id === ownerId)) {
      const { data: ownerAuthData } = await adminClient.auth.admin.getUserById(
        ownerId,
      );
      if (ownerAuthData?.user) {
        const oa = ownerAuthData.user;
        finalUsers.unshift({
          id: `owner:${ownerId}`,
          user_id: ownerId,
          email: oa.email ?? "(sem email)",
          full_name:
            (oa.user_metadata as { full_name?: string } | undefined)?.full_name ??
            null,
          is_active: true,
          accepted_at: oa.confirmed_at ?? null,
          source: "owner",
          is_orphan: false,
        });
      }
    }

    // Ordena: owner primeiro, depois ativos, depois inativos/órfãos
    finalUsers.sort((a, b) => {
      if (a.source === "owner") return -1;
      if (b.source === "owner") return 1;
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email, "pt-BR");
    });

    return new Response(
      JSON.stringify({
        users: finalUsers,
        meta: {
          company: companyData.company_name,
          total_company_users: cuRes.data?.length ?? 0,
          total_orphans: orphanIds.length,
          total_collabs_excluded: collabUserIds.size,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("list-company-users error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
