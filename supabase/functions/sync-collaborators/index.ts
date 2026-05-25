// Edge Function: sync-collaborators
//
// Sincroniza colaboradores principais (sem sub-abas) com api.softcom.cloud.
// Pagina internamente. Pra sincronizar sub-abas de um colaborador
// específico (ferias, 13, exames, parentes, eventos, etc.), use
// `sync-collaborator-details` com o ID dele.
//
// ─── Fluxo "fatia + auto-continuação" ──────────────────────────────────────
// 1. Cliente: POST { companyId, includeFinancials?, includeDetails? }
//    → cria sync_job, retorna { jobId } 202, trabalho roda em background
// 2. Background: trabalha em FATIAS de até 4 min (SLICE_BUDGET_MS) pra
//    caber bem dentro do limite Supabase (~6 min wall time).
// 3. Cada fatia respeita cursor.phase: init → financials → details → done.
//    Financials e details são paralelizados (chunks de 8 / 4 colabs).
// 4. Se o budget esgotar antes de done, persiste o cursor e auto-invoca
//    a si mesma via fetch (Authorization: Bearer SERVICE_ROLE) passando
//    { resumeJobId }. Nova invocação lê o cursor e continua.
// 5. Frontend polla sync_jobs até status terminal (completed/failed).
//
// Estratégia espelho 100% por external_id, idêntica a sync-stores/teams/positions.
// Lookups pré-carregados pra resolver setor/cargo/empresa via mapa em memória
// (evita N+1).

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
// Tunables do "fatia + auto-continuação"
// ─────────────────────────────────────────────────────────────────────────────
// Tempo máximo por invocação. 4 min é seguro pra Supabase Edge Functions
// (limit teórico ~6 min wall time / 400s CPU).
const SLICE_BUDGET_MS = 4 * 60 * 1000;
// Paralelização em fases N+1 contra a agenda. Conservador pra não saturar a
// API legada nem o pool de conexões do Postgres.
const FINANCIALS_CONCURRENCY = 8;
const DETAILS_CONCURRENCY = 4; // details = 9 HTTP requests por colab
// Persiste cursor a cada N colabs processados (chunk-size do tick + cursor).
const CURSOR_PERSIST_EVERY = 8;
// Limite hard contra loop infinito de continuações.
const MAX_CONTINUATIONS = 25;

// ─────────────────────────────────────────────────────────────────────────────
// TEMP TEST — DESLIGADO em produção (null = sync normal de TODOS os colabs).
// Pra debugar: troca null por [384, 816, ...] e a sync vai processar SÓ
// esses colabs. Útil pra rodar o fluxo do início ao fim sem mexer nos
// outros 299.
// ─────────────────────────────────────────────────────────────────────────────
const TEST_ONLY_COLAB_IDS: number[] | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos do cursor — persistido em sync_jobs.cursor (jsonb)
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "init" | "financials" | "details" | "done";

interface JobOptions {
  companyId: string;
  incluirDesativados: boolean;
  includeFinancials: boolean;
  includeDetails: boolean;
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
  errorDetails: Array<{ collaboratorName: string; external_id: string; tipo: string; error: string }>;
}

interface DetailsSummary {
  processed: number;
  totals: Record<string, number>;
  errors: number;
  errorDetails: Array<{ collaboratorName: string; kind: string; error: string }>;
}

interface JobCursor {
  phase: Phase;
  // Contadores acumulados (sobrevivem entre continuações)
  fetched: number;
  inserted: number;
  updated: number;
  deactivated: number;
  // Filtrados por regra de negócio (ex: sem salário) — não são erro, é skip intencional
  skippedNoSalary: number;
  // Lista de quem foi upsertado com sucesso — base pras fases seguintes
  successes: SuccessRef[];
  errors: ErrorRef[];
  // Índice de onde retomar em financials/details
  financialsIdx: number;
  detailsIdx: number;
  // Sumários acumulados das fases opt-in
  financialsSummary: FinancialsSummary | null;
  detailsSummary: DetailsSummary | null;
  // Quantas vezes esta job já foi continuada
  continuationCount: number;
  options: JobOptions;
}

function newCursor(options: JobOptions): JobCursor {
  return {
    phase: "init",
    fetched: 0,
    inserted: 0,
    updated: 0,
    deactivated: 0,
    skippedNoSalary: 0,
    successes: [],
    errors: [],
    financialsIdx: 0,
    detailsIdx: 0,
    financialsSummary: null,
    detailsSummary: null,
    continuationCount: 0,
    options,
  };
}

function newFinancialsSummary(): FinancialsSummary {
  return {
    processed: 0, salaryCreated: 0, salaryUpdated: 0,
    inssGenerated: 0, irpfGenerated: 0, fgtsGenerated: 0,
    payrollUpserted: 0, assignmentsUpserted: 0, benefitsCreated: 0,
    errors: 0, errorDetails: [],
  };
}

function newDetailsSummary(): DetailsSummary {
  return {
    processed: 0,
    totals: {
      absences: 0, leaves: 0, emails: 0, internships: 0,
      pdvs: 0, healthPlans: 0, healthPlanDeductions: 0,
      vacations: 0, exams: 0, timelineEvents: 0,
    },
    errors: 0, errorDetails: [],
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

  // Parse body (resume vs novo)
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
  // Modo CONTINUAÇÃO: self-invoke com Authorization: Bearer SERVICE_ROLE
  // ───────────────────────────────────────────────────────────────────────────
  if (isInternalResume) {
    // Carrega o job + cursor
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
    // Background continua
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
  try {
    companyId = String(body.companyId ?? "").trim();
    if (!companyId) throw new Error("missing companyId");
    incluirDesativados = Boolean(body.incluirDesativados);
    includeFinancials = Boolean(body.includeFinancials);
    includeDetails = Boolean(body.includeDetails);
  } catch (e) {
    return jsonResponse(
      { error: "Body deve ter { companyId, incluirDesativados?, includeFinancials?, includeDetails? }: " + (e as Error).message },
      400,
    );
  }

  const allowed = await checkPermission(sbUser, user.id, companyId, "colaboradores");
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  const options: JobOptions = { companyId, incluirDesativados, includeFinancials, includeDetails };
  const cursor = newCursor(options);

  // Cria job + grava cursor inicial
  const jobId = await createSyncJob(sbAdmin, {
    companyId,
    resource: "collaborators",
    options: { incluirDesativados, includeFinancials, includeDetails },
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
    await markJobRunning(sbAdmin, jobId, "Carregando lookups (empresas/setores/cargos)...");
  } else {
    await updateJob(sbAdmin, jobId, {
      current_step: `Retomando (continuação ${cursor.continuationCount})...`,
    });
  }

  const { companyId, incluirDesativados, includeFinancials, includeDetails } = cursor.options;

  // ───────────────────────────────────────────────────────────────────────────
  // FASE 1: init — lookup, fetch agenda, diff, upsert, deactivate
  // (executa só na primeira invocação. Geralmente cabe bem dentro do budget.)
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

    // Decide próxima fase
    if (includeFinancials && cursor.successes.length > 0) {
      cursor.phase = "financials";
      cursor.financialsSummary = newFinancialsSummary();
      // Reseta barra pra refletir progresso da NOVA fase (não fica preso
      // no contador da fase 1)
      await updateJob(sbAdmin, jobId, {
        processed: 0,
        total: cursor.successes.length,
        current_step: `Iniciando financeiros (${cursor.successes.length} colabs)...`,
      });
    } else if (includeDetails && cursor.successes.length > 0) {
      cursor.phase = "details";
      cursor.detailsSummary = newDetailsSummary();
      await updateJob(sbAdmin, jobId, {
        processed: 0,
        total: cursor.successes.length,
        current_step: `Iniciando detalhes (${cursor.successes.length} colabs)...`,
      });
    } else {
      cursor.phase = "done";
    }
    await persistCursor(sbAdmin, jobId, cursor);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FASE 2: financials (opt-in, paralelizado em chunks)
  // ───────────────────────────────────────────────────────────────────────────
  if (cursor.phase === "financials") {
    if (!cursor.financialsSummary) cursor.financialsSummary = newFinancialsSummary();

    const result = await runFinancialsPhase(
      sbAdmin, jobId, cursor, tick, budgetExpired,
    );

    if (result === "budget_expired") {
      await persistCursor(sbAdmin, jobId, cursor);
      await scheduleContinuation(sbAdmin, supabaseUrl, serviceKey, jobId, cursor);
      return;
    }
    // Concluído
    if (includeDetails && cursor.successes.length > 0) {
      cursor.phase = "details";
      cursor.detailsSummary = newDetailsSummary();
      await updateJob(sbAdmin, jobId, {
        processed: 0,
        total: cursor.successes.length,
        current_step: `Iniciando detalhes (${cursor.successes.length} colabs)...`,
      });
    } else {
      cursor.phase = "done";
    }
    await persistCursor(sbAdmin, jobId, cursor);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FASE 3: details (opt-in, paralelizado)
  // ───────────────────────────────────────────────────────────────────────────
  if (cursor.phase === "details") {
    if (!cursor.detailsSummary) cursor.detailsSummary = newDetailsSummary();

    const result = await runDetailsPhase(
      sbAdmin, jobId, cursor, tick, budgetExpired,
    );

    if (result === "budget_expired") {
      await persistCursor(sbAdmin, jobId, cursor);
      await scheduleContinuation(sbAdmin, supabaseUrl, serviceKey, jobId, cursor);
      return;
    }
    cursor.phase = "done";
    await persistCursor(sbAdmin, jobId, cursor);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DONE
  // ───────────────────────────────────────────────────────────────────────────
  await tick({}, true);
  await markJobCompleted(sbAdmin, jobId, {
    fetched: cursor.fetched,
    inserted: cursor.inserted,
    updated: cursor.updated,
    deactivated: cursor.deactivated,
    skipped_no_salary: cursor.skippedNoSalary,
    successes_count: cursor.successes.length,
    errors_count: cursor.errors.length,
    errors: cursor.errors,
    successes: cursor.successes,
    financials: cursor.financialsSummary,
    details: cursor.detailsSummary,
    continuations: cursor.continuationCount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 1: init (lookups, fetch agenda, diff, upsert, deactivate)
// ─────────────────────────────────────────────────────────────────────────────

async function runInitPhase(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  jobId: string,
  cursor: JobCursor,
  tick: (patch: Record<string, unknown>, flush?: boolean) => Promise<void>,
): Promise<void> {
  const { companyId, incluirDesativados } = cursor.options;

  // 1. Lookups
  const [storesMap, teamsMap, positionsMap, existingCollabs] = await Promise.all([
    loadExternalIdMap(sbAdmin, "stores", companyId),
    loadExternalIdMap(sbAdmin, "teams", companyId),
    loadExternalIdMap(sbAdmin, "positions", companyId),
    loadExistingCollaborators(sbAdmin, companyId),
  ]);

  // 2. Fetch agenda (paginado)
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
        total: resp.pagination.total ?? remote.length,
      });
      page++;
    } while (page <= totalPages && page <= MAX_PAGES);
  }

  cursor.fetched = remote.length;
  await updateJob(sbAdmin, jobId, {
    total: remote.length,
    current_step: `Preparando upsert de ${remote.length} colaboradores...`,
  });

  // 3. Diff + upsert
  // IMPORTANTE: remoteExtIds inclui TODOS os colabs vindos da agenda (mesmo
  // sem salário). Isso garante que colabs filtrados aqui não sejam marcados
  // como "desativados" abaixo — eles AINDA existem na agenda, só não têm
  // salário cadastrado ainda. Desativação só dispara pra quem realmente
  // sumiu do retorno da agenda.
  const remoteExtIds = new Set(remote.map((r) => String(r.id)));
  const rowsToUpsert: Record<string, unknown>[] = [];
  const rowMetaByExt = new Map<string, { name: string; cpf: string | null }>();

  for (const r of remote) {
    const displayName = (r.nome ?? r.nomeSuporte ?? `Colab ${r.id}`).toString().trim();

    // ──────────────────────────────────────────────────────────────────────
    // Filtro: pula colabs sem salário cadastrado (lixo da agenda — registros
    // incompletos, testes antigos, etc). Decisão do user pra evitar importar
    // dados inúteis. Não conta como erro — é skip intencional.
    // ──────────────────────────────────────────────────────────────────────
    const salary = typeof r.salarioAtual === "number" ? r.salarioAtual : 0;
    if (!(salary > 0)) {
      cursor.skippedNoSalary++;
      continue;
    }

    try {
      const row = mapColaboradorToRow(r, companyId, storesMap, teamsMap, positionsMap);
      rowsToUpsert.push(row);
      rowMetaByExt.set(String(r.id), { name: displayName, cpf: r.cpf ?? null });
    } catch (e) {
      cursor.errors.push({
        external_id: String(r.id),
        name: displayName,
        cpf: r.cpf ?? null,
        error: (e as Error).message,
      });
    }
  }

  if (cursor.skippedNoSalary > 0) {
    await updateJob(sbAdmin, jobId, {
      current_step: `${rowsToUpsert.length} pra processar (${cursor.skippedNoSalary} ignorados — sem salário)`,
    });
  }

  let processed = 0;
  if (rowsToUpsert.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
      const chunk = rowsToUpsert.slice(i, i + chunkSize);
      const { data: upsertData, error: upErr } = await sbAdmin
        .from("collaborators")
        .upsert(chunk, { onConflict: "company_id,external_id", ignoreDuplicates: false })
        .select("external_id");

      if (upErr) {
        // Tenta linha-a-linha pra reportar quais falharam
        for (const row of chunk) {
          const extId = String(row.external_id);
          const meta = rowMetaByExt.get(extId);
          const { data: singleData, error: singleErr } = await sbAdmin
            .from("collaborators")
            .upsert(row, { onConflict: "company_id,external_id", ignoreDuplicates: false })
            .select("external_id")
            .maybeSingle();
          if (singleErr) {
            // Mensagem amigável pra erro de CPF duplicado (caso clássico:
            // existe outro colab local com mesmo CPF mas external_id diferente)
            const friendlyError = singleErr.message.includes("cpf_company_id")
              ? `CPF ${row.cpf ?? "—"} já cadastrado em outro colaborador desta empresa`
              : singleErr.message;
            cursor.errors.push({
              external_id: extId,
              name: meta?.name ?? `Colab ${extId}`,
              cpf: meta?.cpf ?? null,
              error: friendlyError,
            });
          } else if (singleData) {
            const action = existingCollabs.has(extId) ? "updated" : "inserted";
            if (action === "updated") cursor.updated++; else cursor.inserted++;
            cursor.successes.push({ external_id: extId, name: meta?.name ?? `Colab ${extId}`, action });
          }
          processed++;
        }
      } else {
        for (const row of upsertData ?? []) {
          const extId = row.external_id as string;
          const meta = rowMetaByExt.get(extId);
          const action = existingCollabs.has(extId) ? "updated" : "inserted";
          if (action === "updated") cursor.updated++; else cursor.inserted++;
          cursor.successes.push({ external_id: extId, name: meta?.name ?? `Colab ${extId}`, action });
          processed++;
        }
      }
      await tick({
        processed,
        inserted: cursor.inserted,
        updated: cursor.updated,
        current_step: `Salvando colaboradores: ${processed}/${rowsToUpsert.length}`,
        errors: cursor.errors.slice(-20).map((e) => ({ external_id: e.external_id, name: e.name, error: e.error })),
      });
    }
  }

  // 4. Desativar quem sumiu (skip se TEST_ONLY ligado)
  if (TEST_ONLY_COLAB_IDS == null || TEST_ONLY_COLAB_IDS.length === 0) {
    const idsToDeactivate: string[] = [];
    for (const [extId, info] of existingCollabs) {
      if (!remoteExtIds.has(extId) && info.status === "ativo") {
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
      if (deactErr) throw new Error(`Desativação falhou: ${deactErr.message}`);
      cursor.deactivated = idsToDeactivate.length;
      await updateJob(sbAdmin, jobId, { deactivated: cursor.deactivated });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 2: financials — paralelizado, com cursor persistente.
// Retorna "budget_expired" se precisou parar antes de terminar.
// ─────────────────────────────────────────────────────────────────────────────

async function runFinancialsPhase(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  jobId: string,
  cursor: JobCursor,
  tick: (patch: Record<string, unknown>, flush?: boolean) => Promise<void>,
  budgetExpired: () => boolean,
): Promise<"completed" | "budget_expired"> {
  const successes = cursor.successes;
  const total = successes.length;
  const summary = cursor.financialsSummary!;

  // Carrega mapa local (id + store_id + current_salary) só pros restantes
  const remaining = successes.slice(cursor.financialsIdx);
  if (remaining.length === 0) return "completed";

  const { data: collabsLocal } = await sbAdmin
    .from("collaborators")
    .select("id, external_id, store_id, current_salary")
    .eq("company_id", cursor.options.companyId)
    .in("external_id", remaining.map((s) => s.external_id));
  const localByExt = new Map<string, { id: string; store_id: string | null; current_salary: number | null }>(
    (collabsLocal ?? []).map((c: { id: string; external_id: string; store_id: string | null; current_salary: number | null }) => [c.external_id, c]),
  );

  // Loop em chunks paralelos
  while (cursor.financialsIdx < total) {
    if (budgetExpired()) return "budget_expired";

    const chunk = successes.slice(cursor.financialsIdx, cursor.financialsIdx + FINANCIALS_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (s) => {
        const local = localByExt.get(s.external_id);
        if (!local) return { skipped: true, name: s.name, external_id: s.external_id };
        try {
          const adicionais = await listAdicionais(s.external_id);
          const fin = await applyFinancials(sbAdmin, {
            companyId: cursor.options.companyId,
            collaboratorId: local.id,
            storeId: local.store_id,
            currentSalary: local.current_salary,
            adicionais,
          });
          return { ok: true, name: s.name, external_id: s.external_id, fin };
        } catch (e) {
          return { error: (e as Error).message, name: s.name, external_id: s.external_id };
        }
      }),
    );

    // Agrega
    for (const r of results) {
      if (r.status === "rejected") {
        // Promise.allSettled garante que nunca cai aqui (capturamos no try), mas defensivo
        summary.errors++;
        summary.errorDetails.push({
          collaboratorName: "?",
          external_id: "?",
          tipo: "EXCEPTION",
          error: String(r.reason),
        });
        continue;
      }
      const v = r.value;
      if ("skipped" in v) continue;
      if ("error" in v) {
        summary.errors++;
        summary.errorDetails.push({
          collaboratorName: v.name,
          external_id: v.external_id,
          tipo: "EXCEPTION",
          error: v.error,
        });
        continue;
      }
      const { fin } = v;
      summary.processed++;
      if (fin.salaryEntry.created) summary.salaryCreated++;
      if (fin.salaryEntry.updated) summary.salaryUpdated++;
      if (fin.taxEntries.inss.created || fin.taxEntries.inss.updated) summary.inssGenerated++;
      if (fin.taxEntries.irpf.created || fin.taxEntries.irpf.updated) summary.irpfGenerated++;
      if (fin.taxEntries.fgts.created || fin.taxEntries.fgts.updated) summary.fgtsGenerated++;
      summary.payrollUpserted += fin.payrollEntries.upserted;
      summary.assignmentsUpserted += fin.benefitsAssignments.upserted;
      summary.benefitsCreated += fin.benefitsAssignments.benefitsCreated;
      summary.errors += fin.errors.length;
      for (const fe of fin.errors) {
        summary.errorDetails.push({
          collaboratorName: v.name,
          external_id: fe.external_id,
          tipo: fe.tipo,
          error: fe.error,
        });
      }
    }

    cursor.financialsIdx += chunk.length;
    await tick({
      processed: cursor.financialsIdx,
      total,
      current_step: `Aplicando financeiros: ${cursor.financialsIdx}/${total} (paralelo ${FINANCIALS_CONCURRENCY}x)`,
    });

    // Persiste cursor periodicamente
    if (cursor.financialsIdx % CURSOR_PERSIST_EVERY === 0) {
      await persistCursor(sbAdmin, jobId, cursor);
    }
  }

  return "completed";
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 3: details — paralelizado, com cursor persistente.
// ─────────────────────────────────────────────────────────────────────────────

async function runDetailsPhase(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  jobId: string,
  cursor: JobCursor,
  tick: (patch: Record<string, unknown>, flush?: boolean) => Promise<void>,
  budgetExpired: () => boolean,
): Promise<"completed" | "budget_expired"> {
  const successes = cursor.successes;
  const total = successes.length;
  const summary = cursor.detailsSummary!;

  const remaining = successes.slice(cursor.detailsIdx);
  if (remaining.length === 0) return "completed";

  const { data: collabsLocal } = await sbAdmin
    .from("collaborators")
    .select("id, external_id")
    .eq("company_id", cursor.options.companyId)
    .in("external_id", remaining.map((s) => s.external_id));
  const localByExt = new Map<string, string>(
    (collabsLocal ?? []).map((c: { id: string; external_id: string }) => [c.external_id, c.id]),
  );

  while (cursor.detailsIdx < total) {
    if (budgetExpired()) return "budget_expired";

    const chunk = successes.slice(cursor.detailsIdx, cursor.detailsIdx + DETAILS_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (s) => {
        const localId = localByExt.get(s.external_id);
        if (!localId) return { skipped: true };
        try {
          const det = await applyCollaboratorDetails(sbAdmin, {
            companyId: cursor.options.companyId,
            collaboratorId: localId,
            remoteId: s.external_id,
          });
          return { ok: true, name: s.name, det };
        } catch (e) {
          return { error: (e as Error).message, name: s.name };
        }
      }),
    );

    for (const r of results) {
      if (r.status === "rejected") {
        summary.errors++;
        summary.errorDetails.push({
          collaboratorName: "?",
          kind: "EXCEPTION",
          error: String(r.reason),
        });
        continue;
      }
      const v = r.value;
      if ("skipped" in v) continue;
      if ("error" in v) {
        summary.errors++;
        summary.errorDetails.push({
          collaboratorName: v.name,
          kind: "EXCEPTION",
          error: v.error,
        });
        continue;
      }
      summary.processed++;
      for (const [kind, result] of Object.entries(v.det)) {
        summary.totals[kind] = (summary.totals[kind] ?? 0) + (result as { upserted: number }).upserted;
        const err = (result as { error?: string }).error;
        if (err) {
          summary.errors++;
          summary.errorDetails.push({ collaboratorName: v.name, kind, error: err });
        }
      }
    }

    cursor.detailsIdx += chunk.length;
    await tick({
      processed: cursor.detailsIdx,
      total,
      current_step: `Sincronizando detalhes: ${cursor.detailsIdx}/${total} (paralelo ${DETAILS_CONCURRENCY}x)`,
    });

    if (cursor.detailsIdx % CURSOR_PERSIST_EVERY === 0) {
      await persistCursor(sbAdmin, jobId, cursor);
    }
  }

  return "completed";
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
      `Limite de ${MAX_CONTINUATIONS} continuações atingido — job parou em ${cursor.phase} ` +
      `(financials=${cursor.financialsIdx}, details=${cursor.detailsIdx})`,
    );
    return;
  }
  await persistCursor(sbAdmin, jobId, cursor);
  await updateJob(sbAdmin, jobId, {
    current_step: `Disparando continuação ${cursor.continuationCount}/${MAX_CONTINUATIONS}...`,
  });

  // Self-invoke da edge function. IMPORTANTE: agora await o fetch (com
  // timeout) — fire-and-forget anterior podia ser GC'd antes do request HTTP
  // chegar no servidor. A nova invocação retorna 202 imediato (porque o
  // trabalho real roda em waitUntil dela), então este await é só pra
  // confirmar que a requisição chegou.
  const url = `${supabaseUrl}/functions/v1/sync-collaborators`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s
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
      await updateJob(sbAdmin, jobId, {
        current_step: `⚠ Continuação falhou (HTTP ${resp.status}). Job ficou em ${cursor.phase} ${cursor.financialsIdx}/${cursor.detailsIdx}.`,
      });
      await markJobFailed(
        sbAdmin,
        jobId,
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
      sbAdmin,
      jobId,
      `Auto-continuação não pôde ser disparada: ${errMsg}. ` +
      `Estado atual: ${cursor.phase} financials=${cursor.financialsIdx} details=${cursor.detailsIdx}. ` +
      `Rode Sincronizar de novo pra continuar do zero.`,
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

// ─────────────────────────────────────────────────────────────────────────────
// EdgeRuntime.waitUntil helper (com fallback pra ambientes locais)
// ─────────────────────────────────────────────────────────────────────────────

function scheduleBackground(fn: () => Promise<unknown>): void {
  // deno-lint-ignore no-explicit-any
  const ert = (globalThis as any).EdgeRuntime as
    | { waitUntil?: (p: Promise<unknown>) => void }
    | undefined;
  const p = fn();
  if (ert?.waitUntil) ert.waitUntil(p);
  // Em ambientes sem EdgeRuntime, só dispara sem await
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

  // CPF: aceita vazio. Migration 20260525143000 tornou a coluna nullable e
  // o UNIQUE virou parcial (só impede dup quando cpf não é null). RH preenche
  // depois manual pelos colabs sem cpf.
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
