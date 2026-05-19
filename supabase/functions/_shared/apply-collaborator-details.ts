// Helper: sincroniza sub-abas de UM colaborador da api.softcom.cloud
// pra as tabelas locais. Reutilizado em:
//   - sync-collaborator-details (Edge Function dedicada, 1 colab por vez)
//   - sync-collaborators (no loop bulk, com flag includeDetails)
//
// Tabelas alimentadas: collaborator_absences, collaborator_leaves,
// collaborator_emails, collaborator_internships, collaborator_health_plans,
// collaborator_pdvs, vacation_periods, occupational_exams,
// collaborator_timeline_events.
//
// TODO próxima rodada: parentes→collaborator_dependents (kinship enum) e
// decimoTerceiro→bonus_entries (precisa bonus_period existente).

import {
  listAbsenteismos,
  listAfastamentos,
  listEmails,
  listEstagios,
  listEventos,
  listExames,
  listFerias,
  listPdvs,
  listPlanos,
} from "./softcom-cloud.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;

export interface ApplyDetailsResult {
  absences: ChildResult;
  emails: ChildResult;
  internships: ChildResult;
  leaves: ChildResult;
  pdvs: ChildResult;
  healthPlans: ChildResult;
  /** Lançamentos de desconto na folha gerados a partir do plano de saúde. */
  healthPlanDeductions: ChildResult;
  vacations: ChildResult;
  exams: ChildResult;
  timelineEvents: ChildResult;
}

interface ChildResult {
  fetched: number;
  upserted: number;
  error?: string;
}

export async function applyCollaboratorDetails(
  sbAdmin: Sb,
  ctx: {
    companyId: string;
    collaboratorId: string;  // uuid local
    remoteId: string;        // external_id (id da agenda)
  },
): Promise<ApplyDetailsResult> {
  const { companyId, collaboratorId: localId, remoteId } = ctx;
  const results: ApplyDetailsResult = {
    absences: { fetched: 0, upserted: 0 },
    emails: { fetched: 0, upserted: 0 },
    internships: { fetched: 0, upserted: 0 },
    leaves: { fetched: 0, upserted: 0 },
    pdvs: { fetched: 0, upserted: 0 },
    healthPlans: { fetched: 0, upserted: 0 },
    healthPlanDeductions: { fetched: 0, upserted: 0 },
    vacations: { fetched: 0, upserted: 0 },
    exams: { fetched: 0, upserted: 0 },
    timelineEvents: { fetched: 0, upserted: 0 },
  };

  // Buscar todas as sub-abas em paralelo
  let absRaw, lvRaw, emlRaw, intRaw, pdvRaw, plnRaw, feRaw, evRaw, exRaw;
  try {
    [absRaw, lvRaw, emlRaw, intRaw, pdvRaw, plnRaw, feRaw, evRaw, exRaw] = await Promise.all([
      listAbsenteismos(remoteId),
      listAfastamentos(remoteId),
      listEmails(remoteId),
      listEstagios(remoteId),
      listPdvs(remoteId),
      listPlanos(remoteId),
      listFerias(remoteId),
      listEventos(remoteId),
      listExames(remoteId),
    ]);
  } catch (err) {
    // Falha de rede afeta todas as filhas. Reporta no primeiro slot.
    results.absences.error = (err as Error).message;
    return results;
  }

  // Mapa store nome → uuid local pra resolver PDVs
  const { data: stores } = await sbAdmin
    .from("stores")
    .select("id, store_name, external_id")
    .eq("company_id", companyId);
  const storeByName = new Map<string, string>(
    (stores ?? []).map((s: { id: string; store_name: string }) => [
      s.store_name.toLowerCase(),
      s.id,
    ]),
  );

  results.absences = await upsertChildren(sbAdmin, "collaborator_absences", absRaw.map((a) => ({
    company_id: companyId,
    collaborator_id: localId,
    external_id: String(a.id),
    occurred_on: parseDate(a.datas),
    days: typeof a.dias === "number" ? a.dias : null,
    reason: a.motivo ?? null,
    notes: a.observacao ?? null,
    has_certificate: a.atestado != null && a.atestado !== 0,
    bank_hours: typeof a.bancoHoras === "number" ? a.bancoHoras : 0,
  })));

  results.leaves = await upsertChildren(sbAdmin, "collaborator_leaves", lvRaw.map((l) => ({
    company_id: companyId,
    collaborator_id: localId,
    external_id: String(l.id),
    reason_code: typeof l.motivo === "number" ? l.motivo : null,
    start_date: parseDate(l.dataInicial),
    end_date: parseDate(l.dataFinal),
    description: l.descricao ?? null,
    has_certificate: Boolean(l.atestado),
    posted_by_username: l.lancamentoUsuario ?? null,
    posted_at: l.lancamentoDataHora ?? null,
    compensated: typeof l.compensado === "number" ? l.compensado : null,
    trip_id: typeof l.idViagem === "number" ? l.idViagem : null,
  })));

  results.emails = await upsertChildren(sbAdmin, "collaborator_emails", emlRaw.map((m) => ({
    company_id: companyId,
    collaborator_id: localId,
    external_id: String(m.id),
    email: m.email,
  })));

  results.internships = await upsertChildren(sbAdmin, "collaborator_internships", intRaw.map((s) => ({
    company_id: companyId,
    collaborator_id: localId,
    external_id: String(s.id),
    start_date: parseDate(s.dataInicial),
    end_date: parseDate(s.dataFinal),
    is_renewal: Boolean(s.renovacao),
    notification_sent: Boolean(s.notificacaoEnviada),
    flagged: s.marcar !== false,
  })));

  results.pdvs = await upsertChildren(sbAdmin, "collaborator_pdvs", pdvRaw.map((p) => ({
    company_id: companyId,
    collaborator_id: localId,
    external_id: String(p.id),
    store_id: storeByName.get(String(p.pdv).toLowerCase()) ?? null,
    pdv_name: p.pdv,
    f10: typeof p.f10 === "number" ? p.f10 : 0,
  })));

  // Planos: importa só os ativos com valor. Desativados/zerados na agenda viram
  // ruído (histórico que o RH não quer ver mais). Quem precisar do histórico
  // consulta a agenda direto.
  const planosAtivos = plnRaw.filter((p) => {
    if (p.desativado) return false;
    const v = typeof p.valorPlano === "number" ? p.valorPlano : 0;
    return v > 0;
  });
  results.healthPlans = await upsertChildren(sbAdmin, "collaborator_health_plans", planosAtivos.map((p) => ({
    company_id: companyId,
    collaborator_id: localId,
    external_id: String(p.id),
    plan_name: p.plano ?? null,
    registration_code: p.matriculaPlano ?? null,
    start_date: parseDate(p.dataInicio),
    beneficiary_type: p.tipo ?? null,
    beneficiary_name: p.nomes ?? null,
    beneficiary_birth: parseDate(p.dataNascimento),
    beneficiary_cpf: p.cpf ?? null,
    plan_value: typeof p.valorPlano === "number" ? p.valorPlano : null,
    notes: p.obs ?? null,
    is_disabled: false,
    disabled_at: null,
  })));

  // ──────────────────────────────────────────────────────────────────────
  // Desconto na folha por plano de saúde
  // ──────────────────────────────────────────────────────────────────────
  // Cada plano ativo vira 1 payroll_entry type='desconto' (o `valorPlano` é
  // o que o colaborador paga). External_id no formato
  // `plano-saude-{remoteId}-{YYYY}{MM}` pra:
  //   - não colidir com o unique (collaborator_id, external_id) entre meses
  //   - permitir wipe escopado por mês (preserva competências fechadas)
  //
  // Estratégia: DELETE entries com prefixo `plano-saude-%` SÓ do mês corrente,
  // depois INSERT os ativos. Meses passados (fechados/exportados) ficam
  // intocados. Manuais (sem o prefixo) também.
  const { month, year } = nowMonthYear();
  const monthKey = `${year}${String(month).padStart(2, "0")}`;
  const deductionRows = planosAtivos
    .filter((p) => typeof p.valorPlano === "number" && (p.valorPlano as number) > 0)
    .map((p) => {
      const planName = p.plano ?? "—";
      const beneficiary = p.tipo === "TITULAR"
        ? "titular"
        : `dependente${p.nomes ? `: ${p.nomes}` : ""}`;
      return {
        company_id: companyId,
        collaborator_id: localId,
        external_id: `plano-saude-${p.id}-${monthKey}`,
        type: "desconto" as const,
        description: `Plano de saúde — ${planName} (${beneficiary})`,
        value: p.valorPlano as number,
        month,
        year,
        is_fixed: true,
      };
    });

  try {
    // 1. Limpa descontos de plano-saude SÓ deste mês/ano (preserva fechados)
    const { error: delDedErr } = await sbAdmin
      .from("payroll_entries")
      .delete()
      .eq("collaborator_id", localId)
      .eq("month", month)
      .eq("year", year)
      .like("external_id", "plano-saude-%");
    if (delDedErr) {
      results.healthPlanDeductions = {
        fetched: deductionRows.length,
        upserted: 0,
        error: `delete: ${delDedErr.message}`,
      };
    } else if (deductionRows.length === 0) {
      // Sem planos ativos = sem desconto neste mês. Limpeza já feita.
      results.healthPlanDeductions = { fetched: 0, upserted: 0 };
    } else {
      // 2. Insere os descontos do mês corrente
      const { data: insDed, error: insDedErr } = await sbAdmin
        .from("payroll_entries")
        .insert(deductionRows)
        .select("id");
      if (insDedErr) {
        results.healthPlanDeductions = {
          fetched: deductionRows.length,
          upserted: 0,
          error: `insert: ${insDedErr.message}`,
        };
      } else {
        results.healthPlanDeductions = {
          fetched: deductionRows.length,
          upserted: insDed?.length ?? deductionRows.length,
        };
      }
    }
  } catch (err) {
    results.healthPlanDeductions = {
      fetched: deductionRows.length,
      upserted: 0,
      error: (err as Error).message,
    };
  }

  // Férias — start/end NOT NULL; usamos gozo > aquisitivo; senão pula
  const feriasRows = feRaw
    .map((f) => {
      const start = parseDate(f.periodoInGozo) ?? parseDate(f.periodoIn);
      const end = parseDate(f.periodoFnGozo) ?? parseDate(f.periodoFn);
      if (!start || !end) return null;
      return {
        company_id: companyId,
        collaborator_id: localId,
        external_id: String(f.id),
        start_date: start,
        end_date: end,
        status: f.pago === "S" ? "paid" : "pending",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  results.vacations = await upsertChildren(sbAdmin, "vacation_periods", feriasRows);

  // Exames
  const examRows = exRaw
    .map((e) => {
      const due = parseDate(e.dataPrevista) ?? parseDate(e.dataRealizado);
      if (!due) return null;
      return {
        company_id: companyId,
        collaborator_id: localId,
        external_id: String(e.id),
        exam_type: e.exameTipo ?? "avulso",
        due_date: due,
        completed_date: parseDate(e.dataRealizado),
        status: e.dataRealizado ? "realizado" : "pendente",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  results.exams = await upsertChildren(sbAdmin, "occupational_exams", examRows);

  // Eventos — vão pra collaborator_timeline_events com event_type='manual'
  const eventRows = evRaw
    .map((ev) => {
      const eff = parseDate(ev.dataEvento) ?? parseDate(ev.datas);
      if (!eff) return null;
      return {
        company_id: companyId,
        collaborator_id: localId,
        external_id: String(ev.id),
        event_type: "manual" as const,
        effective_date: eff,
        reason: ev.evento ?? null,
        to_value: {
          evento: ev.evento ?? null,
          funcao: ev.funcao ?? null,
          observacao: ev.observacao ?? null,
          valorPago: ev.valorPago ?? null,
          lacrar: ev.lacrar ?? null,
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  results.timelineEvents = await upsertChildren(sbAdmin, "collaborator_timeline_events", eventRows);

  return results;
}

/**
 * Sincroniza a tabela com estado completo do remoto:
 * 1. DELETE de todas as rows com external_id IS NOT NULL desse colab
 *    (preserva manuais — sem external_id)
 * 2. INSERT das rows novas
 *
 * Isso garante zero duplicação mesmo se sync foi rodada várias vezes com
 * comportamentos antigos, e remove rows que sumiram da agenda.
 */
async function upsertChildren(
  sbAdmin: Sb,
  table: string,
  rows: Record<string, unknown>[],
): Promise<ChildResult> {
  if (rows.length === 0) return { fetched: 0, upserted: 0 };
  const collabId = rows[0].collaborator_id as string;

  // 1. Limpa rows sincronizadas anteriores (mantém manuais)
  const { error: delErr } = await sbAdmin
    .from(table)
    .delete()
    .eq("collaborator_id", collabId)
    .not("external_id", "is", null);
  if (delErr) return { fetched: rows.length, upserted: 0, error: `delete: ${delErr.message}` };

  // 2. Insere o estado atual
  const { data, error } = await sbAdmin
    .from(table)
    .insert(rows)
    .select("id");
  if (error) return { fetched: rows.length, upserted: 0, error: `insert: ${error.message}` };
  return { fetched: rows.length, upserted: data?.length ?? 0 };
}

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Mês/ano atuais em UTC — mesma convenção do apply-financials.ts pra deixar
// salário base e desconto de plano de saúde caindo na mesma competência.
function nowMonthYear(): { month: number; year: number } {
  const d = new Date();
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}
