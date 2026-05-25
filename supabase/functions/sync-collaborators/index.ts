// Edge Function: sync-collaborators
//
// Sincroniza colaboradores com api.softcom.cloud em LOTES COMPLETOS:
// cada lote pega N colabs e roda upsert + financials + details neles antes
// de avançar pro próximo. Vantagem sobre processar tudo em 3 fases globais:
// se travar no meio, o lote anterior já está 100% completo no SoftHouse —
// não fica "metade upsertado, metade com financials, nada de details".
//
// ─── Fluxo "fatia + auto-continuação" ──────────────────────────────────────
// 1. Cliente: POST { companyId, includeFinancials?, includeDetails? }
//    → cria sync_job, retorna { jobId } 202, trabalho roda em background
// 2. FASE init: lookups + fetch agenda (paginado) + filtros + cursor inicial
// 3. FASE batches: loop processando BATCH_SIZE colabs em paralelo. Cada
//    colab no batch passa por upsert → (financials) → (details) end-to-end.
// 4. FASE deactivate: marca como inativo quem sumiu da agenda
// 5. Se SLICE_BUDGET_MS esgotar entre batches: persiste cursor + self-invoke
//    com { resumeJobId }. Nova invocação retoma do batchIdx atual.
// 6. Frontend polla sync_jobs até status terminal.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  getColaborador,
  listAdicionais,
  listColaboradores,
  SoftcomCloudError,
} from "../_shared/softcom-cloud.ts";
import type { RemoteColaborador } from "../_shared/softcom-cloud-types.ts";
import { applyFinancials } from "../_shared/apply-financials.ts";
import { applyCollaboratorDetails } from "../_shared/apply-collaborator-details.ts";
import {
  createSyncJob,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  throttledJobUpdater,
  updateJob,
} from "../_shared/sync-job.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGE_SIZE = 50;
const MAX_PAGES = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────
// Tempo máximo por invocação. 4 min é seguro pra Supabase Edge Functions
// (limit teórico ~6 min wall time).
const SLICE_BUDGET_MS = 4 * 60 * 1000;
// Colabs por batch. Cada colab no batch passa por upsert + financials + details
// end-to-end em paralelo com os outros do batch. 5 é MUITO conservador pra não
// estourar o rate limit da agenda (observado HTTP 429 com batch 10+).
const BATCH_SIZE = 5;
// Pausa entre batches pra espacar as rajadas. Junto com o retry com backoff
// no softcom-cloud.ts (2s/4s/8s pra 429/503), dá folga pra agenda recuperar.
const INTER_BATCH_DELAY_MS = 800;
// Watchdog: se um batch demorar mais que isso, aborta esse batch (colabs
// pendentes ficam de fora) e agenda continuação. Protege contra colab lento
// da agenda travando o worker até morrer no limite de 6min do Supabase.
const BATCH_TIMEOUT_MS = 90 * 1000; // 90s por batch
// Limite hard contra loop infinito de continuações.
const MAX_CONTINUATIONS = 50;

// ─────────────────────────────────────────────────────────────────────────────
// TEMP TEST — DESLIGADO em produção (null = sync normal de TODOS os colabs).
// ─────────────────────────────────────────────────────────────────────────────
const TEST_ONLY_COLAB_IDS: number[] | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos do cursor — persistido em sync_jobs.cursor (jsonb)
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "init" | "batches" | "deactivate" | "done";

interface JobOptions {
  companyId: string;
  incluirDesativados: boolean;
  includeFinancials: boolean;
  includeDetails: boolean;
  /** Se true, filtra pendingExtIds pra só colabs que AINDA não têm
   *  payroll_entries com external_id='salario-base'. Útil pra completar
   *  syncs que travaram no meio sem refazer os que já estão prontos. */
  onlyMissingFinancials?: boolean;
  /** Se true, filtra pendingExtIds pra só colabs que AINDA não têm
   *  rows em collaborator_pdvs OU vacation_periods (proxy pra "details
   *  já rodaram"). Útil pra completar syncs que travaram no meio. */
  onlyMissingDetails?: boolean;
}

interface SuccessRef {
  external_id: string;
  name: string;
  action: "inserted" | "updated";
}

interface ErrorRef {
  external_id: string;
  name: string;
  cpf: string | null;
  error: string;
  phase: "upsert" | "financials" | "details";
}

interface FinancialsSummary {
  processed: number;
  salaryCreated: number;
  salaryUpdated: number;
  inssGenerated: number;
  irpfGenerated: number;
  fgtsGenerated: number;
  payrollUpserted: number;
  assignmentsUpserted: number;
  benefitsCreated: number;
  errors: number;
}

interface DetailsSummary {
  processed: number;
  totals: Record<string, number>;
  errors: number;
}

interface JobCursor {
  phase: Phase;
  // Onde está no array pendingExtIds
  batchIdx: number;
  // Contadores acumulados (sobrevivem entre continuações)
  fetched: number;
  toProcess: number;
  inserted: number;
  updated: number;
  deactivated: number;
  skippedNoSalary: number;
  // Snapshot da agenda no momento do fetch (fase init) — usado pra:
  //   • iterar nos batches (pendingExtIds)
  //   • desativar (remoteExtIds vs existentes localmente)
  //   • diferenciar inserted vs updated (existingExtIds)
  remoteExtIds: string[];      // TODOS que vieram da agenda (incluindo sem salário)
  pendingExtIds: string[];     // só os que passaram pelo filtro de salário
  existingExtIds: string[];    // já tinham no SoftHouse (pra contar updated)
  successes: SuccessRef[];
  errors: ErrorRef[];
  financialsSummary: FinancialsSummary;
  detailsSummary: DetailsSummary;
  continuationCount: number;
  options: JobOptions;
}

function newCursor(options: JobOptions): JobCursor {
  return {
    phase: "init",
    batchIdx: 0,
    fetched: 0,
    toProcess: 0,
    inserted: 0,
    updated: 0,
    deactivated: 0,
    skippedNoSalary: 0,
    remoteExtIds: [],
    pendingExtIds: [],
    existingExtIds: [],
    successes: [],
    errors: [],
    financialsSummary: {
      processed: 0, salaryCreated: 0, salaryUpdated: 0,
      inssGenerated: 0, irpfGenerated: 0, fgtsGenerated: 0,
      payrollUpserted: 0, assignmentsUpserted: 0, benefitsCreated: 0,
      errors: 0,
    },
    detailsSummary: {
      processed: 0,
      totals: {
        absences: 0, leaves: 0, emails: 0, internships: 0,
        pdvs: 0, healthPlans: 0, healthPlanDeductions: 0,
        vacations: 0, exams: 0, timelineEvents: 0, dependents: 0,
      },
      errors: 0,
    },
    continuationCount: 0,
    options,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (e) {
    return jsonResponse({ error: "Body JSON inválido: " + (e as Error).message }, 400);
  }

  const resumeJobId = typeof body.resumeJobId === "string" ? body.resumeJobId : null;
  const isInternalResume = resumeJobId !== null && authHeader === `Bearer ${serviceKey}`;

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Modo CONTINUAÇÃO: self-invoke com SERVICE_ROLE bearer
  // ───────────────────────────────────────────────────────────────────────────
  if (isInternalResume) {
    const { data: jobRow, error: loadErr } = await sbAdmin
      .from("sync_jobs")
      .select("id, status, cursor, options")
      .eq("id", resumeJobId)
      .maybeSingle();
    if (loadErr || !jobRow) {
      return jsonResponse({ error: "Job não encontrado: " + (loadErr?.message ?? resumeJobId) }, 404);
    }
    if (jobRow.status !== "running") {
      return jsonResponse({ error: `Job ${resumeJobId} não está running (status=${jobRow.status})` }, 409);
    }
    const cursor = (jobRow.cursor as JobCursor | null) ?? null;
    if (!cursor) {
      return jsonResponse({ error: "Job sem cursor — não pode retomar" }, 400);
    }
    scheduleBackground(() =>
      runJobSlice(sbAdmin, supabaseUrl, serviceKey, resumeJobId, cursor).catch(async (err: Error) => {
        console.error(`sync-collaborators resume ${resumeJobId} crashed:`, err);
        await markJobFailed(sbAdmin, resumeJobId, err.message ?? "Erro na continuação");
      })
    );
    return jsonResponse({ success: true, jobId: resumeJobId, status: "running", resumed: true }, 202);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Modo NOVO: usuário humano
  // ───────────────────────────────────────────────────────────────────────────

  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: "Invalid token" }, 401);

  let companyId: string;
  let incluirDesativados = false;
  let includeFinancials = false;
  let includeDetails = false;
  let onlyMissingFinancials = false;
  let onlyMissingDetails = false;
  try {
    companyId = String(body.companyId ?? "").trim();
    if (!companyId) throw new Error("missing companyId");
    incluirDesativados = Boolean(body.incluirDesativados);
    includeFinancials = Boolean(body.includeFinancials);
    includeDetails = Boolean(body.includeDetails);
    onlyMissingFinancials = Boolean(body.onlyMissingFinancials);
    onlyMissingDetails = Boolean(body.onlyMissingDetails);
  } catch (e) {
    return jsonResponse(
      { error: "Body deve ter { companyId, incluirDesativados?, includeFinancials?, includeDetails?, onlyMissingFinancials?, onlyMissingDetails? }: " + (e as Error).message },
      400,
    );
  }

  const allowed = await checkPermission(sbUser, user.id, companyId, "colaboradores");
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  const options: JobOptions = { companyId, incluirDesativados, includeFinancials, includeDetails, onlyMissingFinancials, onlyMissingDetails };
  const cursor = newCursor(options);

  const jobId = await createSyncJob(sbAdmin, {
    companyId,
    resource: "collaborators",
    options: { incluirDesativados, includeFinancials, includeDetails, onlyMissingFinancials, onlyMissingDetails },
    createdBy: user.id,
    currentStep: "Iniciando sincronização...",
  });
  await updateJob(sbAdmin, jobId, { cursor: cursor as unknown as Record<string, unknown> });

  scheduleBackground(() =>
    runJobSlice(sbAdmin, supabaseUrl, serviceKey, jobId, cursor).catch(async (err: Error) => {
      console.error(`sync-collaborators job ${jobId} crashed:`, err);
      await markJobFailed(sbAdmin, jobId, err.message ?? "Erro desconhecido");
    })
  );

  return jsonResponse({ success: true, jobId, status: "running" }, 202);
});

// ─────────────────────────────────────────────────────────────────────────────
// runJobSlice — uma fatia de trabalho com tempo máximo de SLICE_BUDGET_MS.
// Quando esgota, persiste cursor e auto-invoca pra continuar.
// ─────────────────────────────────────────────────────────────────────────────

async function runJobSlice(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  supabaseUrl: string,
  serviceKey: string,
  jobId: string,
  cursor: JobCursor,
): Promise<void> {
  const sliceStart = Date.now();
  const budgetExpired = () => Date.now() - sliceStart > SLICE_BUDGET_MS;
  const tick = throttledJobUpdater(sbAdmin, jobId, 800);

  if (cursor.continuationCount === 0) {
    await markJobRunning(sbAdmin, jobId, "Carregando lookups...");
  } else {
    await updateJob(sbAdmin, jobId, {
      current_step: `Retomando lote ${Math.floor(cursor.batchIdx / BATCH_SIZE) + 1} (continuação ${cursor.continuationCount})...`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FASE 1: init — lookups, fetch agenda, filtros
  // ───────────────────────────────────────────────────────────────────────────
  if (cursor.phase === "init") {
    try {
      await runInitPhase(sbAdmin, jobId, cursor, tick);
    } catch (err) {
      const msg = err instanceof SoftcomCloudError
        ? `Falha ao ler Softcom Cloud (HTTP ${err.status}): ${err.message}`
        : `Falha na fase inicial: ${(err as Error).message}`;
      await markJobFailed(sbAdmin, jobId, msg);
      return;
    }
    cursor.phase = cursor.pendingExtIds.length > 0 ? "batches" : "deactivate";
    await persistCursor(sbAdmin, jobId, cursor);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FASE 2: batches — processa lotes de BATCH_SIZE colabs end-to-end
  // ───────────────────────────────────────────────────────────────────────────
  if (cursor.phase === "batches") {
    const result = await runBatchesPhase(sbAdmin, jobId, cursor, tick, budgetExpired);
    if (result === "budget_expired") {
      await persistCursor(sbAdmin, jobId, cursor);
      await scheduleContinuation(sbAdmin, supabaseUrl, serviceKey, jobId, cursor);
      return;
    }
    cursor.phase = "deactivate";
    await persistCursor(sbAdmin, jobId, cursor);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FASE 3: deactivate — marca como inativo quem sumiu da agenda
  // ───────────────────────────────────────────────────────────────────────────
  if (cursor.phase === "deactivate") {
    await runDeactivatePhase(sbAdmin, jobId, cursor);
    cursor.phase = "done";
    await persistCursor(sbAdmin, jobId, cursor);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DONE
  // ───────────────────────────────────────────────────────────────────────────
  await tick({}, true);
  await markJobCompleted(sbAdmin, jobId, {
    fetched: cursor.fetched,
    to_process: cursor.toProcess,
    inserted: cursor.inserted,
    updated: cursor.updated,
    deactivated: cursor.deactivated,
    skipped_no_salary: cursor.skippedNoSalary,
    successes_count: cursor.successes.length,
    errors_count: cursor.errors.length,
    errors: cursor.errors.slice(-100), // limita output do result final
    successes: cursor.successes.slice(-100),
    financials: cursor.options.includeFinancials ? cursor.financialsSummary : null,
    details: cursor.options.includeDetails ? cursor.detailsSummary : null,
    continuations: cursor.continuationCount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 1: init — lookups + fetch agenda + filtros
// ─────────────────────────────────────────────────────────────────────────────

async function runInitPhase(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  jobId: string,
  cursor: JobCursor,
  tick: (patch: Record<string, unknown>, flush?: boolean) => Promise<void>,
): Promise<void> {
  const { companyId, incluirDesativados } = cursor.options;

  // Fetch agenda paginado
  await updateJob(sbAdmin, jobId, { current_step: "Buscando colaboradores na agenda..." });
  const remote: RemoteColaborador[] = [];

  if (TEST_ONLY_COLAB_IDS != null && TEST_ONLY_COLAB_IDS.length > 0) {
    for (const id of TEST_ONLY_COLAB_IDS) {
      try {
        remote.push(await getColaborador(id));
      } catch (e) {
        console.warn(`Falha ao buscar colab teste ${id}:`, (e as Error).message);
      }
    }
  } else {
    let page = 1;
    let totalPages = 1;
    do {
      const resp = await listColaboradores({ page, pageSize: PAGE_SIZE, incluirDesativados });
      remote.push(...resp.data);
      totalPages = resp.pagination.totalPages || 1;
      await tick({
        current_step: `Buscando agenda — página ${page}/${totalPages} (${remote.length} colabs)`,
      });
      page++;
    } while (page <= totalPages && page <= MAX_PAGES);
  }

  cursor.fetched = remote.length;
  cursor.remoteExtIds = remote.map((r) => String(r.id));

  // Filtra por salário > 0
  let pending: RemoteColaborador[] = [];
  for (const r of remote) {
    const salary = typeof r.salarioAtual === "number" ? r.salarioAtual : 0;
    if (!(salary > 0)) {
      cursor.skippedNoSalary++;
      continue;
    }
    pending.push(r);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Filtro opcional: onlyMissingFinancials — pula colabs que já têm entry
  // de salário base no banco. Útil pra completar syncs que travaram no meio
  // sem refazer os que já estão prontos.
  // ──────────────────────────────────────────────────────────────────────
  if (cursor.options.onlyMissingFinancials) {
    // Carrega todos os colabs locais com seus IDs + external_ids
    const { data: localCollabs } = await sbAdmin
      .from("collaborators")
      .select("id, external_id")
      .eq("company_id", companyId)
      .not("external_id", "is", null);
    // Carrega quais colabs já têm entry de salário base
    const { data: withSalary } = await sbAdmin
      .from("payroll_entries")
      .select("collaborator_id")
      .eq("company_id", companyId)
      .eq("external_id", "salario-base");
    const withSalaryIds = new Set(
      (withSalary ?? []).map((e: { collaborator_id: string }) => e.collaborator_id),
    );
    const extIdsWithFin = new Set(
      (localCollabs ?? [])
        .filter((c: { id: string }) => withSalaryIds.has(c.id))
        .map((c: { external_id: string }) => c.external_id),
    );
    const beforeFilter = pending.length;
    pending = pending.filter((r) => !extIdsWithFin.has(String(r.id)));
    console.log(
      `onlyMissingFinancials: ${beforeFilter} → ${pending.length} (pulou ${extIdsWithFin.size} já prontos)`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Filtro opcional: onlyMissingDetails — pula colabs que já têm rows
  // em collaborator_pdvs OU vacation_periods (proxy: details já rodaram).
  // ──────────────────────────────────────────────────────────────────────
  if (cursor.options.onlyMissingDetails) {
    const { data: localCollabs } = await sbAdmin
      .from("collaborators")
      .select("id, external_id")
      .eq("company_id", companyId)
      .not("external_id", "is", null);
    // Pega collaborator_ids que aparecem em pdvs OU vacation_periods
    const [{ data: withPdvs }, { data: withVacs }] = await Promise.all([
      sbAdmin
        .from("collaborator_pdvs")
        .select("collaborator_id")
        .eq("company_id", companyId),
      sbAdmin
        .from("vacation_periods")
        .select("collaborator_id")
        .eq("company_id", companyId),
    ]);
    const withDetIds = new Set<string>();
    for (const r of (withPdvs ?? []) as { collaborator_id: string }[]) {
      withDetIds.add(r.collaborator_id);
    }
    for (const r of (withVacs ?? []) as { collaborator_id: string }[]) {
      withDetIds.add(r.collaborator_id);
    }
    const extIdsWithDet = new Set(
      (localCollabs ?? [])
        .filter((c: { id: string }) => withDetIds.has(c.id))
        .map((c: { external_id: string }) => c.external_id),
    );
    const beforeFilter = pending.length;
    pending = pending.filter((r) => !extIdsWithDet.has(String(r.id)));
    console.log(
      `onlyMissingDetails: ${beforeFilter} → ${pending.length} (pulou ${extIdsWithDet.size} já prontos)`,
    );
  }

  cursor.pendingExtIds = pending.map((r) => String(r.id));
  cursor.toProcess = pending.length;

  // Carrega quem já existe localmente pra distinguir inserted vs updated
  const existing = await loadExistingCollaborators(sbAdmin, companyId);
  cursor.existingExtIds = Array.from(existing.keys());

  await updateJob(sbAdmin, jobId, {
    total: cursor.toProcess,
    processed: 0,
    current_step: `${cursor.toProcess} pra processar (${cursor.skippedNoSalary} ignorados sem salário) — iniciando lotes de ${BATCH_SIZE}...`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 2: batches — processa lotes de BATCH_SIZE colabs end-to-end
// Cada colab passa por: upsert → financials (se opt-in) → details (se opt-in)
// ─────────────────────────────────────────────────────────────────────────────

async function runBatchesPhase(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  jobId: string,
  cursor: JobCursor,
  tick: (patch: Record<string, unknown>, flush?: boolean) => Promise<void>,
  budgetExpired: () => boolean,
): Promise<"completed" | "budget_expired"> {
  const { companyId, includeFinancials, includeDetails } = cursor.options;
  const total = cursor.toProcess;

  const [storesMap, teamsMap, positionsMap] = await Promise.all([
    loadExternalIdMap(sbAdmin, "stores", companyId),
    loadExternalIdMap(sbAdmin, "teams", companyId),
    loadExternalIdMap(sbAdmin, "positions", companyId),
  ]);
  const existingExtIdsSet = new Set(cursor.existingExtIds);

  while (cursor.batchIdx < total) {
    if (budgetExpired()) return "budget_expired";

    const batchNum = Math.floor(cursor.batchIdx / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);
    const batchExtIds = cursor.pendingExtIds.slice(cursor.batchIdx, cursor.batchIdx + BATCH_SIZE);

    await tick({
      current_step: `Lote ${batchNum}/${totalBatches}: processando ${batchExtIds.length} colabs...`,
    });

    // ─── Watchdog: aborta batch se ultrapassar BATCH_TIMEOUT_MS ───
    // Sem isso, um colab travado na agenda segura o batch inteiro até o
    // worker morrer no limite do Supabase (~6min). Resultado: nunca consegue
    // agendar continuação. Com watchdog: aborta o batch, marca incompletos
    // como pending (cursor não avança esses), agenda continuação que retoma.
    const batchPromise = runOneBatch({
      sbAdmin, cursor, batchExtIds, batchNum, totalBatches,
      companyId, storesMap, teamsMap, positionsMap, existingExtIdsSet,
      includeFinancials, includeDetails,
      onColabDone: async (doneCount) => {
        // Tick a cada colab terminado (não só ao fim do batch) — feedback ao vivo.
        await tick({
          processed: cursor.batchIdx + doneCount,
          total,
          inserted: cursor.inserted,
          updated: cursor.updated,
          current_step: `Lote ${batchNum}/${totalBatches}: ${doneCount}/${batchExtIds.length} colabs do lote prontos (${cursor.batchIdx + doneCount}/${total} geral)`,
        });
      },
    });

    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), BATCH_TIMEOUT_MS)
    );

    const result = await Promise.race([batchPromise, timeoutPromise]);

    if (result === "timeout") {
      // Watchdog disparou — batch demorou demais. Marca colabs do batch que
      // NÃO conseguiram terminar como pending (vão ser refeitos na próxima
      // continuação). Os que terminaram já tiveram cursor mutado.
      console.warn(`Batch ${batchNum} timeout (${BATCH_TIMEOUT_MS}ms) — abortando`);
      await tick({
        current_step: `⚠ Lote ${batchNum} demorou demais (>${BATCH_TIMEOUT_MS / 1000}s) — agendando continuação...`,
      });
      // Avança batchIdx até onde processOneColabEndToEnd conseguiu (rastreado
      // via successes/errors no cursor). Como Promise.race não cancela o
      // batchPromise, ele continua rodando em background até dar erro/timeout
      // do HTTP — mas como o resultado já vem por mutação do cursor (não
      // pelo return), os colabs que terminarem ainda serão contados na
      // próxima invocação.
      await persistCursor(sbAdmin, jobId, cursor);
      return "budget_expired";
    }

    // Batch terminou no tempo
    cursor.batchIdx += batchExtIds.length;
    await tick({
      processed: cursor.batchIdx,
      total,
      inserted: cursor.inserted,
      updated: cursor.updated,
      current_step: `Lote ${batchNum}/${totalBatches} concluído — ${cursor.batchIdx}/${total} colabs prontos`,
    });
    await persistCursor(sbAdmin, jobId, cursor);

    // Pausa antes do próximo batch pra dar folga pra agenda (evita 429)
    if (cursor.batchIdx < total) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  return "completed";
}

/**
 * Roda 1 batch em paralelo, com callback `onColabDone` chamado a cada colab
 * terminado pra dar feedback ao vivo (sem esperar batch inteiro).
 */
async function runOneBatch(args: {
  // deno-lint-ignore no-explicit-any
  sbAdmin: any;
  cursor: JobCursor;
  batchExtIds: string[];
  batchNum: number;
  totalBatches: number;
  companyId: string;
  storesMap: Map<string, string>;
  teamsMap: Map<string, string>;
  positionsMap: Map<string, string>;
  existingExtIdsSet: Set<string>;
  includeFinancials: boolean;
  includeDetails: boolean;
  onColabDone: (doneCount: number) => Promise<void>;
}): Promise<"done"> {
  const {
    sbAdmin, cursor, batchExtIds, companyId, storesMap, teamsMap, positionsMap,
    existingExtIdsSet, includeFinancials, includeDetails, onColabDone,
  } = args;

  let doneCount = 0;
  await Promise.allSettled(
    batchExtIds.map(async (extId) => {
      await processOneColabEndToEnd(sbAdmin, cursor, {
        extId, companyId, storesMap, teamsMap, positionsMap,
        existingExtIdsSet, includeFinancials, includeDetails,
      });
      doneCount++;
      try {
        await onColabDone(doneCount);
      } catch { /* tick falhou — não bloqueia o batch */ }
    }),
  );
  return "done";
}

// ─────────────────────────────────────────────────────────────────────────────
// Processa UM colaborador end-to-end: fetch da agenda + upsert + financials +
// details. Atualiza contadores no cursor (mutável). Erros vão pra cursor.errors
// com a phase onde falhou.
// ─────────────────────────────────────────────────────────────────────────────

async function processOneColabEndToEnd(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  cursor: JobCursor,
  ctx: {
    extId: string;
    companyId: string;
    storesMap: Map<string, string>;
    teamsMap: Map<string, string>;
    positionsMap: Map<string, string>;
    existingExtIdsSet: Set<string>;
    includeFinancials: boolean;
    includeDetails: boolean;
  },
): Promise<void> {
  const { extId, companyId, storesMap, teamsMap, positionsMap, existingExtIdsSet, includeFinancials, includeDetails } = ctx;

  // Fetch fresh data da agenda (mais lento mas garante dados atuais e cabe no batch)
  let remote: RemoteColaborador;
  try {
    remote = await getColaborador(Number(extId));
  } catch (e) {
    cursor.errors.push({
      external_id: extId, name: `Colab ${extId}`, cpf: null,
      phase: "upsert", error: `Fetch agenda: ${(e as Error).message}`,
    });
    return;
  }

  const displayName = (remote.nome ?? remote.nomeSuporte ?? `Colab ${extId}`).toString().trim();
  const cpf = remote.cpf ? String(remote.cpf).replace(/\D/g, "") : null;

  // ─── Upsert do colab ───
  let row: Record<string, unknown>;
  try {
    row = mapColaboradorToRow(remote, companyId, storesMap, teamsMap, positionsMap);
  } catch (e) {
    cursor.errors.push({
      external_id: extId, name: displayName, cpf,
      phase: "upsert", error: (e as Error).message,
    });
    return;
  }

  const { data: upData, error: upErr } = await sbAdmin
    .from("collaborators")
    .upsert(row, { onConflict: "company_id,external_id", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();

  if (upErr) {
    const friendlyError = upErr.message.includes("cpf_company_id")
      ? `CPF ${cpf ?? "—"} já cadastrado em outro colaborador desta empresa`
      : upErr.message.includes("not-null") && upErr.message.includes("cpf")
      ? `CPF vazio — aplique a migration cpf_nullable (npx supabase db push)`
      : upErr.message;
    cursor.errors.push({
      external_id: extId, name: displayName, cpf,
      phase: "upsert", error: friendlyError,
    });
    return;
  }
  if (!upData?.id) {
    cursor.errors.push({
      external_id: extId, name: displayName, cpf,
      phase: "upsert", error: "Upsert retornou sem id",
    });
    return;
  }

  const collaboratorId = upData.id as string;
  const action = existingExtIdsSet.has(extId) ? "updated" : "inserted";
  if (action === "updated") cursor.updated++; else cursor.inserted++;
  cursor.successes.push({ external_id: extId, name: displayName, action });

  // ─── Financials (opt-in) ───
  if (includeFinancials) {
    try {
      const adicionais = await listAdicionais(extId);
      const fin = await applyFinancials(sbAdmin, {
        companyId,
        collaboratorId,
        storeId: (row.store_id as string | null) ?? null,
        currentSalary: (row.current_salary as number | null) ?? null,
        adicionais,
      });
      const fs = cursor.financialsSummary;
      fs.processed++;
      if (fin.salaryEntry.created) fs.salaryCreated++;
      if (fin.salaryEntry.updated) fs.salaryUpdated++;
      if (fin.taxEntries.inss.created || fin.taxEntries.inss.updated) fs.inssGenerated++;
      if (fin.taxEntries.irpf.created || fin.taxEntries.irpf.updated) fs.irpfGenerated++;
      if (fin.taxEntries.fgts.created || fin.taxEntries.fgts.updated) fs.fgtsGenerated++;
      fs.payrollUpserted += fin.payrollEntries.upserted;
      fs.assignmentsUpserted += fin.benefitsAssignments.upserted;
      fs.benefitsCreated += fin.benefitsAssignments.benefitsCreated;
      fs.errors += fin.errors.length;
      for (const fe of fin.errors.slice(0, 3)) {
        cursor.errors.push({
          external_id: extId, name: displayName, cpf,
          phase: "financials", error: `${fe.tipo}: ${fe.error}`,
        });
      }
    } catch (e) {
      cursor.financialsSummary.errors++;
      cursor.errors.push({
        external_id: extId, name: displayName, cpf,
        phase: "financials", error: (e as Error).message,
      });
    }
  }

  // ─── Details (opt-in) ───
  if (includeDetails) {
    try {
      const det = await applyCollaboratorDetails(sbAdmin, {
        companyId, collaboratorId, remoteId: extId,
      });
      const ds = cursor.detailsSummary;
      ds.processed++;
      for (const [kind, result] of Object.entries(det)) {
        ds.totals[kind] = (ds.totals[kind] ?? 0) + (result as { upserted: number }).upserted;
        const err = (result as { error?: string }).error;
        if (err) {
          ds.errors++;
          cursor.errors.push({
            external_id: extId, name: displayName, cpf,
            phase: "details", error: `${kind}: ${err}`,
          });
        }
      }
    } catch (e) {
      cursor.detailsSummary.errors++;
      cursor.errors.push({
        external_id: extId, name: displayName, cpf,
        phase: "details", error: (e as Error).message,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 3: deactivate — marca como inativo quem sumiu da agenda
// ─────────────────────────────────────────────────────────────────────────────

async function runDeactivatePhase(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  jobId: string,
  cursor: JobCursor,
): Promise<void> {
  if (TEST_ONLY_COLAB_IDS != null && TEST_ONLY_COLAB_IDS.length > 0) {
    return; // Skip defensivo no modo teste
  }

  await updateJob(sbAdmin, jobId, { current_step: "Verificando colabs que sumiram da agenda..." });

  const existing = await loadExistingCollaborators(sbAdmin, cursor.options.companyId);
  const remoteSet = new Set(cursor.remoteExtIds);
  const idsToDeactivate: string[] = [];
  for (const [extId, info] of existing) {
    if (!remoteSet.has(extId) && info.status === "ativo") {
      idsToDeactivate.push(info.id);
    }
  }

  if (idsToDeactivate.length > 0) {
    await updateJob(sbAdmin, jobId, {
      current_step: `Desativando ${idsToDeactivate.length} colab(s) ausentes da agenda...`,
    });
    const { error: deactErr } = await sbAdmin
      .from("collaborators")
      .update({ status: "inativo" })
      .in("id", idsToDeactivate);
    if (deactErr) {
      throw new Error(`Desativação falhou: ${deactErr.message}`);
    }
    cursor.deactivated = idsToDeactivate.length;
    await updateJob(sbAdmin, jobId, { deactivated: cursor.deactivated });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-continuação: fetch self-invoke com service_role + resumeJobId
// ─────────────────────────────────────────────────────────────────────────────

async function scheduleContinuation(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  supabaseUrl: string,
  serviceKey: string,
  jobId: string,
  cursor: JobCursor,
): Promise<void> {
  cursor.continuationCount++;
  if (cursor.continuationCount > MAX_CONTINUATIONS) {
    await markJobFailed(
      sbAdmin,
      jobId,
      `Limite de ${MAX_CONTINUATIONS} continuações atingido — job parou em batch ${Math.floor(cursor.batchIdx / BATCH_SIZE) + 1}`,
    );
    return;
  }
  await persistCursor(sbAdmin, jobId, cursor);
  await updateJob(sbAdmin, jobId, {
    current_step: `Disparando continuação ${cursor.continuationCount}/${MAX_CONTINUATIONS} (lote ${Math.floor(cursor.batchIdx / BATCH_SIZE) + 1})...`,
  });

  const url = `${supabaseUrl}/functions/v1/sync-collaborators`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resumeJobId: jobId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "<no body>");
      console.error(`Self-invoke failed HTTP ${resp.status}: ${text}`);
      await markJobFailed(
        sbAdmin, jobId,
        `Auto-continuação falhou: HTTP ${resp.status}. ${text.slice(0, 300)}`,
      );
    } else {
      console.log(`Self-invoke OK pra job ${jobId}, continuação ${cursor.continuationCount}`);
    }
  } catch (e) {
    clearTimeout(timeoutId);
    const errMsg = (e as Error).message;
    console.error(`Self-invoke threw: ${errMsg}`);
    await markJobFailed(
      sbAdmin, jobId,
      `Auto-continuação não pôde ser disparada: ${errMsg}. Job parou em batch ${Math.floor(cursor.batchIdx / BATCH_SIZE) + 1}. Rode Sincronizar pra retomar.`,
    );
  }
}

async function persistCursor(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  jobId: string,
  cursor: JobCursor,
): Promise<void> {
  await updateJob(sbAdmin, jobId, {
    cursor: cursor as unknown as Record<string, unknown>,
  });
}

function scheduleBackground(fn: () => Promise<unknown>): void {
  // deno-lint-ignore no-explicit-any
  const ert = (globalThis as any).EdgeRuntime as
    | { waitUntil?: (p: Promise<unknown>) => void }
    | undefined;
  const p = fn();
  if (ert?.waitUntil) ert.waitUntil(p);
  else void p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function loadExternalIdMap(sbAdmin: any, table: string, companyId: string): Promise<Map<string, string>> {
  const { data, error } = await sbAdmin
    .from(table)
    .select("id, external_id")
    .eq("company_id", companyId)
    .not("external_id", "is", null);
  if (error) throw new Error(`Falha lendo ${table}: ${error.message}`);
  return new Map((data ?? []).map((r: { id: string; external_id: string }) => [r.external_id, r.id]));
}

async function loadExistingCollaborators(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  companyId: string,
): Promise<Map<string, { id: string; status: string }>> {
  const { data, error } = await sbAdmin
    .from("collaborators")
    .select("id, external_id, status")
    .eq("company_id", companyId)
    .not("external_id", "is", null);
  if (error) throw new Error(`Falha lendo collaborators: ${error.message}`);
  return new Map(
    (data ?? []).map((c: { id: string; external_id: string; status: string }) => [
      c.external_id,
      { id: c.id, status: c.status },
    ]),
  );
}

function mapColaboradorToRow(
  r: RemoteColaborador,
  companyId: string,
  stores: Map<string, string>,
  teams: Map<string, string>,
  positions: Map<string, string>,
): Record<string, unknown> {
  const storeId = r.empresa != null ? stores.get(String(r.empresa)) ?? null : null;
  const teamId = r.setor != null ? teams.get(String(r.setor)) ?? null : null;
  const positionId = r.cargoId != null ? positions.get(String(r.cargoId)) ?? null : null;
  const contractedStoreId =
    r.empresaContratada != null ? stores.get(String(r.empresaContratada)) ?? null : null;

  // CPF: aceita vazio. Migration 20260525143000 tornou a coluna nullable.
  const cpfRaw = r.cpf ? String(r.cpf).replace(/\D/g, "") : "";
  const cpf = cpfRaw.length > 0 ? cpfRaw : null;
  const name = (r.nome ?? r.nomeSuporte ?? `Colab ${r.id}`).trim();

  return {
    company_id: companyId,
    external_id: String(r.id),
    name,
    cpf,
    rg: r.rg ?? null,
    rg_issuer: r.rgOrgao ?? null,
    email: r.email ?? null,
    phone: r.telefones ?? null,
    recado_phone: r.telefones2 ?? null,
    birth_date: parseDate(r.dataNascimento),
    gender: r.sexo === "M" || r.sexo === "F" ? r.sexo : null,
    ethnicity: r.etnia ?? null,
    education_level: r.escolaridade ?? null,
    pis: r.pis ?? null,
    pix_key: r.contaPix ?? null,
    discord_id: r.discordId ?? null,
    discord_username: r.usuarioDiscord ?? null,
    softcom_surname: r.nomeSuporte ?? null,
    support_username: r.nomeSuporte ?? null,
    internal_code: String(r.id),
    address: r.endereco ?? null,
    district: r.bairro ?? null,
    city: r.cidade ?? null,
    state: r.uf ?? null,
    postal_code: r.cep ?? null,
    phone_extension: r.ramalFixo ?? null,
    radios_freeform: r.ramais ?? null,
    store_id: storeId,
    team_id: teamId,
    position_id: positionId,
    contracted_store_id: contractedStoreId,
    contracted_cnpj: r.cnpjContratado ?? null,
    internal_location: r.local ?? null,
    subsector: r.subsetor ?? null,
    agenda: r.agenda ?? null,
    indicator_group: r.grupoIndicador ?? null,
    sales_group: r.grupoVendas ?? null,
    is_homeoffice: Boolean(r.homeoffice),
    has_agenda_access: Boolean(r.possuiAgenda),
    admission_date: parseDate(r.dataAdmissao),
    termination_date: parseDate(r.dataDemissao),
    inspira_date: parseDate(r.inspiraData),
    inspira_value: typeof r.inspiraValor === "number" ? r.inspiraValor : null,
    current_salary: typeof r.salarioAtual === "number" ? r.salarioAtual : null,
    accounting_code: r.codigoContador != null ? String(r.codigoContador) : null,
    regime: mapRegime(r.tipoFuncionario),
    status: r.desativado === true ? "inativo" : "ativo",
    is_pcd: Boolean(r.pcd),
    is_apprentice: Boolean(r.jovemAprendiz),
    ctps: r.ctps ?? null,
    ctps_series: r.ctpsSerie ?? null,
    ctps_uf: r.ctpsUf ?? null,
    bank_account: r.conta ?? null,
    commission_monthly: numOrNull(r.comissaoMensal),
    commission_license: numOrNull(r.comissaoLicenca),
    commission_upgrade: numOrNull(r.comissaoUpgrade),
    commission_tef_install: numOrNull(r.comissaoTefInstalacao),
    commission_tef_monthly: numOrNull(r.comissaoTefMensal),
    is_manager_leader: Boolean(r.gerenteLider),
    is_manager_director: Boolean(r.gerenteDiretor),
    is_manager_support: Boolean(r.gerenteApoio),
    is_godfather: Boolean(r.padrinho),
  };
}

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function numOrNull(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function mapRegime(tipo: string | null | undefined): string {
  if (!tipo) return "clt";
  const norm = String(tipo).toLowerCase();
  if (norm.includes("estag")) return "estagiario";
  if (norm.includes("pj")) return "pj";
  return "clt";
}

async function checkPermission(
  // deno-lint-ignore no-explicit-any
  sbUser: any,
  userId: string,
  companyId: string,
  module: string,
): Promise<boolean> {
  const { data: isAdmin } = await sbUser.rpc("is_company_admin", {
    _user_id: userId,
    _company_id: companyId,
  });
  if (isAdmin === true) return true;
  const { data: perms } = await sbUser.rpc("get_user_permissions", {
    _user_id: userId,
    _company_id: companyId,
    _module: module,
  });
  const first = Array.isArray(perms) ? perms[0] : perms;
  return Boolean(first?.can_create);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
