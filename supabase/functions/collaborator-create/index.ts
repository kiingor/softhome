// Edge Function: collaborator-create
//
// Cria um colaborador no SoftHouse E na api.softcom.cloud (admissão no
// legado). Recebe o cadastro do SoftHouse, faz POST /v1/colaboradores
// na agenda, e retorna o local + remote IDs.
//
// Se o POST remoto falhar, NÃO grava local — o caller decide se quer
// retentar ou criar sem vínculo (chamando direto a tabela `collaborators`).
//
// Body: { companyId: uuid, data: <campos do SoftHouse>, syncToRemote?: boolean }
// Response: { success, localId, externalId, remote }
//
// Permissão: colaboradores:can_create OU admin.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { createColaborador, isAgendaSyncDisabled, listAdicionais, SoftcomCloudError } from "../_shared/softcom-cloud.ts";
import { applyFinancials } from "../_shared/apply-financials.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  let local: Record<string, unknown>;
  let syncToRemote = true;
  try {
    const body = await req.json();
    companyId = String(body.companyId ?? "").trim();
    if (!companyId) throw new Error("missing companyId");
    local = body.data ?? {};
    if (typeof local !== "object" || !local) throw new Error("missing data");
    if (typeof body.syncToRemote === "boolean") syncToRemote = body.syncToRemote;
  } catch (e) {
    return jsonResponse(
      { error: "Body inválido: " + (e as Error).message },
      400,
    );
  }

  // Kill-switch global da agenda: cria local-only (external_id null), sem POST
  // remoto. applyFinancials cai no caminho só-salário-base (adicionais=[]).
  if (isAgendaSyncDisabled()) syncToRemote = false;

  const allowed = await checkPermission(sbUser, user.id, companyId, "colaboradores");
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let externalId: string | null = null;
  let remoteResponse: unknown = null;

  if (syncToRemote) {
    // Resolver lookups: team_id local → setor (name remoto), position_id → cargoId (number), store_id → empresa
    const remotePayload = await buildRemotePayload(sbAdmin, companyId, local);

    try {
      const created = await createColaborador(remotePayload);
      remoteResponse = created;
      if (created?.id != null) externalId = String(created.id);
    } catch (err) {
      const status = err instanceof SoftcomCloudError ? err.status : 502;
      return jsonResponse(
        {
          error: "POST na agenda falhou — colaborador NÃO foi gravado local",
          details: (err as Error).message,
          sentPayload: remotePayload,
        },
        status,
      );
    }
  }

  // Grava local — external_id pode vir do POST remoto
  const insertRow: Record<string, unknown> = {
    ...local,
    company_id: companyId,
    external_id: externalId,
  };

  // CPF: limpar pra dígitos
  if (typeof insertRow.cpf === "string") {
    insertRow.cpf = (insertRow.cpf as string).replace(/\D/g, "");
  }

  const { data: created, error: insErr } = await sbAdmin
    .from("collaborators")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr) {
    return jsonResponse(
      {
        error: "Insert local falhou (mas remoto pode ter sido criado)",
        details: insErr.message,
        externalId,
      },
      500,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pós-criação: aplica financeiros (salário base + adicionais)
  // - Se externalId está disponível, busca os adicionais via API e aplica
  // - Senão, aplica apenas salário base com current_salary informado
  // ───────────────────────────────────────────────────────────────────────────
  let financials: unknown = null;
  try {
    const currentSalary = typeof local.current_salary === "number"
      ? local.current_salary
      : null;
    let adicionais: import("../_shared/softcom-cloud-types.ts").RemoteAdicional[] = [];
    if (externalId) {
      try {
        adicionais = await listAdicionais(externalId);
      } catch (_) {
        // se falhar (colab recém-criado sem adicionais no legado), segue só com salário
        adicionais = [];
      }
    }
    financials = await applyFinancials(sbAdmin, {
      companyId,
      collaboratorId: created!.id as string,
      storeId: (local.store_id as string) ?? null,
      currentSalary,
      adicionais,
    });
  } catch (e) {
    financials = { error: (e as Error).message };
  }

  return jsonResponse({
    success: true,
    localId: created?.id,
    externalId,
    remote: remoteResponse,
    financials,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildRemotePayload(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  companyId: string,
  local: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Resolve nome do setor a partir de team_id local
  let setorName: string | null = null;
  if (local.team_id) {
    const { data: team } = await sbAdmin
      .from("teams")
      .select("name, external_id")
      .eq("id", local.team_id)
      .single();
    setorName = team?.name ?? null;
  }

  // Resolve cargoId (remoto) a partir de position_id local
  let cargoRemoteId: number | null = null;
  if (local.position_id) {
    const { data: pos } = await sbAdmin
      .from("positions")
      .select("external_id")
      .eq("id", local.position_id)
      .single();
    if (pos?.external_id) cargoRemoteId = Number(pos.external_id);
  }

  // Resolve empresa (nome remoto/PDV) a partir de store_id local
  let empresaName: string | null = null;
  if (local.store_id) {
    const { data: st } = await sbAdmin
      .from("stores")
      .select("store_name, external_id")
      .eq("id", local.store_id)
      .single();
    empresaName = st?.store_name ?? null;
  }

  // Monta payload conforme CreateColaboradorDto da API
  // Campos obrigatórios: nomeSuporte, senha, nomeCompleto, setor
  return {
    nomeSuporte: local.support_username ?? local.email ?? local.name,
    senha: local.password_temp ?? "trocar123", // TODO: gerar/coletar de verdade
    nomeCompleto: local.name,
    ramalFixo: local.phone_extension,
    ramais: local.radios_freeform,
    endereco: local.address,
    bairro: local.district,
    sexo: local.gender,
    cidade: local.city,
    uf: local.state,
    cep: local.postal_code,
    telefones: local.phone,
    telefones2: local.recado_phone,
    email: local.email,
    cpf: local.cpf,
    rg: local.rg,
    rgOrgao: local.rg_issuer,
    dataNascimento: local.birth_date,
    local: local.internal_location,
    setor: setorName,
    subsetor: local.subsector,
    agenda: local.agenda,
    grupoIndicador: local.indicator_group,
    grupoVendas: local.sales_group,
    etnia: local.ethnicity,
    escolaridade: local.education_level,
    tipoFuncionario: mapRegimeToRemote(local.regime as string),
    cnpjContratado: local.contracted_cnpj,
    empresaContratada: empresaName,
    codigoContador: local.accounting_code ? Number(local.accounting_code) : undefined,
    pcd: local.is_pcd,
    jovemAprendiz: local.is_apprentice,
    dataAdmissao: local.admission_date,
    inspiraData: local.inspira_date,
    inspiraValor: local.inspira_value,
    cargoId: cargoRemoteId,
    salarioAtual: local.current_salary,
    discordId: local.discord_id,
    usuarioDiscord: local.discord_username,
    homeoffice: local.is_homeoffice,
    possuiAgenda: local.has_agenda_access,
    pis: local.pis,
    ctps: local.ctps,
    ctpsSerie: local.ctps_series,
    ctpsUf: local.ctps_uf,
    conta: local.bank_account,
    contaPix: local.pix_key,
    empresa: empresaName,
  };
}

function mapRegimeToRemote(regime: string | undefined): string {
  // Enum local: 'clt' | 'pj' | 'estagiario'. Mapeia pros valores aceitos pela
  // API legada (EFETIVO/PJ/ESTAGIARIO).
  if (!regime) return "EFETIVO";
  switch (regime) {
    case "estagiario": return "ESTAGIARIO";
    case "pj": return "PJ";
    default: return "EFETIVO";
  }
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
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
