// Edge Function: collaborator-update
//
// Atualiza um colaborador no SoftHouse E na api.softcom.cloud. A API
// legada exige PUT por aba (identificacao, funcionais, comissoes).
// Esta function recebe o `section` e direciona pra rota certa.
//
// Body: {
//   collaboratorId: uuid,
//   section: 'identificacao' | 'funcionais' | 'comissoes',
//   data: {<campos da aba>},
//   syncToRemote?: boolean
// }
// Response: { success, remote }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  SoftcomCloudError,
  updateColaboradorSection,
  type UpdateSection,
} from "../_shared/softcom-cloud.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_SECTIONS: UpdateSection[] = ["identificacao", "funcionais", "comissoes"];

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

  let collaboratorId: string;
  let section: UpdateSection;
  let local: Record<string, unknown>;
  let syncToRemote = true;
  try {
    const body = await req.json();
    collaboratorId = String(body.collaboratorId ?? "").trim();
    if (!collaboratorId) throw new Error("missing collaboratorId");
    section = body.section;
    if (!ALLOWED_SECTIONS.includes(section)) {
      throw new Error(`section deve ser uma de ${ALLOWED_SECTIONS.join(", ")}`);
    }
    local = body.data ?? {};
    if (typeof local !== "object" || !local) throw new Error("missing data");
    if (typeof body.syncToRemote === "boolean") syncToRemote = body.syncToRemote;
  } catch (e) {
    return jsonResponse({ error: "Body inválido: " + (e as Error).message }, 400);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Carregar colaborador local pra obter company_id e external_id
  const { data: collab, error: collabErr } = await sbAdmin
    .from("collaborators")
    .select("id, company_id, external_id, team_id, position_id, store_id")
    .eq("id", collaboratorId)
    .single();
  if (collabErr || !collab) {
    return jsonResponse({ error: "Colaborador não encontrado" }, 404);
  }

  const allowed = await checkPermission(sbUser, user.id, collab.company_id, "colaboradores");
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  let remoteResponse: unknown = null;

  if (syncToRemote && collab.external_id) {
    const remotePayload = await buildRemotePayloadForSection(
      sbAdmin,
      section,
      local,
      collab,
    );
    try {
      remoteResponse = await updateColaboradorSection(
        collab.external_id,
        section,
        remotePayload,
      );
    } catch (err) {
      const status = err instanceof SoftcomCloudError ? err.status : 502;
      return jsonResponse(
        {
          error: `PUT ${section} na agenda falhou`,
          details: (err as Error).message,
          sentPayload: remotePayload,
        },
        status,
      );
    }
  }

  // Atualizar local com os campos da seção
  const updatePayload = mapLocalForSection(section, local);
  if (Object.keys(updatePayload).length > 0) {
    const { error: updErr } = await sbAdmin
      .from("collaborators")
      .update(updatePayload)
      .eq("id", collaboratorId);
    if (updErr) {
      return jsonResponse(
        { error: "Update local falhou (remoto ok)", details: updErr.message },
        500,
      );
    }
  }

  return jsonResponse({ success: true, remote: remoteResponse });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Filtra os campos do `local` (snake_case) que pertencem à seção. */
function mapLocalForSection(
  section: UpdateSection,
  local: Record<string, unknown>,
): Record<string, unknown> {
  const sectionFields: Record<UpdateSection, string[]> = {
    identificacao: [
      "support_username", "name", "phone_extension", "radios_freeform",
      "address", "district", "gender", "city", "state", "postal_code",
      "phone", "recado_phone", "email", "cpf", "rg", "rg_issuer",
      "supervisor_id", "store_id", "birth_date", "internal_location",
      "team_id", "subsector", "agenda", "indicator_group", "sales_group",
      "ethnicity", "education_level", "pix_key",
    ],
    funcionais: [
      "regime", "contracted_cnpj", "contracted_store_id", "accounting_code",
      "is_pcd", "is_apprentice", "admission_date", "inspira_date",
      "termination_date", "inspira_value", "position_id", "current_salary",
      "discord_id", "discord_username", "is_homeoffice", "has_agenda_access",
      "pis", "ctps", "ctps_series", "ctps_uf", "bank_account", "pix_key",
    ],
    comissoes: [
      "commission_monthly", "commission_license", "commission_upgrade",
      "commission_tef_install", "commission_tef_monthly",
    ],
    permissoes: [],
  };
  const out: Record<string, unknown> = {};
  for (const k of sectionFields[section] ?? []) {
    if (k in local) out[k] = local[k];
  }
  return out;
}

async function buildRemotePayloadForSection(
  // deno-lint-ignore no-explicit-any
  sbAdmin: any,
  section: UpdateSection,
  local: Record<string, unknown>,
  // deno-lint-ignore no-explicit-any
  collab: any,
): Promise<Record<string, unknown>> {
  if (section === "comissoes") {
    return {
      comissaoMensal: local.commission_monthly,
      comissaoLicenca: local.commission_license,
      comissaoUpgrade: local.commission_upgrade,
      comissaoTefInstalacao: local.commission_tef_install,
      comissaoTefMensal: local.commission_tef_monthly,
    };
  }

  // Lookups (cargo, setor, empresa) — só busca se mudou a FK respectiva
  let setorName: string | undefined;
  let cargoRemoteId: number | undefined;
  let empresaName: string | undefined;
  let empresaContratadaName: string | undefined;

  if (section === "identificacao") {
    if (local.team_id) {
      const { data: team } = await sbAdmin.from("teams").select("name").eq("id", local.team_id).single();
      setorName = team?.name ?? undefined;
    }
    if (local.store_id) {
      const { data: st } = await sbAdmin.from("stores").select("store_name").eq("id", local.store_id).single();
      empresaName = st?.store_name ?? undefined;
    }
    return {
      nomeSuporte: local.support_username,
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
      empresa: empresaName,
      contaPix: local.pix_key,
    };
  }

  if (section === "funcionais") {
    if (local.position_id) {
      const { data: pos } = await sbAdmin.from("positions").select("external_id").eq("id", local.position_id).single();
      if (pos?.external_id) cargoRemoteId = Number(pos.external_id);
    }
    if (local.contracted_store_id) {
      const { data: st } = await sbAdmin.from("stores").select("store_name").eq("id", local.contracted_store_id).single();
      empresaContratadaName = st?.store_name ?? undefined;
    }
    return {
      tipoFuncionario: mapRegimeToRemote(local.regime as string),
      cnpjContratado: local.contracted_cnpj,
      empresaContratada: empresaContratadaName,
      codigoContador: local.accounting_code ? Number(local.accounting_code) : undefined,
      pcd: local.is_pcd,
      jovemAprendiz: local.is_apprentice,
      dataAdmissao: local.admission_date,
      inspiraData: local.inspira_date,
      dataDemissao: local.termination_date,
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
    };
  }

  return {};
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
  return Boolean(first?.can_edit);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
