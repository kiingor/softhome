// Testes do row-builder de recibo de férias (função pura extraída do
// postVacationToPayroll). Garante shape, cardinalidade e padrão de external_id.

import { describe, it, expect } from "vitest";
import { buildVacationPayrollRows } from "@/hooks/useVacations";
import { calcVacation } from "./vacationCalc";

const baseArgs = {
  requestId: "req-uuid",
  companyId: "comp-uuid",
  collaboratorId: "colab-uuid",
  storeId: "store-uuid",
  month: 8,
  year: 2026,
};

describe("buildVacationPayrollRows — cardinalidade", () => {
  it("básico (30 dias, sem extras, salário 5k) → 4 rows", () => {
    // ferias provento + 1/3 + INSS + IRRF (5k em férias paga IRPF — applyRedutor=false)
    const calc = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0 });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    expect(rows).toHaveLength(4);
    const types = rows.map((r) => r.type);
    expect(types).toContain("ferias");
    expect(types).toContain("inss");
    expect(types).toContain("irpf");
  });

  it("com gratificação → 5 rows (+gratificacao)", () => {
    const calc = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0, gratifications: 500 });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    expect(rows).toHaveLength(5);
    const gratRow = rows.find((r) => r.type === "gratificacao");
    expect(gratRow).toBeDefined();
    expect(gratRow!.value).toBe(500);
    expect(gratRow!.description).toContain("Gratificação");
  });

  it("com bonificação → 5 rows (+bonificacao)", () => {
    const calc = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0, bonifications: 300 });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    expect(rows).toHaveLength(5);
    const boniRow = rows.find((r) => r.type === "bonificacao");
    expect(boniRow).toBeDefined();
    expect(boniRow!.value).toBe(300);
    expect(boniRow!.description).toContain("isenta");
  });

  it("com abono (dias vendidos) → 6 rows (+abono +1/3 abono)", () => {
    const calc = calcVacation({ salary: 5000, daysTaken: 20, daysSold: 10 });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    // ferias provento + 1/3 + abono + 1/3 abono + inss + irrf
    expect(rows).toHaveLength(6);
    const feriasRows = rows.filter((r) => r.type === "ferias");
    expect(feriasRows).toHaveLength(4); // gozo + 1/3 gozo + abono + 1/3 abono
  });

  it("tudo junto (grat + boni + abono) → 8 rows", () => {
    const calc = calcVacation({
      salary: 8574.65, daysTaken: 20, daysSold: 10,
      gratifications: 500, bonifications: 300,
    });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    expect(rows).toHaveLength(8);
  });

  it("dias zero (calc zerado) → 0 rows", () => {
    const calc = calcVacation({ salary: 0, daysTaken: 0 });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    expect(rows).toHaveLength(0);
  });
});

describe("buildVacationPayrollRows — external_id pattern (idempotência)", () => {
  it("todos os IDs externos começam com ferias-{requestId}-", () => {
    const calc = calcVacation({
      salary: 8574.65, daysTaken: 20, daysSold: 10,
      gratifications: 500, bonifications: 300,
    });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    for (const r of rows) {
      expect(r.external_id.startsWith("ferias-req-uuid-")).toBe(true);
    }
  });

  it("cada row tem external_id único", () => {
    const calc = calcVacation({
      salary: 8574.65, daysTaken: 20, daysSold: 10,
      gratifications: 500, bonifications: 300,
    });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    const ids = rows.map((r) => r.external_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("kinds esperados: provento, terco, gratificacao, bonificacao, abono, terco-abono, inss, irrf", () => {
    const calc = calcVacation({
      salary: 8574.65, daysTaken: 20, daysSold: 10,
      gratifications: 500, bonifications: 300,
    });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    const kinds = rows.map((r) => r.external_id.replace("ferias-req-uuid-", ""));
    expect(kinds).toEqual(
      expect.arrayContaining([
        "provento",
        "terco",
        "gratificacao",
        "bonificacao",
        "abono",
        "terco-abono",
        "inss",
        "irrf",
      ]),
    );
  });

  it("re-chamar com mesmos args → rows idênticas (idempotência base)", () => {
    const calc = calcVacation({ salary: 5000, daysTaken: 30 });
    const r1 = buildVacationPayrollRows({ ...baseArgs, calc });
    const r2 = buildVacationPayrollRows({ ...baseArgs, calc });
    expect(r1).toEqual(r2);
  });
});

describe("buildVacationPayrollRows — shape correto", () => {
  it("is_fixed = false em todas as rows", () => {
    const calc = calcVacation({
      salary: 8574.65, daysTaken: 20, daysSold: 10,
      gratifications: 500, bonifications: 300,
    });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    for (const r of rows) {
      expect(r.is_fixed).toBe(false);
    }
  });

  it("month e year propagados", () => {
    const calc = calcVacation({ salary: 5000, daysTaken: 30 });
    const rows = buildVacationPayrollRows({ ...baseArgs, month: 11, year: 2027, calc });
    for (const r of rows) {
      expect(r.month).toBe(11);
      expect(r.year).toBe(2027);
    }
  });

  it("storeId null é aceito", () => {
    const calc = calcVacation({ salary: 5000, daysTaken: 30 });
    const rows = buildVacationPayrollRows({ ...baseArgs, storeId: null, calc });
    for (const r of rows) {
      expect(r.store_id).toBeNull();
    }
  });

  it("descrições têm contagem de dias correta", () => {
    const calc = calcVacation({ salary: 5000, daysTaken: 25, daysSold: 5 });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    const provento = rows.find((r) => r.external_id.endsWith("-provento"));
    expect(provento!.description).toBe("Férias (25 dias)");
    const abono = rows.find((r) => r.external_id.endsWith("-abono"));
    expect(abono!.description).toContain("5 dias");
  });
});

describe("buildVacationPayrollRows — soma bate com calc", () => {
  it("soma de proventos = bruto do calc", () => {
    const calc = calcVacation({
      salary: 8574.65, daysTaken: 20, daysSold: 10,
      gratifications: 500, bonifications: 300,
    });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    const proventos = rows
      .filter((r) => r.type === "ferias" || r.type === "gratificacao" || r.type === "bonificacao")
      .reduce((s, r) => s + r.value, 0);
    expect(Math.abs(proventos - calc.bruto)).toBeLessThanOrEqual(0.02);
  });

  it("soma de descontos = inss + irrf do calc", () => {
    const calc = calcVacation({ salary: 8574.65, daysTaken: 30 });
    const rows = buildVacationPayrollRows({ ...baseArgs, calc });
    const descontos = rows
      .filter((r) => r.type === "inss" || r.type === "irpf")
      .reduce((s, r) => s + r.value, 0);
    expect(Math.abs(descontos - (calc.inss + calc.irrf))).toBeLessThanOrEqual(0.01);
  });
});
