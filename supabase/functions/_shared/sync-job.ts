// Helpers pra orquestrar progresso de sync_jobs.
//
// Padrão "fire-and-poll": edge function cria 1 row em sync_jobs, retorna o
// id, e roda o trabalho real em background (EdgeRuntime.waitUntil). Frontend
// polla sync_jobs a cada 1-2s pra mostrar progresso em modal.
//
// Uso típico numa edge function:
//
//   const jobId = await createSyncJob(sbAdmin, {
//     companyId, resource: "collaborators",
//     options: { includeFinancials, includeDetails },
//     createdBy: user.id,
//   });
//
//   // Resposta imediata
//   const response = jsonResponse({ success: true, jobId }, 202);
//
//   // Roda em background, atualizando o job
//   EdgeRuntime.waitUntil((async () => {
//     try {
//       await markJobRunning(sbAdmin, jobId);
//       // ... trabalho real, chamando updateJob(sbAdmin, jobId, { processed, ... })
//       await markJobCompleted(sbAdmin, jobId, result);
//     } catch (e) {
//       await markJobFailed(sbAdmin, jobId, (e as Error).message);
//     }
//   })());
//
//   return response;

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export interface JobOptions {
  [k: string]: unknown;
}

export interface CreateSyncJobInput {
  companyId: string;
  resource: string;
  options?: JobOptions;
  createdBy: string | null;
  /** Total inicial conhecido. Pode ser 0 e depois atualizar. */
  total?: number;
  currentStep?: string;
}

export interface JobPatch {
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_step?: string;
  total?: number;
  processed?: number;
  inserted?: number;
  updated?: number;
  deactivated?: number;
  errors?: Array<{ external_id?: string; name?: string; error: string; kind?: string }>;
  cursor?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error_message?: string;
}

/**
 * Cria a row e retorna o uuid. Caller deve responder ao client imediatamente
 * com este id.
 */
export async function createSyncJob(
  sbAdmin: SupabaseAdmin,
  input: CreateSyncJobInput,
): Promise<string> {
  const { data, error } = await sbAdmin
    .from("sync_jobs")
    .insert({
      company_id: input.companyId,
      resource: input.resource,
      options: input.options ?? {},
      created_by: input.createdBy,
      total: input.total ?? 0,
      current_step: input.currentStep ?? "Iniciando...",
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error("Falha ao criar sync_job: " + (error?.message ?? "no data"));
  }
  return data.id as string;
}

/** Patch incremental sobre o job. Use pra atualizar progresso. */
export async function updateJob(
  sbAdmin: SupabaseAdmin,
  jobId: string,
  patch: JobPatch,
): Promise<void> {
  const { error } = await sbAdmin.from("sync_jobs").update(patch).eq("id", jobId);
  if (error) {
    // Não bloqueia o trabalho real — só loga
    console.warn(`updateJob ${jobId} falhou: ${error.message}`);
  }
}

export async function markJobRunning(
  sbAdmin: SupabaseAdmin,
  jobId: string,
  currentStep = "Iniciando...",
): Promise<void> {
  const { error } = await sbAdmin
    .from("sync_jobs")
    .update({
      status: "running",
      current_step: currentStep,
      started_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) console.warn(`markJobRunning ${jobId} falhou: ${error.message}`);
}

export async function markJobCompleted(
  sbAdmin: SupabaseAdmin,
  jobId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  const { error } = await sbAdmin
    .from("sync_jobs")
    .update({
      status: "completed",
      current_step: "Concluído",
      finished_at: new Date().toISOString(),
      result: result ?? {},
    })
    .eq("id", jobId);
  if (error) console.warn(`markJobCompleted ${jobId} falhou: ${error.message}`);
}

export async function markJobFailed(
  sbAdmin: SupabaseAdmin,
  jobId: string,
  errorMessage: string,
  partialResult?: Record<string, unknown>,
): Promise<void> {
  const { error } = await sbAdmin
    .from("sync_jobs")
    .update({
      status: "failed",
      current_step: "Falhou",
      finished_at: new Date().toISOString(),
      error_message: errorMessage.slice(0, 1000),
      result: partialResult ?? {},
    })
    .eq("id", jobId);
  if (error) console.warn(`markJobFailed ${jobId} falhou: ${error.message}`);
}

/**
 * Throttle de updates: garante no máximo 1 UPDATE a cada `minIntervalMs`.
 * Use em loops grandes pra não martelar o DB.
 *
 * Uso:
 *   const sendProgress = throttledJobUpdater(sbAdmin, jobId, 800);
 *   for (const item of items) {
 *     processed++;
 *     await sendProgress({ processed, current_step: `Processando ${item.name}` });
 *   }
 *   // Force flush no fim:
 *   await sendProgress({ processed, current_step: "Finalizando" }, true);
 */
export function throttledJobUpdater(
  sbAdmin: SupabaseAdmin,
  jobId: string,
  minIntervalMs = 800,
): (patch: JobPatch, flush?: boolean) => Promise<void> {
  let lastSent = 0;
  let pending: JobPatch | null = null;
  return async (patch: JobPatch, flush = false) => {
    pending = { ...(pending ?? {}), ...patch };
    const now = Date.now();
    if (!flush && now - lastSent < minIntervalMs) return;
    const toSend = pending;
    pending = null;
    lastSent = now;
    await updateJob(sbAdmin, jobId, toSend);
  };
}
