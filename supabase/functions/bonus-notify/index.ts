// Edge Function: bonus-notify
//
// Notifica um colaborador sobre um evento de 13º Salário em 3 canais
// (in-app no Portal, WhatsApp via whatsapp-api, Email via Resend).
// Cada canal é independente — falha em um não derruba os outros.
//
// Body: { collaborator_id: uuid, type: 'bonus_first_paid' | 'bonus_second_paid'
//                                       | 'bonus_anticipated' | 'bonus_paid_single',
//         params: { year: number, amount: number } }
// Response: { ok: true, channels: { in_app: bool, whatsapp: bool, email: bool } }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BonusEventType =
  | "bonus_first_paid"
  | "bonus_second_paid"
  | "bonus_anticipated"
  | "bonus_paid_single";

const COPY: Record<BonusEventType, { title: string; bodyTpl: string; emoji: string }> = {
  bonus_first_paid: {
    emoji: "🎉",
    title: "1ª parcela do 13º caiu na conta!",
    bodyTpl:
      "Boa notícia: a primeira parcela do seu 13º de {year} no valor de {amount} acabou de ser registrada como paga. Aproveite! 🎁",
  },
  bonus_second_paid: {
    emoji: "🎄",
    title: "2ª parcela do 13º foi paga!",
    bodyTpl:
      "Parabéns! A segunda parcela do seu 13º de {year} ({amount}) acabou de cair. Que venham as festas! ✨",
  },
  bonus_anticipated: {
    emoji: "🚀",
    title: "Seu 13º foi antecipado!",
    bodyTpl:
      "Surpresa! Seu 13º de {year} foi antecipado integralmente — {amount}. Aproveite!",
  },
  bonus_paid_single: {
    emoji: "💰",
    title: "Pagamento de 13º registrado",
    bodyTpl: "Seu 13º de {year} ({amount}) foi pago.",
  },
};

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: {
    collaborator_id?: string;
    type?: BonusEventType;
    params?: { year?: number; amount?: number };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const collaboratorId = String(body.collaborator_id ?? "").trim();
  const type = body.type as BonusEventType;
  const year = Number(body.params?.year ?? new Date().getFullYear());
  const amount = Number(body.params?.amount ?? 0);

  if (!collaboratorId) return json({ error: "collaborator_id obrigatório" }, 400);
  if (!type || !COPY[type]) return json({ error: "type inválido" }, 400);

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Carrega colaborador e empresa em paralelo
  const { data: collab, error: collabErr } = await sb
    .from("collaborators")
    .select("id, name, email, phone, company_id")
    .eq("id", collaboratorId)
    .maybeSingle();

  if (collabErr || !collab) {
    return json({ error: "Colaborador não encontrado" }, 404);
  }

  const { data: company } = await sb
    .from("companies")
    .select("company_name")
    .eq("id", collab.company_id)
    .maybeSingle();

  const copy = COPY[type];
  const renderedBody = copy.bodyTpl
    .replace("{year}", String(year))
    .replace("{amount}", fmtBRL(amount));

  const channels = { in_app: false, whatsapp: false, email: false };

  // === Canal 1: in-app (collaborator_notifications) ===
  try {
    const { error } = await sb.from("collaborator_notifications").insert({
      collaborator_id: collaboratorId,
      type,
      title: `${copy.emoji} ${copy.title}`,
      body: renderedBody,
      payload: { year, amount },
    });
    if (!error) channels.in_app = true;
    else console.error("[bonus-notify] in_app err:", error.message);
  } catch (e) {
    console.error("[bonus-notify] in_app exception:", e);
  }

  // === Canal 2: WhatsApp (best-effort, ignora se infra desligada) ===
  try {
    if (collab.phone) {
      const { error } = await sb.functions.invoke("whatsapp-api", {
        body: {
          action: "send_notification",
          company_id: collab.company_id,
          template_key: type,
          to: collab.phone,
          variables: {
            nome: collab.name,
            ano: String(year),
            valor: fmtBRL(amount),
            empresa: company?.company_name ?? "",
          },
          fallback_message: `${copy.emoji} ${copy.title}\n\n${renderedBody}`,
        },
      });
      if (!error) channels.whatsapp = true;
    }
  } catch (e) {
    console.error("[bonus-notify] whatsapp exception:", e);
  }

  // === Canal 3: Email via Resend ===
  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey && collab.email) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "SoftHouse <onboarding@resend.dev>",
        to: [collab.email],
        subject: `${copy.emoji} ${copy.title}`,
        html: buildEmailHtml({
          collaboratorName: collab.name,
          companyName: company?.company_name ?? "",
          title: copy.title,
          emoji: copy.emoji,
          body: renderedBody,
          amount: fmtBRL(amount),
          year,
        }),
      });
      channels.email = true;
    }
  } catch (e) {
    console.error("[bonus-notify] email exception:", e);
  }

  return json({ ok: true, channels });
});

function buildEmailHtml(args: {
  collaboratorName: string;
  companyName: string;
  title: string;
  emoji: string;
  body: string;
  amount: string;
  year: number;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;">
    <div style="background:linear-gradient(135deg,#F97316 0%,#EA580C 100%);padding:40px 24px;text-align:center;">
      <div style="font-size:48px;line-height:1;margin-bottom:12px;">${args.emoji}</div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">${args.title}</h1>
    </div>
    <div style="padding:32px 28px;color:#1f2937;line-height:1.6;">
      <p style="font-size:16px;margin:0 0 16px;">Olá <strong>${args.collaboratorName}</strong>,</p>
      <p style="font-size:15px;margin:0 0 24px;">${args.body}</p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
        <p style="font-size:13px;color:#9a3412;margin:0;text-transform:uppercase;letter-spacing:0.05em;">Valor</p>
        <p style="font-size:28px;color:#c2410c;margin:6px 0 0;font-weight:700;">${args.amount}</p>
        <p style="font-size:12px;color:#9a3412;margin:6px 0 0;">Referente ao ano de ${args.year}</p>
      </div>
      <p style="font-size:13px;color:#6b7280;margin:24px 0 0;">
        Em caso de dúvidas, entre em contato com o RH${args.companyName ? ` da ${args.companyName}` : ""}.
      </p>
    </div>
    <div style="background:#f3f4f6;padding:18px;text-align:center;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">
        Esta mensagem foi enviada automaticamente pelo SoftHouse — não precisa responder.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
