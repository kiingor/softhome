// update-user-password
//
// Reset de senha de um usuario pelo admin da empresa.
//
// Quem pode chamar (com company_id no body — qualquer uma das três):
//   - Caller é owner da company
//   - Caller é is_company_admin
//   - Caller tem can_edit no modulo 'permissoes'
// Sem company_id no body: só role global 'admin'/'admin_gc' (compat legado).
//
// Além de autorizar o CALLER, a função valida o ALVO:
//   - o user_id precisa pertencer à company informada;
//   - quem não é admin não reseta a senha de quem é (anti-escalada);
//   - toda troca vira registro em audit_log.
//
// Body: { user_id, password OR new_password, company_id? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Espelha src/lib/security/password-policy.ts. Mantenha os dois iguais e
// alinhados com o mínimo configurado no painel do Supabase.
const MIN_PASSWORD_LENGTH = 8;

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
    if (password.length < MIN_PASSWORD_LENGTH) {
      return new Response(
        JSON.stringify({ error: `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres` }),
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

    // 2. Fallback: role global 'admin'/'admin_gc'.
    // Só vale quando company_id NÃO veio no body — se veio, a decisão tem que
    // sair do vínculo com aquela empresa (bloco 1), senão o fallback vira um
    // bypass que anula toda a checagem acima.
    const callerRolesList: string[] = await (async () => {
      const { data: roles } = await userClient.rpc("get_user_roles", {
        _user_id: callerUser.id,
      });
      return Array.isArray(roles) ? (roles as string[]) : [];
    })();
    const callerIsAdmin =
      callerRolesList.includes("admin") || callerRolesList.includes("admin_gc");

    if (!allowed && !company_id && callerIsAdmin) {
      allowed = true;
      reason = "role_admin";
    }

    if (!allowed) {
      console.error("Permissão negada — caller:", callerUser.id, "user_id:", user_id, "company_id:", company_id);
      return new Response(
        JSON.stringify({ error: "Sem permissão para resetar senha deste usuário" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── O alvo precisa estar no escopo do caller ──────────────
    // Sem isso a autorização checa a empresa de QUEM CHAMA e nunca a de QUEM
    // SOFRE a troca: bastava mandar o user_id do admin do sistema junto com o
    // company_id da própria filial pra assumir a conta dele.
    if (company_id) {
      const [{ data: link }, { data: ownerRow }] = await Promise.all([
        adminClient
          .from("company_users")
          .select("id")
          .eq("company_id", company_id)
          .eq("user_id", user_id)
          .eq("is_active", true)
          .maybeSingle(),
        adminClient
          .from("companies")
          .select("owner_id")
          .eq("id", company_id)
          .maybeSingle(),
      ]);

      if (!link && ownerRow?.owner_id !== user_id) {
        return new Response(
          JSON.stringify({ error: "Usuário não pertence a esta empresa" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ─── Ninguém escala pra cima ───────────────────────────────
    // Delegação de módulo ("permissoes.can_edit") não pode resetar a senha de
    // um admin — seria trocar acesso de uma filial por acesso ao sistema todo.
    const { data: targetRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    const targetIsAdmin = (targetRoles ?? []).some((r) =>
      ["admin", "admin_gc"].includes(String((r as { role: unknown }).role)),
    );

    if (targetIsAdmin && !callerIsAdmin && reason !== "owner") {
      console.error("Escalada bloqueada — caller:", callerUser.id, "alvo admin:", user_id);
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

    // Rastro obrigatório: reset de senha por terceiro é operação sensível e
    // hoje não deixava nenhum registro. Falha aqui não desfaz a troca de senha
    // (que já aconteceu), então só logamos.
    const { error: auditError } = await adminClient.from("audit_log").insert({
      user_id: callerUser.id,
      company_id: company_id ?? null,
      action: "update",
      table_name: "auth.users",
      record_id: user_id,
      after: { event: "password_reset", authorized_by: reason },
    });
    if (auditError) {
      console.error("Falha ao gravar audit_log do reset:", auditError.message);
    }

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
