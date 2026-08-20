// send-invite-email
//
// Avisa por e-mail que um usuário ganhou acesso ao DNA Softcom.
//
// O que foi corrigido aqui (a versão anterior era resíduo do fork SaaS):
//   1. Autenticação de verdade. Antes bastava QUALQUER string no header
//      Authorization — o header nunca era validado e a function roda com
//      verify_jwt = false, então um anônimo disparava e-mail pela conta Resend
//      da empresa com nome/empresa/remetente que ele escolhesse.
//   2. Autorização: só quem pode gerenciar usuários daquela empresa.
//   3. Escape de HTML nos campos do corpo (eram interpolados crus).
//   4. O CTA apontava pra https://meurh.com.br/aceitar-convite — domínio do SaaS
//      de origem, fora do controle da Softcom. Agora vem de PUBLIC_APP_ORIGIN.
//   5. A senha NÃO vai por e-mail. O caller mandava `recipientPassword` que o
//      template nem usava; agora o campo é ignorado de propósito.
//
// Body: { recipientEmail, recipientName?, companyName?, inviterName?, company_id }
//
// Configure antes de usar:
//   npx supabase secrets set PUBLIC_APP_ORIGIN=https://<dominio-do-dna>

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, renderBaseTemplate, sendEmail } from "../_shared/resend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface InviteEmailRequest {
  recipientEmail?: string;
  recipientName?: string;
  companyName?: string;
  inviterName?: string;
  company_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Valida o token de verdade — não basta o header existir.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authError } =
      await userClient.auth.getUser();
    if (authError || !callerUser) {
      return json({ error: "Não autorizado" }, 401);
    }

    const body: InviteEmailRequest = await req.json().catch(() => ({}));
    const recipientEmail = String(body.recipientEmail ?? "").trim().toLowerCase();
    const companyId = body.company_id;

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return json({ error: "E-mail do destinatário inválido" }, 400);
    }
    if (!companyId) {
      return json({ error: "ID da empresa é obrigatório" }, 400);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Autorização ────────────────────────────────────────────
    // Mesma régua de create-collaborator-user: owner da empresa, admin dela,
    // ou delegação explícita no módulo de permissões.
    let allowed = false;

    const { data: company } = await adminClient
      .from("companies")
      .select("id, owner_id, company_name")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) {
      return json({ error: "Empresa não encontrada" }, 404);
    }
    if (company.owner_id === callerUser.id) {
      allowed = true;
    }

    if (!allowed) {
      const { data: isAdmin } = await adminClient.rpc("is_company_admin", {
        _user_id: callerUser.id,
        _company_id: companyId,
      });
      if (isAdmin) allowed = true;
    }

    if (!allowed) {
      const { data: perm } = await adminClient
        .from("user_permissions")
        .select("can_edit")
        .eq("user_id", callerUser.id)
        .eq("company_id", companyId)
        .eq("module", "permissoes")
        .maybeSingle();
      if (perm?.can_edit) allowed = true;
    }

    if (!allowed) {
      console.error("send-invite-email negado — caller:", callerUser.id);
      return json({ error: "Sem permissão para convidar usuários nesta empresa" }, 403);
    }

    // ─── Destino do link ────────────────────────────────────────
    // Vem do ambiente, nunca do body: origem controlada pelo cliente vira link
    // de phishing saindo de um e-mail legítimo da empresa.
    const origin = (Deno.env.get("PUBLIC_APP_ORIGIN") ?? "").replace(/\/$/, "");
    if (!origin) {
      console.error("PUBLIC_APP_ORIGIN não configurada");
      return json({ error: "Origem pública do app não configurada" }, 500);
    }

    // ─── Corpo ──────────────────────────────────────────────────
    const recipientName = String(body.recipientName ?? "").trim();
    const companyName = String(body.companyName ?? company.company_name ?? "").trim();
    const inviterName = String(body.inviterName ?? "").trim();

    const greeting = recipientName ? `Olá, ${escapeHtml(recipientName)}!` : "Olá!";
    const invitedBy = inviterName
      ? `<strong>${escapeHtml(inviterName)}</strong> liberou`
      : "O RH liberou";

    const html = renderBaseTemplate({
      heading: "Seu acesso está liberado",
      companyName: companyName || undefined,
      ctaLabel: "Entrar no DNA Softcom",
      ctaUrl: `${origin}/login`,
      bodyHtml: `
        <p>${greeting}</p>
        <p>
          ${invitedBy} seu acesso ao DNA Softcom${
            companyName ? ` — ${escapeHtml(companyName)}` : ""
          }.
        </p>
        <p>
          Entre com o e-mail <strong>${escapeHtml(recipientEmail)}</strong> e a senha
          que o RH combinou com você. Se ainda não tem a senha ou não lembra dela,
          use "Esqueci a senha" na tela de login.
        </p>
      `,
      footerText:
        "Por segurança, nunca mandamos senha por e-mail. Se você não esperava este aviso, fale com o RH.",
    });

    const result = await sendEmail({
      to: recipientEmail,
      subject: companyName
        ? `Seu acesso ao DNA Softcom — ${companyName}`
        : "Seu acesso ao DNA Softcom",
      html,
    });

    console.log("Convite enviado — id:", result.id);

    return json({ success: true, id: result.id });
  } catch (error) {
    console.error("send-invite-email error:", (error as Error).message);
    // Mensagem genérica: detalhe interno não volta pro cliente.
    return json({ error: "Não foi possível enviar o e-mail de acesso" }, 500);
  }
});
