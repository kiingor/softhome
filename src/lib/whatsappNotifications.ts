import { supabase } from "@/integrations/supabase/client";

export async function sendWhatsAppNotification(
  companyId: string,
  collaboratorId: string,
  eventType: string,
  variables?: Record<string, string>
) {
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: {
        action: "send_notification",
        company_id: companyId,
        collaborator_id: collaboratorId,
        event_type: eventType,
        variables,
      },
    });

    if (error) {
      console.error("WhatsApp notification error:", error);
      return { success: false, error: error.message };
    }

    return data;
  } catch (err) {
    console.error("WhatsApp notification failed:", err);
    return { success: false, error: String(err) };
  }
}

export const DEFAULT_TEMPLATES: Record<string, { label: string; description: string; message: string; variables: string[] }> = {
  collaborator_registered: {
    label: "Cadastro do Colaborador",
    description: "Enviado quando um novo colaborador é cadastrado",
    message: "Olá {nome}! 👋\n\nBem-vindo(a) à *{empresa}*! 🎉\n\nEstamos muito felizes em te ter no time! 🚀\n\nPara completar seu cadastro, acesse o link abaixo e preencha seus dados:\n👉 {link_primeiro_acesso}\n\nQualquer dúvida, estamos aqui! 💬",
    variables: ["nome", "empresa", "link_primeiro_acesso"],
  },
  documents_approved: {
    label: "Cadastro Aprovado",
    description: "Enviado quando o cadastro do colaborador é aprovado",
    message: "Parabéns {nome}! 🎊\n\nSeu cadastro foi *aprovado com sucesso*! ✅\n\nAgora você já faz parte oficialmente da equipe *{empresa}*! 🏆\n\nAcesse o Portal do Colaborador para ver seus dados:\n👉 {link_portal}\n\nSeja muito bem-vindo(a)! 🤗",
    variables: ["nome", "empresa", "link_portal"],
  },
  documents_rejected: {
    label: "Cadastro Reprovado",
    description: "Enviado quando o cadastro do colaborador precisa de ajustes",
    message: "Olá {nome}! 👋\n\nPrecisamos da sua atenção! ⚠️\n\nAlguns documentos do seu cadastro na *{empresa}* precisam de ajustes.\n\nAcesse o link abaixo para verificar e reenviar:\n👉 {link_primeiro_acesso}\n\nEstamos torcendo por você! 💪",
    variables: ["nome", "empresa", "link_primeiro_acesso"],
  },
  exam_created: {
    label: "Novo Exame Agendado",
    description: "Enviado quando um novo exame ocupacional é criado",
    message: "Olá {nome}! 👋\n\nUm novo exame ocupacional foi agendado pra você na *{empresa}*! 🏥\n\n📋 Tipo: *{tipo_exame}*\n📅 Data limite: *{data_exame}*\n\nFique atento(a) ao prazo! ⏰\nQualquer dúvida, fale com o RH. 💬",
    variables: ["nome", "empresa", "tipo_exame", "data_exame"],
  },
  vacation_starting: {
    label: "Férias Aprovadas",
    description: "Enviado quando as férias do colaborador são aprovadas",
    message: "Olá {nome}! 👋\n\nSuas férias foram aprovadas! 🏖️\n\n📅 Período: *{data_inicio}* a *{data_fim}*\n\nAproveite bastante esse descanso merecido! 😎☀️\n\nA equipe *{empresa}* deseja ótimas férias! 🌴",
    variables: ["nome", "empresa", "data_inicio", "data_fim"],
  },
  payslip_available: {
    label: "Contracheque Disponível",
    description: "Enviado quando um novo contracheque é disponibilizado",
    message: "Olá {nome}! 👋\n\nSeu contracheque de *{mes}/{ano}* já está disponível no Portal do Colaborador! 💰\n\nAcesse para conferir:\n👉 {link_portal}\n\nBom trabalho! 👏",
    variables: ["nome", "empresa", "mes", "ano", "link_portal"],
  },
};
