// Persistência leve do jobId de syncs em andamento.
//
// Por quê: quando user clica "Fechar (continua em segundo plano)" no modal de
// progresso, o componente desmonta e perde o jobId. Sem persistência, não
// tem como reabrir o modal pra acompanhar — a sync continua rodando no
// servidor mas o user fica no escuro.
//
// Estratégia: salva o jobId em localStorage por (companyId, resource). Ao
// montar a página, checa se há job ativo (status=running) e reabre o modal
// automaticamente. Quando o job termina (completed/failed/cancelled), limpa.

const PREFIX = "softhouse.sync-job.v1";

function keyFor(companyId: string, resource: string): string {
  return `${PREFIX}.${resource}.${companyId}`;
}

export function setSyncJobId(companyId: string, resource: string, jobId: string): void {
  try {
    localStorage.setItem(keyFor(companyId, resource), jobId);
  } catch {
    // localStorage pode falhar em modo privado ou se storage cheio — silencioso
  }
}

export function getSyncJobId(companyId: string, resource: string): string | null {
  try {
    return localStorage.getItem(keyFor(companyId, resource));
  } catch {
    return null;
  }
}

export function clearSyncJobId(companyId: string, resource: string): void {
  try {
    localStorage.removeItem(keyFor(companyId, resource));
  } catch {
    // ignore
  }
}
