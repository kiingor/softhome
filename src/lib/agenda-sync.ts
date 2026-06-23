// Kill-switch de UI da integração com a agenda (api.softcom.cloud).
//
// Espelha, no frontend, o secret AGENDA_SYNC_DISABLED das Edge Functions:
// quando `true`, esconde os botões "Sincronizar" (de cadastro/colaborador) e
// neutraliza a microcopy que diz "(sincronizado com a agenda)", pra não mentir
// enquanto o write-back está desligado no backend.
//
// O gate REAL é server-side (as Edge Functions ignoram a agenda quando o secret
// está setado). Isto aqui é só cosmético — evitar botão morto e texto enganoso.
//
// Reativar: voltar pra `false` (e remover o secret AGENDA_SYNC_DISABLED no
// Supabase). NÃO afeta o Guardião da Cultura (feedbacks/objetivos), que segue
// ao vivo, nem a sincronização de feriados (holidays-sync usa BrasilAPI).
export const AGENDA_SYNC_DISABLED = true;
