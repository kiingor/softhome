// Edge Function: sync-collaborators
//
// Sincroniza colaboradores principais (sem sub-abas) com api.softcom.cloud.
// Pagina internamente. Pra sincronizar sub-abas de um colaborador
// específico (ferias, 13, exames, parentes, eventos, etc.), use
// `sync-collaborator-details` com o ID dele.
//
// Body: { companyId: uuid, incluirDesativados?: boolean }
// Response: { success, fetched, inserted, updated, deactivated, errors }
//
// Estratégia espelho 100% por external_id, idêntica a sync-stores/teams/positions.
// Lookups pré-carregados pra resolver setor/cargo/empresa via mapa em memória
// (evita N+1).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  listAdicionais,
  listColaboradores,
  SoftcomCloudError,
} from "../_shared/softcom-cloud.ts";
import type { RemoteColaborador } from "../_shared/softcom-cloud-types.ts";
import { applyFinancials } from "../_shared/apply-financials.ts";
import { applyCollaboratorDetails } from "../_shared/apply-collaborator-details.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGE_SIZE = 50;
const MAX_PAGES = 200; // hard limit pra não loopar infinitamente (10k colabs max)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const body = await req.json();
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

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Pré-carregar lookups (external_id remoto → uuid local)
  // ───────────────────────────────────────────────────────────────────────────
  const [storesMap, teamsMap, positionsMap, existingCollabs] = await Promise.all([
    loadExternalIdMap(sbAdmin, "stores", companyId),
    loadExternalIdMap(sbAdmin, "teams", companyId),
    loadExternalIdMap(sbAdmin, "positions", companyId),
    loadExistingCollaborators(sbAdmin, companyId),
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Buscar todas as páginas da API
  // ───────────────────────────────────────────────────────────────────────────
  const remote: RemoteColaborador[] = [];
  let page = 1;
  let totalPages = 1;
  try {
    do {
      const resp = await listColaboradores({
        page,
        pageSize: PAGE_SIZE,
        incluirDesativados,
      });
      remote.push(...resp.data);
      totalPages = resp.pagination.totalPages || 1;
      page++;
    } while (page <= totalPages && page <= MAX_PAGES);
  } catch (err) {
    const status = err instanceof SoftcomCloudError ? err.status : 502;
    return jsonResponse(
      { error: "Falha ao ler Softcom Cloud", details: (err as Error).message },
      status,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Diff + upsert
  // ───────────────────────────────────────────────────────────────────────────
  const errors: Array<{ external_id: string; name: string; cpf: string | null; error: string }> = [];
  const successes: Array<{ external_id: string; name: string; action: "inserted" | "updated" }> = [];
  const remoteExtIds = new Set(remote.map((r) => String(r.id)));
  const rowsToUpsert: Record<string, unknown>[] = [];
  const rowMetaByExt = new Map<string, { name: string }>();

  for (const r of remote) {
    const displayName = (r.nome ?? r.nomeSuporte ?? `Colab ${r.id}`).toString().trim();
    try {
      const row = mapColaboradorToRow(r, companyId, storesMap, teamsMap, positionsMap);
      rowsToUpsert.push(row);
      rowMetaByExt.set(String(r.id), { name: displayName });
    } catch (e) {
      errors.push({
        external_id: String(r.id),
        name: displayName,
        cpf: r.cpf ?? null,
        error: (e as Error).message,
      });
    }
  }

  let inserted = 0;
  let updated = 0;
  if (rowsToUpsert.length > 0) {
    // Upsert em chunks. Se um chunk falha por algum row inválido, retenta um
    // por um pra isolar quais deram erro (sem perder os outros do mesmo chunk).
    const chunkSize = 50;
    for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
      const chunk = rowsToUpsert.slice(i, i + chunkSize);
      const { data: upsertData, error: upErr } = await sbAdmin
        .from("collaborators")
        .upsert(chunk, {
          onConflict: "company_id,external_id",
          ignoreDuplicates: false,
        })
        .select("external_id");

      if (upErr) {
        // Retenta linha-a-linha pra identificar quais falharam
        for (const row of chunk) {
          const extId = String(row.external_id);
          const meta = rowMetaByExt.get(extId);
          const { data: singleData, error: singleErr } = await sbAdmin
            .from("collaborators")
            .upsert(row, { onConflict: "company_id,external_id", ignoreDuplicates: false })
            .select("external_id")
            .maybeSingle();
          if (singleErr) {
            errors.push({
              external_id: extId,
              name: meta?.name ?? `Colab ${extId}`,
              cpf: (row.cpf as string) ?? null,
              error: singleErr.message,
            });
          } else if (singleData) {
            const action = existingCollabs.has(extId) ? "updated" : "inserted";
            if (action === "updated") updated++; else inserted++;
            successes.push({ external_id: extId, name: meta?.name ?? `Colab ${extId}`, action });
          }
        }
      } else {
        for (const row of upsertData ?? []) {
          const extId = row.external_id as string;
          const meta = rowMetaByExt.get(extId);
          const action = existingCollabs.has(extId) ? "updated" : "inserted";
          if (action === "updated") updated++; else inserted++;
          successes.push({ external_id: extId, name: meta?.name ?? `Colab ${extId}`, action });
        }
      }
    }
  }

  // Desativar quem sumiu da API (status='inativo')
  const idsToDeactivate: string[] = [];
  for (const [extId, info] of existingCollabs) {
    if (!remoteExtIds.has(extId) && info.status === "ativo") {
      idsToDeactivate.push(info.id);
    }
  }
  let deactivated = 0;
  if (idsToDeactivate.length > 0) {
    const { error: deactErr } = await sbAdmin
      .from("collaborators")
      .update({ status: "inativo" })
      .in("id", idsToDeactivate);
    if (deactErr) {
      return jsonResponse(
        { error: "Desativação falhou", details: deactErr.message },
        500,
      );
    }
    deactivated = idsToDeactivate.length;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Financeiros (opt-in) — busca adicionais e aplica por colaborador
  //    upsertado. N+1 (1 request por colab); por isso é flag, default false.
  // ───────────────────────────────────────────────────────────────────────────
  let financialsSummary: {
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
  } | null = null;

  if (includeFinancials && successes.length > 0) {
    financialsSummary = {
      processed: 0,
      salaryCreated: 0,
      salaryUpdated: 0,
      inssGenerated: 0,
      irpfGenerated: 0,
      fgtsGenerated: 0,
      payrollUpserted: 0,
      assignmentsUpserted: 0,
      benefitsCreated: 0,
      errors: 0,
      errorDetails: [],
    };

    // Mapa external_id → row local pra obter id + store_id + current_salary
    const { data: collabsLocal } = await sbAdmin
      .from("collaborators")
      .select("id, external_id, store_id, current_salary")
      .eq("company_id", companyId)
      .in("external_id", successes.map((s) => s.external_id));
    const localByExt = new Map<string, { id: string; store_id: string | null; current_salary: number | null }>(
      (collabsLocal ?? []).map((c: { id: string; external_id: string; store_id: string | null; current_salary: number | null }) => [c.external_id, c]),
    );

    for (const s of successes) {
      const local = localByExt.get(s.external_id);
      if (!local) continue;
      try {
        const adicionais = await listAdicionais(s.external_id);
        const fin = await applyFinancials(sbAdmin, {
          companyId,
          collaboratorId: local.id,
          storeId: local.store_id,
          currentSalary: local.current_salary,
          adicionais,
        });
        financialsSummary.processed++;
        if (fin.salaryEntry.created) financialsSummary.salaryCreated++;
        if (fin.salaryEntry.updated) financialsSummary.salaryUpdated++;
        if (fin.taxEntries.inss.created || fin.taxEntries.inss.updated) financialsSummary.inssGenerated++;
        if (fin.taxEntries.irpf.created || fin.taxEntries.irpf.updated) financialsSummary.irpfGenerated++;
        if (fin.taxEntries.fgts.created || fin.taxEntries.fgts.updated) financialsSummary.fgtsGenerated++;
        financialsSummary.payrollUpserted += fin.payrollEntries.upserted;
        financialsSummary.assignmentsUpserted += fin.benefitsAssignments.upserted;
        financialsSummary.benefitsCreated += fin.benefitsAssignments.benefitsCreated;
        financialsSummary.errors += fin.errors.length;
        for (const fe of fin.errors) {
          financialsSummary.errorDetails.push({
            collaboratorName: s.name,
            external_id: fe.external_id,
            tipo: fe.tipo,
            error: fe.error,
          });
        }
      } catch (e) {
        financialsSummary.errors++;
        financialsSummary.errorDetails.push({
          collaboratorName: s.name,
          external_id: s.external_id,
          tipo: "EXCEPTION",
          error: (e as Error).message,
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Detalhes (opt-in) — busca sub-abas (afastamentos, absenteismos,
  //    ferias, planos, pdvs, exames, eventos, etc) por colaborador. Custoso:
  //    9 requests por colab. Default false.
  // ───────────────────────────────────────────────────────────────────────────
  let detailsSummary: {
    processed: number;
    totals: Record<string, number>;
    errors: number;
    errorDetails: Array<{ collaboratorName: string; kind: string; error: string }>;
  } | null = null;

  if (includeDetails && successes.length > 0) {
    detailsSummary = {
      processed: 0,
      totals: {
        absences: 0, leaves: 0, emails: 0, internships: 0,
        pdvs: 0, healthPlans: 0, healthPlanDeductions: 0,
        vacations: 0, exams: 0, timelineEvents: 0,
      },
      errors: 0,
      errorDetails: [],
    };

    // Carrega ids locais correspondentes aos sucessos
    const { data: collabsLocal } = await sbAdmin
      .from("collaborators")
      .select("id, external_id")
      .eq("company_id", companyId)
      .in("external_id", successes.map((s) => s.external_id));
    const localByExt = new Map<string, string>(
      (collabsLocal ?? []).map((c: { id: string; external_id: string }) => [c.external_id, c.id]),
    );

    for (const s of successes) {
      const localId = localByExt.get(s.external_id);
      if (!localId) continue;
      try {
        const det = await applyCollaboratorDetails(sbAdmin, {
          companyId,
          collaboratorId: localId,
          remoteId: s.external_id,
        });
        detailsSummary.processed++;
        for (const [kind, result] of Object.entries(det)) {
          detailsSummary.totals[kind] = (detailsSummary.totals[kind] ?? 0) + result.upserted;
          if (result.error) {
            detailsSummary.errors++;
            detailsSummary.errorDetails.push({
              collaboratorName: s.name,
              kind,
              error: result.error,
            });
          }
        }
      } catch (e) {
        detailsSummary.errors++;
        detailsSummary.errorDetails.push({
          collaboratorName: s.name,
          kind: "EXCEPTION",
          error: (e as Error).message,
        });
      }
    }
  }

  return jsonResponse({
    success: true,
    fetched: remote.length,
    inserted,
    updated,
    deactivated,
    errors,
    successes,
    financials: financialsSummary,
    details: detailsSummary,
  });
});

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

  // CPF: cleanCPF (só dígitos) ou null
  const cpf = r.cpf ? String(r.cpf).replace(/\D/g, "") : null;
  if (!cpf) throw new Error("cpf vazio");
  const name = (r.nome ?? r.nomeSuporte ?? `Colab ${r.id}`).trim();

  return {
    company_id: companyId,
    external_id: String(r.id),

    // identificação
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
    // nomeSuporte vai pra softcom_surname (campo "Sobrenome Softcom" da UI).
    // Mantemos também em support_username pra compatibilidade.
    softcom_surname: r.nomeSuporte ?? null,
    support_username: r.nomeSuporte ?? null,
    // Código interno = ID da agenda. Campo é readonly na UI.
    internal_code: String(r.id),

    // endereço
    address: r.endereco ?? null,
    district: r.bairro ?? null,
    city: r.cidade ?? null,
    state: r.uf ?? null,
    postal_code: r.cep ?? null,

    // ramais
    phone_extension: r.ramalFixo ?? null,
    radios_freeform: r.ramais ?? null,

    // lotação
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

    // contratação
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

    // CTPS + bancário
    ctps: r.ctps ?? null,
    ctps_series: r.ctpsSerie ?? null,
    ctps_uf: r.ctpsUf ?? null,
    bank_account: r.conta ?? null,

    // comissões
    commission_monthly: numOrNull(r.comissaoMensal),
    commission_license: numOrNull(r.comissaoLicenca),
    commission_upgrade: numOrNull(r.comissaoUpgrade),
    commission_tef_install: numOrNull(r.comissaoTefInstalacao),
    commission_tef_monthly: numOrNull(r.comissaoTefMensal),

    // gerência
    is_manager_leader: Boolean(r.gerenteLider),
    is_manager_director: Boolean(r.gerenteDiretor),
    is_manager_support: Boolean(r.gerenteApoio),
    is_godfather: Boolean(r.padrinho),
  };
}

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Aceita ISO 8601, retorna YYYY-MM-DD
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function numOrNull(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function mapRegime(tipo: string | null | undefined): string {
  // Enum collaborator_regime no SoftHouse aceita apenas: 'clt' | 'pj' | 'estagiario'.
  // Jovem aprendiz e temporário viram 'clt' — já existem booleans separados
  // (is_apprentice, is_temp) que cobrem esse caso.
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
