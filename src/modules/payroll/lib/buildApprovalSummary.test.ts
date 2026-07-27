import { describe, it, expect } from "vitest";
import {
  buildApprovalSummary,
  sumApprovalTotals,
} from "./buildApprovalSummary";
import type { PayrollEntryWithCollaborator } from "../types";

// Helper: monta uma entry mínima com o que a soma usa.
function entry(
  collaboratorId: string,
  name: string,
  type: string,
  value: number,
  extra: Partial<PayrollEntryWithCollaborator> = {},
): PayrollEntryWithCollaborator {
  return {
    id: `${collaboratorId}-${type}-${value}`,
    collaborator_id: collaboratorId,
    type,
    value,
    description: null,
    collaborator: { id: collaboratorId, name },
    ...extra,
  } as unknown as PayrollEntryWithCollaborator;
}

describe("buildApprovalSummary", () => {
  it("separa bruto, descontos e líquido de um CLT típico", () => {
    const rows = buildApprovalSummary([
      entry("c1", "Ana", "salario_base", 3000),
      entry("c1", "Ana", "inss", 270),
      entry("c1", "Ana", "irpf", 50),
      entry("c1", "Ana", "fgts", 240),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].bruto).toBe(3000);
    expect(rows[0].descontos).toBe(320);
    expect(rows[0].liquido).toBe(2680);
    // FGTS é custo do empregador: fora do líquido.
    expect(rows[0].fgts).toBe(240);
    expect(rows[0].custoTotal).toBe(3240);
  });

  it("mantém bonificação (custo de setor) FORA do líquido da pessoa", () => {
    const rows = buildApprovalSummary([
      entry("c1", "Ana", "salario_base", 3000),
      entry("c1", "Ana", "bonificacao", 4000),
    ]);

    expect(rows[0].bruto).toBe(3000);
    expect(rows[0].liquido).toBe(3000);
    expect(rows[0].bonificacao).toBe(4000);
    expect(rows[0].custoTotal).toBe(7000);
  });

  it("NÃO esconde quem fica com líquido negativo (ao contrário da aba Pagamentos)", () => {
    const rows = buildApprovalSummary([
      entry("c1", "Ana", "salario_base", 1000),
      entry("c1", "Ana", "emprestimo", 1200),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].liquido).toBe(-200);

    const totals = sumApprovalTotals(rows);
    expect(totals.pessoas).toBe(1);
    expect(totals.liquidoNaoPositivo).toBe(1);
    expect(totals.liquido).toBe(-200);
  });

  it("soma descontos avulsos (VT, plano de saúde) junto com os impostos", () => {
    const rows = buildApprovalSummary([
      entry("c1", "Ana", "salario_base", 2000),
      entry("c1", "Ana", "desconto", 120),
      entry("c1", "Ana", "desconto", 228.08),
      entry("c1", "Ana", "falta", 50),
      entry("c1", "Ana", "adiantamento", 100),
    ]);

    expect(rows[0].descontos).toBe(498.08);
    expect(rows[0].liquido).toBe(1501.92);
  });

  it("agrupa por colaborador e ordena por nome", () => {
    const rows = buildApprovalSummary([
      entry("c2", "Bruno", "salario_base", 1000),
      entry("c1", "Ana", "salario_base", 2000),
      entry("c2", "Bruno", "hora_extra", 200),
    ]);

    expect(rows.map((r) => r.name)).toEqual(["Ana", "Bruno"]);
    expect(rows[1].bruto).toBe(1200);
    expect(rows[1].entries).toHaveLength(2);
  });

  it("não acumula erro de centavo em valores quebrados", () => {
    const rows = buildApprovalSummary([
      entry("c1", "Ana", "salario_base", 2746.14),
      entry("c1", "Ana", "inss", 222.83),
      entry("c1", "Ana", "desconto", 0.1),
      entry("c1", "Ana", "desconto", 0.2),
    ]);

    expect(rows[0].descontos).toBe(223.13);
    expect(rows[0].liquido).toBe(2523.01);
  });

  it("totais somam todas as pessoas", () => {
    const totals = sumApprovalTotals(
      buildApprovalSummary([
        entry("c1", "Ana", "salario_base", 2000),
        entry("c1", "Ana", "inss", 180),
        entry("c1", "Ana", "fgts", 160),
        entry("c2", "Bruno", "salario_base", 3000),
        entry("c2", "Bruno", "inss", 270),
        entry("c2", "Bruno", "fgts", 240),
        entry("c2", "Bruno", "bonificacao", 500),
      ]),
    );

    expect(totals.pessoas).toBe(2);
    expect(totals.bruto).toBe(5000);
    expect(totals.descontos).toBe(450);
    expect(totals.liquido).toBe(4550);
    expect(totals.fgts).toBe(400);
    expect(totals.bonificacao).toBe(500);
    expect(totals.custoTotal).toBe(5900);
    expect(totals.liquidoNaoPositivo).toBe(0);
  });

  it("lista vazia devolve totais zerados, não NaN", () => {
    const totals = sumApprovalTotals(buildApprovalSummary([]));
    expect(totals.pessoas).toBe(0);
    expect(totals.liquido).toBe(0);
    expect(totals.custoTotal).toBe(0);
  });
});
