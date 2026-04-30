// Wrapper Resend pra Edge Functions SoftHouse.
//
// Usa fetch direto (Resend REST API simples) — sem dependência de SDK.
// Lê RESEND_API_KEY do env. FROM padrão é onboarding@resend.dev (sandbox
// do Resend) até verificarmos um domínio próprio (ex: gc.softcom.com.br).
// O caller pode sobrescrever via env RESEND_FROM se quiser.
//
// Uso:
//   import { sendEmail } from "../_shared/resend.ts";
//   await sendEmail({
//     to: "candidato@email.com",
//     subject: "Sua admissão",
//     html: "<p>Olá!</p>",
//   });

const DEFAULT_FROM = "SoftHouse <onboarding@resend.dev>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
}

export class ResendError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function sendEmail(
  opts: SendEmailOptions,
): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new ResendError(500, "RESEND_API_KEY não configurada");
  }

  const from = opts.from ?? Deno.env.get("RESEND_FROM") ?? DEFAULT_FROM;

  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.text) body.text = opts.text;
  if (opts.replyTo) body.reply_to = opts.replyTo;

  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new ResendError(
      resp.status,
      `Resend ${resp.status}: ${errText}`,
    );
  }

  const json = await resp.json() as { id?: string };
  if (!json.id) {
    throw new ResendError(500, "Resend retornou sem id");
  }
  return { id: json.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template baseline pra emails internos do SoftHouse
// (header verde, container central, footer com microcopy)
// ─────────────────────────────────────────────────────────────────────────────

export interface BaseTemplateOptions {
  /** Título grande no topo (h1) */
  heading: string;
  /** Corpo HTML — parágrafos, lista, links, etc. */
  bodyHtml: string;
  /** Texto do CTA principal (opcional) */
  ctaLabel?: string;
  /** URL do CTA (obrigatório se ctaLabel) */
  ctaUrl?: string;
  /** Empresa pra mostrar no header (default "SoftHouse") */
  companyName?: string;
  /** Texto do footer (default microcopy padrão) */
  footerText?: string;
}

export function renderBaseTemplate(opts: BaseTemplateOptions): string {
  const company = opts.companyName ?? "SoftHouse";
  const footer = opts.footerText ??
    "Email automático do sistema de Gente & Cultura. Se não era pra ti, pode ignorar.";

  const cta = opts.ctaLabel && opts.ctaUrl
    ? `
        <tr>
          <td style="padding: 24px 32px 8px;">
            <a href="${opts.ctaUrl}"
               style="display:inline-block;background:#F97316;color:#ffffff;
                      padding:12px 24px;border-radius:8px;text-decoration:none;
                      font-weight:600;font-family:Manrope,Arial,sans-serif;
                      font-size:15px;">
              ${escapeHtml(opts.ctaLabel)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;font-size:13px;color:#64748b;
                     font-family:Manrope,Arial,sans-serif;">
            Botão não funciona? Copia e cola este link no navegador:<br/>
            <a href="${opts.ctaUrl}" style="color:#F97316;word-break:break-all;">
              ${opts.ctaUrl}
            </a>
          </td>
        </tr>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Manrope,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
               style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td style="background:#F97316;padding:20px 32px;color:#ffffff;
                       font-weight:700;font-size:18px;letter-spacing:-0.01em;">
              ${escapeHtml(company)} — Gente & Cultura
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              <h1 style="margin:0;font-size:22px;letter-spacing:-0.02em;color:#0f172a;">
                ${escapeHtml(opts.heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 16px;font-size:15px;line-height:1.6;color:#334155;">
              ${opts.bodyHtml}
            </td>
          </tr>
          ${cta}
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e2e8f0;
                       font-size:12px;color:#94a3b8;line-height:1.5;">
              ${escapeHtml(footer)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
