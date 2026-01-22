import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteEmailRequest {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  inviterName: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { recipientEmail, recipientName, companyName, inviterName }: InviteEmailRequest = await req.json();

    console.log("Sending invite email to:", recipientEmail);
    console.log("Company:", companyName);
    console.log("Inviter:", inviterName);

    // Build the invite acceptance URL with email
    const acceptUrl = `https://meurh.com.br/aceitar-convite?email=${encodeURIComponent(recipientEmail)}`;

    const emailResponse = await resend.emails.send({
      from: "Meu RH <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `Você foi convidado para acessar ${companyName} no Meu RH`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6;">
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%); padding: 40px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Meu RH</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
                Sistema de Gestão de Pessoas
              </p>
            </div>
            
            <div style="padding: 40px;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">
                Olá${recipientName ? `, ${recipientName}` : ''}!
              </h2>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                <strong>${inviterName}</strong> convidou você para acessar o sistema de RH da empresa 
                <strong>${companyName}</strong>.
              </p>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                Com o Meu RH você poderá:
              </p>
              
              <ul style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0; padding-left: 20px;">
                <li>Gerenciar colaboradores e equipes</li>
                <li>Acompanhar folha de pagamento</li>
                <li>Visualizar benefícios e férias</li>
                <li>Gerar relatórios para contabilidade</li>
              </ul>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${acceptUrl}" 
                   style="background: linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%); 
                          color: white; padding: 14px 32px; 
                          text-decoration: none; border-radius: 8px; font-weight: bold;
                          display: inline-block; font-size: 16px;">
                  Acessar o Sistema
                </a>
              </div>
              
              <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-top: 30px;">
                <p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>💡 Dica:</strong> Se você ainda não possui uma conta, clique no botão acima 
                  e crie sua conta utilizando este mesmo email: <strong>${recipientEmail}</strong>
                </p>
              </div>
            </div>
            
            <div style="background: #1f2937; padding: 25px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © 2025 Meu RH - Sistema de Gestão de Pessoas
              </p>
              <p style="color: #6b7280; font-size: 11px; margin: 10px 0 0 0;">
                Este email foi enviado porque você foi convidado para acessar o sistema.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error sending invite email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao enviar email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
