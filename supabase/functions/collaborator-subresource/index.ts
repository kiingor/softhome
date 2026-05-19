// Edge Function: collaborator-subresource
//
// CRUD genérico de sub-recursos do colaborador (afastamentos, absenteismos,
// planos, 13º, férias, PDVs, e outros) — espelha tanto na API legada
// api.softcom.cloud quanto na tabela local correspondente.
//
// Body:
//   {
//     action: 'create' | 'update' | 'delete',
//     kind:   'absenteismos' | 'afastamentos' | 'decimo-terceiro'
//           | 'ferias' | 'planos' | 'pdvs',
//     collaboratorId: uuid (local),
//     localId?:  uuid     (obrigatório em update/delete)
//     data?:     object   (payload — campos no formato LOCAL, snake_case)
//   }
//
// Mapeamento de tabelas e tradução de campos (local→remoto / remoto→local)
// fica neste mesmo arquivo na const ENTITY_MAP.
//
// Permissão: colaboradores:can_create / can_edit / can_delete (+admin bypass).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  createSubResource,
  deleteSubResource,
  SoftcomCloudError,
  type SubResourceKind,
  updateSubResource,
} from "../_shared/softcom-cloud.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─────────────────────────────────────────────────────────────────────────────
// Configuração por tipo: tabela local + tradutor de campos
// ─────────────────────────────────────────────────────────────────────────────

interface EntityConfig {
  /** Tabela local que espelha o recurso. */
  table: string;
  /** Mapa campo local → campo remoto (pra POST/PUT). */
  toRemote: (local: Record<string, unknown>) => Record<string, unknown>;
  /** Mapa retorno remoto → row local (pra após POST/PUT). */
  fromRemote: (
    remote: Record<string, unknown>,
    extra: { companyId: string; collaboratorId: string },
  ) => Record<string, unknown>;
}

const ENTITY_MAP: Record<SubResourceKind, EntityConfig> = {
  absenteismos: {
    table: "collaborator_absences",
    toRemote: (l) => ({
      datas: l.occurred_on,
      dias: l.days,
      motivo: l.reason,
      observacao: l.notes,
      atestado: l.has_certificate ? 1 : 0,
      bancoHoras: l.bank_hours ?? 0,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      occurred_on: r.datas,
      days: r.dias,
      reason: r.motivo,
      notes: r.observacao,
      has_certificate: !!r.atestado && r.atestado !== 0,
      bank_hours: r.bancoHoras ?? 0,
    }),
  },
  afastamentos: {
    table: "collaborator_leaves",
    toRemote: (l) => ({
      motivo: l.reason_code,
      dataInicial: l.start_date,
      dataFinal: l.end_date,
      descricao: l.description,
      atestado: !!l.has_certificate,
      compensado: l.compensated,
      idViagem: l.trip_id,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      reason_code: r.motivo,
      start_date: r.dataInicial,
      end_date: r.dataFinal,
      description: r.descricao,
      has_certificate: !!r.atestado,
      compensated: r.compensado,
      trip_id: r.idViagem,
    }),
  },
  "decimo-terceiro": {
    table: "bonus_entries",
    toRemote: (l) => ({
      datas: l.posted_at ?? new Date().toISOString().slice(0, 10),
      anos: l.year,
      pago: l.is_paid ? "S" : "N",
      valorPago: l.value_paid,
      observacao: l.notes,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      // mapeia pros campos do bonus_entries (que tem period_id obrigatório)
      // Esse helper assume que o caller já resolveu period_id antes de chamar.
      // Pra simplicidade vamos só guardar external_id e descritivos;
      // o RH ajusta o period_id manualmente depois se precisar.
      notes: r.observacao,
    }),
  },
  ferias: {
    table: "vacation_periods",
    toRemote: (l) => ({
      datas: l.posted_at,
      periodoIn: l.accrual_start,
      periodoFn: l.accrual_end,
      dataLimite: l.deadline,
      dataPrevista: l.planned_start,
      periodoInGozo: l.enjoyment_start,
      periodoFnGozo: l.enjoyment_end,
      pago: l.is_paid ? "S" : "N",
      valorPago: l.value_paid,
      observacao: l.notes,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      accrual_start: r.periodoIn,
      accrual_end: r.periodoFn,
      notes: r.observacao,
    }),
  },
  planos: {
    table: "collaborator_health_plans",
    toRemote: (l) => ({
      plano: l.plan_name,
      matriculaPlano: l.registration_code,
      dataInicio: l.start_date,
      tipo: l.beneficiary_type,
      nomes: l.beneficiary_name,
      dataNascimento: l.beneficiary_birth,
      cpf: l.beneficiary_cpf,
      valorPlano: l.plan_value,
      obs: l.notes,
      desativado: !!l.is_disabled,
      dataDesativado: l.disabled_at,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      plan_name: r.plano,
      registration_code: r.matriculaPlano,
      start_date: r.dataInicio,
      beneficiary_type: r.tipo,
      beneficiary_name: r.nomes,
      beneficiary_birth: r.dataNascimento,
      beneficiary_cpf: r.cpf,
      plan_value: r.valorPlano,
      notes: r.obs,
      is_disabled: !!r.desativado,
      disabled_at: r.dataDesativado,
    }),
  },
  pdvs: {
    table: "collaborator_pdvs",
    toRemote: (l) => ({
      pdv: l.pdv_name,
      f10: l.f10 ?? 0,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      pdv_name: r.pdv,
      f10: r.f10 ?? 0,
    }),
  },
  // Os de baixo são suportados pelo cliente mas raramente usados via essa
  // função (eventos é histórico, exames/parentes/emails/estagios/adicionais
  // têm UIs próprias ou são sincronizados em bulk). Mantidos pra completude.
  eventos: {
    table: "collaborator_timeline_events",
    toRemote: (l) => ({
      datas: l.posted_at,
      dataEvento: l.event_date,
      evento: l.event_name,
      funcao: l.position_name,
      observacao: l.notes,
      valorPago: l.value_paid,
      lacrar: !!l.is_sealed,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      event_type: "custom",
      effective_date: r.dataEvento ?? r.datas ?? new Date().toISOString().slice(0, 10),
    }),
  },
  exames: {
    table: "occupational_exams",
    toRemote: (l) => ({
      exameTipo: l.exam_type,
      dataPrevista: l.planned_date,
      dataRealizado: l.completed_date,
      notificacaoEnviada: !!l.notification_sent,
      marcar: l.flagged !== false,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      exam_type: r.exameTipo,
      planned_date: r.dataPrevista,
      completed_date: r.dataRealizado,
    }),
  },
  parentes: {
    table: "collaborator_dependents",
    toRemote: (l) => ({
      tipoParente: l.relationship,
      nomeParente: l.name,
      genero: l.gender,
      cpf: l.cpf,
      dataNascimento: l.birth_date,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      name: r.nomeParente,
      relationship: r.tipoParente,
      gender: r.genero,
      cpf: r.cpf,
      birth_date: r.dataNascimento,
    }),
  },
  emails: {
    table: "collaborator_emails",
    toRemote: (l) => ({ email: l.email }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      email: r.email,
    }),
  },
  estagios: {
    table: "collaborator_internships",
    toRemote: (l) => ({
      dataInicial: l.start_date,
      dataFinal: l.end_date,
      renovacao: !!l.is_renewal,
      notificacaoEnviada: !!l.notification_sent,
      marcar: l.flagged !== false,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      start_date: r.dataInicial,
      end_date: r.dataFinal,
      is_renewal: !!r.renovacao,
      notification_sent: !!r.notificacaoEnviada,
      flagged: r.marcar !== false,
    }),
  },
  adicionais: {
    table: "collaborator_extras",
    toRemote: (l) => ({
      tipo: l.extra_type,
      descricao: l.description,
      valores: l.value,
      desativado: !!l.is_disabled,
      inspiraTipo: l.inspira_type,
      inspiraGrupo: l.inspira_group,
    }),
    fromRemote: (r, ex) => ({
      company_id: ex.companyId,
      collaborator_id: ex.collaboratorId,
      external_id: String(r.id),
      extra_type: r.tipo,
      description: r.descricao,
      value: r.valores,
      is_disabled: !!r.desativado,
      inspira_type: r.inspiraTipo,
      inspira_group: r.inspiraGrupo,
    }),
  },
};

// ─────────────────────────────────────────────────────────────────────────────

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

  let action: "create" | "update" | "delete";
  let kind: SubResourceKind;
  let collaboratorId: string;
  let localId: string | undefined;
  let data: Record<string, unknown>;
  try {
    const body = await req.json();
    action = body.action;
    kind = body.kind;
    collaboratorId = String(body.collaboratorId ?? "").trim();
    localId = body.localId ? String(body.localId) : undefined;
    data = body.data ?? {};
    if (!["create", "update", "delete"].includes(action)) throw new Error("action inválido");
    if (!ENTITY_MAP[kind]) throw new Error(`kind ${kind} não suportado`);
    if (!collaboratorId) throw new Error("missing collaboratorId");
    if ((action === "update" || action === "delete") && !localId) {
      throw new Error("localId obrigatório em update/delete");
    }
  } catch (e) {
    return jsonResponse({ error: "Body inválido: " + (e as Error).message }, 400);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Buscar dados do colab pra obter external_id + company_id + permissão
  const { data: collab, error: collabErr } = await sbAdmin
    .from("collaborators")
    .select("id, company_id, external_id")
    .eq("id", collaboratorId)
    .single();
  if (collabErr || !collab) return jsonResponse({ error: "Colaborador não encontrado" }, 404);

  const requiredAction =
    action === "create" ? "can_create" : action === "update" ? "can_edit" : "can_delete";
  const allowed = await checkPermission(sbUser, user.id, collab.company_id, "colaboradores", requiredAction);
  if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

  const cfg = ENTITY_MAP[kind];

  // ─────────────────────────────────────────────────────────────────────────
  if (action === "create") {
    if (!collab.external_id) {
      return jsonResponse(
        { error: "Colaborador sem external_id (não vinculado à agenda). Sincronize antes." },
        400,
      );
    }
    let remote: Record<string, unknown>;
    try {
      remote = (await createSubResource(kind, collab.external_id, cfg.toRemote(data))) as Record<string, unknown>;
    } catch (err) {
      const status = err instanceof SoftcomCloudError ? err.status : 502;
      return jsonResponse({ error: "POST na agenda falhou", details: (err as Error).message }, status);
    }
    const localRow = cfg.fromRemote(remote, { companyId: collab.company_id, collaboratorId: collab.id });
    // Mescla com dados locais que o caller mandou (caso a API não retorne tudo)
    const merged = { ...data, ...localRow };
    const { data: inserted, error: insErr } = await sbAdmin
      .from(cfg.table)
      .insert(merged)
      .select("id")
      .single();
    if (insErr) {
      return jsonResponse({ error: "Insert local falhou (mas remoto criado)", details: insErr.message, remote }, 500);
    }
    return jsonResponse({ success: true, localId: inserted?.id, remote });
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (action === "update") {
    // Buscar external_id do item local
    const { data: item, error: itErr } = await sbAdmin
      .from(cfg.table)
      .select("external_id")
      .eq("id", localId!)
      .single();
    if (itErr || !item?.external_id) {
      return jsonResponse({ error: "Item não encontrado ou sem external_id" }, 404);
    }
    try {
      await updateSubResource(kind, collab.external_id!, item.external_id as string, cfg.toRemote(data));
    } catch (err) {
      const status = err instanceof SoftcomCloudError ? err.status : 502;
      return jsonResponse({ error: "PUT na agenda falhou", details: (err as Error).message }, status);
    }
    const { error: updErr } = await sbAdmin.from(cfg.table).update(data).eq("id", localId!);
    if (updErr) return jsonResponse({ error: "Update local falhou (remoto ok)", details: updErr.message }, 500);
    return jsonResponse({ success: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (action === "delete") {
    const { data: item } = await sbAdmin
      .from(cfg.table)
      .select("external_id")
      .eq("id", localId!)
      .single();
    if (item?.external_id) {
      try {
        await deleteSubResource(kind, collab.external_id!, item.external_id as string);
      } catch (err) {
        const status = err instanceof SoftcomCloudError ? err.status : 502;
        return jsonResponse({ error: "DELETE na agenda falhou", details: (err as Error).message }, status);
      }
    }
    const { error: delErr } = await sbAdmin.from(cfg.table).delete().eq("id", localId!);
    if (delErr) return jsonResponse({ error: "Delete local falhou (remoto ok)", details: delErr.message }, 500);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "action desconhecido" }, 400);
});

// ─────────────────────────────────────────────────────────────────────────────

async function checkPermission(
  // deno-lint-ignore no-explicit-any
  sbUser: any,
  userId: string,
  companyId: string,
  module: string,
  action: "can_view" | "can_create" | "can_edit" | "can_delete",
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
  return Boolean(first?.[action]);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
