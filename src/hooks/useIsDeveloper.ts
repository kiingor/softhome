// Hook que retorna true se o usuário logado está na allowlist de devs.
// Usado pra esconder controles que só fazem sentido pra quem mantém o sistema
// (ex: "Novo Colaborador" — fluxo padrão é vir via sync da agenda, não manual).
//
// Pra adicionar outro dev, basta incluir o email aqui. Não persiste em banco
// porque é controle de UI, não de segurança — RLS continua sendo a barreira
// real no backend.

import { useDashboard } from "@/contexts/DashboardContext";

const DEVELOPER_EMAILS = new Set<string>([
  "soft.nocode@softcomtecnologia.com.br",
]);

export const useIsDeveloper = (): boolean => {
  const { user } = useDashboard();
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  return DEVELOPER_EMAILS.has(email);
};
