import {
  isEarning,
  MANUAL_DEBIT_TYPES,
  ENTRY_TYPE_LABELS,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// LINHAS DE PAGAMENTO — quanto cada colaborador recebe, e por quê.
//
// Esta é a fórmula que decide o valor de um PIX. Ela vivia inline num useMemo
// dentro de PaymentsTab.tsx; saiu de lá por dois motivos:
//
//   1. Não dava pra testar. As regras abaixo (estorno, partição de férias,
//      mescla, clamp) só existiam como comentário ao lado do código.
//   2. O servidor precisa da mesma conta. O cliente não pode ser fonte da
//      verdade de quanto pagar — quem manda o valor pro banco é o backend.
//
// O destino final desta lógica é o builder SQL de `payroll_payable_lines`,
// porque o banco é o único runtime que o browser e o Deno das edge functions
// dividem (o repo já carrega a dívida de um espelho manual em
// _shared/clt-calc.ts, e espelho que dessincroniza numa fórmula de pagamento
// produz PIX errado e irreversível). Até o cutover, este arquivo é o ORÁCULO:
// os mesmos casos rodam aqui e no SQL, e o teste de paridade falha se
// divergirem em um centavo.
//
// NÃO mude uma regra aqui sem mudar no SQL e sem atualizar os testes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pagamento mensal — o que entra na MESMA linha (mesmo PIX).
 *
 * Regra de produto: o colaborador recebe UM pagamento com salário base,
 * gratificações, hora extra, periculosidade e salário-família juntos.
 *
 * É também o recorte correto pro líquido: o INSS/IRPF do mês incide sobre essa
 * base (hora extra e periculosidade integram a base — ver
 * INSS_TAXABLE_EARNING_TYPES em ../types), então o imposto descontado aqui bate
 * com o contracheque em vez de sair todo do salário base.
 *
 * FORA daqui, cada um em sua linha: bonificação (custo de setor) e carro
 * agregado — a diretoria confere esses à parte. Benefício pagável, atestado,
 * VT e salário retroativo também seguem em linha própria.
 *
 * A ordem do array é a ordem de exibição no popup de detalhe.
 */
export const MONTHLY_MERGED_TYPES = [
  "salario_base",
  "gratificacao",
  "hora_extra",
  "periculosidade",
  "salario_familia",
] as const;

const MONTHLY_MERGED_SET = new Set<string>(MONTHLY_MERGED_TYPES);
const MANUAL_DEBIT_SET = new Set<string>(MANUAL_DEBIT_TYPES);

/**
 * Forma mínima que a fórmula precisa de um lançamento.
 *
 * Deliberadamente estrutural em vez de `PayrollEntryWithCollaborator`: assim o
 * teste monta um caso com seis campos em vez da linha inteira do banco, e a
 * mesma função serve a qualquer chamador que tenha esses dados.
 */
export interface PayableEntryInput {
  id: string;
  collaborator_id: string;
  type: string;
  value: number | string;
  description?: string | null;
  external_id?: string | null;
  is_payable?: boolean | null;
  collaborator?: { name?: string | null } | null;
}

export interface PaymentLineComponent {
  /** Lançamento de origem — é o que amarra a linha ao que foi lançado. */
  entryId: string;
  type: string;
  label: string;
  value: number;
}

export interface PaymentLineDiscount {
  label: string;
  value: number;
}

export interface PaymentLine {
  /**
   * Lançamento âncora. O id dele identifica o pagamento em
   * `payroll_payments.entry_id`, então precisa ser o mais estável possível
   * entre recálculos — por isso preferimos o salário base.
   */
  entryId: string;
  collaboratorId: string;
  collaboratorName: string;
  kind: "mensal" | "ferias" | "avulso";
  /** Tipos que a linha somou — viram as tags na listagem. */
  types: string[];
  /** Rótulo da linha na tela. */
  description: string;
  gross: number;
  inss: number;
  irpf: number;
  /** Débitos manuais (falta, adiantamento, desconto, empréstimo). */
  otherDeductions: number;
  /** `gross - inss - irpf - otherDeductions`. Sempre > 0. */
  amount: number;
  components: PaymentLineComponent[];
  discounts: PaymentLineDiscount[];
}

const num = (v: number | string): number => Number(v);

/** Lançamento veio do fluxo de férias? (`external_id` = `ferias-<reqId>-<kind>`) */
const isVacEntry = (e: PayableEntryInput): boolean =>
  (e.external_id ?? "").startsWith("ferias-");

const labelOf = (e: PayableEntryInput): string =>
  e.description ?? ENTRY_TYPE_LABELS[e.type] ?? e.type;

/**
 * Monta as linhas pagáveis a partir dos lançamentos do período.
 *
 * Recebe **todos** os lançamentos, não só os proventos: INSS, IRPF e os débitos
 * manuais precisam ser vistos para serem subtraídos.
 */
export function buildPaymentLines(entries: PayableEntryInput[]): PaymentLine[] {
  // Só proventos. Benefício entra apenas com is_payable=true (categoria
  // 'adicional'); os demais são vouchers/serviços, pagos por outro fluxo.
  // FGTS fica de fora por não ser desconto do colaborador — é encargo do
  // empregador.
  const earningOnly = entries.filter(
    (e) => isEarning(e.type) && (e.type !== "beneficio" || e.is_payable === true),
  );

  // Estornos: quando o RH lança um valor e depois o mesmo valor negativo, o par
  // se anula. Somamos por (colaborador, tipo) e derrubamos o grupo inteiro
  // quando o saldo não é positivo.
  const groupSum = new Map<string, number>();
  for (const e of earningOnly) {
    const key = `${e.collaborator_id}::${e.type}`;
    groupSum.set(key, (groupSum.get(key) ?? 0) + num(e.value));
  }

  const survivors = earningOnly.filter((e) => {
    const sum = groupSum.get(`${e.collaborator_id}::${e.type}`) ?? 0;
    if (sum <= 0) return false;
    return num(e.value) > 0;
  });

  // INSS/IRPF por colaborador, separando o do mês do de férias. O cheque de
  // férias é um pagamento distinto (CLT art. 145, D-2 do gozo) e carrega os
  // próprios impostos, marcados com o mesmo prefixo `ferias-`.
  interface CollabTaxes {
    inss: number;
    irpf: number;
  }
  const monthlyTaxes = new Map<string, CollabTaxes>();
  const vacationTaxes = new Map<string, CollabTaxes>();
  for (const e of entries) {
    if (e.type !== "inss" && e.type !== "irpf") continue;
    const target = isVacEntry(e) ? vacationTaxes : monthlyTaxes;
    const cur = target.get(e.collaborator_id) ?? { inss: 0, irpf: 0 };
    if (e.type === "inss") cur.inss += num(e.value);
    else cur.irpf += num(e.value);
    target.set(e.collaborator_id, cur);
  }

  // Débitos manuais que reduzem o líquido: desconto (plano de saúde, VT),
  // adiantamento, falta e empréstimo. Só incidem no pagamento mensal.
  const discountsByCollab = new Map<string, PaymentLineDiscount[]>();
  for (const e of entries) {
    if (!MANUAL_DEBIT_SET.has(e.type)) continue;
    if (isVacEntry(e)) continue; // defensivo: férias não tem débito manual
    const v = num(e.value);
    if (!(v > 0)) continue;
    const arr = discountsByCollab.get(e.collaborator_id) ?? [];
    arr.push({ label: labelOf(e), value: v });
    discountsByCollab.set(e.collaborator_id, arr);
  }

  const byCollab = new Map<string, PayableEntryInput[]>();
  for (const e of survivors) {
    const arr = byCollab.get(e.collaborator_id) ?? [];
    arr.push(e);
    byCollab.set(e.collaborator_id, arr);
  }

  const lines: PaymentLine[] = [];

  for (const [collabId, list] of byCollab) {
    const collaboratorName = list[0]?.collaborator?.name ?? "";
    const vacEntries = list.filter(isVacEntry);
    const monthlyList = list.filter((e) => !isVacEntry(e));

    const taxes = monthlyTaxes.get(collabId) ?? { inss: 0, irpf: 0 };
    const collabDiscounts = discountsByCollab.get(collabId) ?? [];
    const totalDiscount = collabDiscounts.reduce((s, d) => s + d.value, 0);

    // ─── Mensal ──────────────────────────────────────────────────────────
    // Ordena pela ordem de MONTHLY_MERGED_TYPES pra o popup sair sempre na
    // mesma sequência (salário primeiro, depois os adicionais).
    const merged = MONTHLY_MERGED_TYPES.flatMap((t) =>
      monthlyList.filter((e) => e.type === t),
    );
    const others = monthlyList.filter((e) => !MONTHLY_MERGED_SET.has(e.type));

    if (merged.length > 0) {
      // Âncora: o salário base quando existe — o id dele é o mais estável entre
      // recálculos, então a marcação de "pago" sobrevive.
      const primary = merged.find((e) => e.type === "salario_base") ?? merged[0];
      const components: PaymentLineComponent[] = merged.map((e) => ({
        entryId: e.id,
        type: e.type,
        // Salário base mantém rótulo fixo; os adicionais mostram a descrição do
        // lançamento (é onde o RH escreve o motivo).
        label: e.type === "salario_base" ? "Salário Base" : labelOf(e),
        value: num(e.value),
      }));
      const gross = components.reduce((s, c) => s + c.value, 0);
      const amount = gross - taxes.inss - taxes.irpf - totalDiscount;

      // Líquido não positivo não vira pagamento. A tela de aprovação mostra
      // essa pessoa (ver buildApprovalSummary), aqui ela some de propósito —
      // não existe PIX de zero ou negativo.
      if (amount > 0) {
        lines.push({
          entryId: primary.id,
          collaboratorId: collabId,
          collaboratorName,
          kind: "mensal",
          types: MONTHLY_MERGED_TYPES.filter((t) =>
            merged.some((e) => e.type === t),
          ),
          description: components.map((c) => c.label).join(" · "),
          gross,
          inss: taxes.inss,
          irpf: taxes.irpf,
          otherDeductions: totalDiscount,
          amount,
          components,
          discounts: collabDiscounts,
        });
      }
    }

    // ─── Avulsos ─────────────────────────────────────────────────────────
    // Fora da mescla (bonificação/custo de setor, carro agregado, benefício
    // pagável, atestado, VT, salário retroativo): cada um em sua linha, sem
    // imposto e sem desconto — os do mês já foram consumidos pela linha mensal.
    for (const e of others) {
      const value = num(e.value);
      lines.push({
        entryId: e.id,
        collaboratorId: collabId,
        collaboratorName,
        kind: "avulso",
        types: [e.type],
        description: labelOf(e),
        gross: value,
        inss: 0,
        irpf: 0,
        otherDeductions: 0,
        amount: value,
        components: [
          { entryId: e.id, type: e.type, label: labelOf(e), value },
        ],
        discounts: [],
      });
    }

    // ─── Férias ──────────────────────────────────────────────────────────
    // Todos os `ferias-*` numa linha só: férias + 1/3 + gratificação s/férias,
    // menos INSS e IRRF s/férias. Cheque distinto do mensal.
    if (vacEntries.length > 0) {
      // Âncora: prefere o provento principal (`ferias`), senão a primeira.
      const primary = vacEntries.find((e) => e.type === "ferias") ?? vacEntries[0];
      const vacTax = vacationTaxes.get(collabId) ?? { inss: 0, irpf: 0 };

      const components: PaymentLineComponent[] = vacEntries.map((e) => ({
        entryId: e.id,
        type: e.type,
        label: labelOf(e),
        value: num(e.value),
      }));
      const gross = components.reduce((s, c) => s + c.value, 0);
      const amount = gross - vacTax.inss - vacTax.irpf;

      if (amount > 0) {
        lines.push({
          entryId: primary.id,
          collaboratorId: collabId,
          collaboratorName,
          kind: "ferias",
          // Férias se apresenta como um pagamento próprio: 1 tag só, o detalhe
          // (1/3, gratificação s/férias) fica no popup.
          types: ["ferias"],
          description: "Pagamento de Férias",
          gross,
          inss: vacTax.inss,
          irpf: vacTax.irpf,
          otherDeductions: 0,
          amount,
          components,
          discounts: [],
        });
      }
    }
  }

  // Ordem estável: por nome do colaborador, depois pela descrição da linha.
  lines.sort((a, b) => {
    const cmp = a.collaboratorName.localeCompare(b.collaboratorName, "pt-BR");
    if (cmp !== 0) return cmp;
    return a.description.localeCompare(b.description, "pt-BR");
  });

  return lines;
}
