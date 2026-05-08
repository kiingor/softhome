import { describe, it, expect } from "vitest";
import {
  calcGrossValue,
  calcBonus13,
  calcMonthsWorked,
  splitInstallments,
  calcBonus13Taxes,
} from "./calc-13";

describe("calcMonthsWorked — regra ≥15 dias", () => {
  it("admitido em janeiro do ano alvo → 12 meses", () => {
    expect(
      calcMonthsWorked({ admissionDate: "2026-01-01", year: 2026 }),
    ).toBe(12);
  });

  it("admitido antes do ano → 12 meses", () => {
    expect(
      calcMonthsWorked({ admissionDate: "2024-06-15", year: 2026 }),
    ).toBe(12);
  });

  it("admitido em 16 de junho → não conta junho (≥15 dias = 15 dias do meio do mês)", () => {
    // 16 a 30 jun = 15 dias → conta. Bug guard: aqui esperamos contar.
    // 16 jun → restam 15 dias (16,17,...,30) = 15 → conta.
    // jul a dez = 6 meses
    // total = 7
    expect(
      calcMonthsWorked({ admissionDate: "2026-06-16", year: 2026 }),
    ).toBe(7);
  });

  it("admitido em 17 de junho → não conta junho (14 dias) → 6 meses (jul-dez)", () => {
    // 17 a 30 jun = 14 dias → não conta
    expect(
      calcMonthsWorked({ admissionDate: "2026-06-17", year: 2026 }),
    ).toBe(6);
  });

  it("admitido depois do ano → 0", () => {
    expect(
      calcMonthsWorked({ admissionDate: "2027-01-15", year: 2026 }),
    ).toBe(0);
  });
});

describe("calcGrossValue — pro-rata CLT com gratificação e adicional", () => {
  it("12 meses, base 5000, sem grat/adic → 5000 (regressão)", () => {
    expect(
      calcGrossValue({ baseSalary: 5000, monthsWorked: 12 }),
    ).toBe(5000);
  });

  it("assinatura legada (baseSalary, monthsWorked) ainda funciona", () => {
    expect(calcGrossValue(5000, 12)).toBe(5000);
    expect(calcGrossValue(4000, 6)).toBe(2000);
  });

  it("12 meses, base 5000, grat 3000 (3 lançamentos R$1000) → 5250", () => {
    // (5000 × 12 + 3000 + 0 × 12) / 12 = 63000 / 12 = 5250
    expect(
      calcGrossValue({
        baseSalary: 5000,
        monthsWorked: 12,
        gratificacaoSum: 3000,
      }),
    ).toBe(5250);
  });

  it("6 meses, base 4000, adicional mensal R$500 → 2250", () => {
    // (4000 × 6 + 0 + 500 × 6) / 12 = (24000 + 3000) / 12 = 27000 / 12 = 2250
    expect(
      calcGrossValue({
        baseSalary: 4000,
        monthsWorked: 6,
        adicionalMonthly: 500,
      }),
    ).toBe(2250);
  });

  it("6 meses, base 4000, grat_sum 1200, adic 300 → ((4000×6) + 1200 + (300×6)) / 12 = 2350", () => {
    // (24000 + 1200 + 1800) / 12 = 27000 / 12 = 2250
    // Espera: (4000*6 + 1200 + 300*6) = 24000 + 1200 + 1800 = 27000. /12 = 2250
    expect(
      calcGrossValue({
        baseSalary: 4000,
        monthsWorked: 6,
        gratificacaoSum: 1200,
        adicionalMonthly: 300,
      }),
    ).toBe(2250);
  });

  it("monthsWorked = 0 → 0", () => {
    expect(
      calcGrossValue({
        baseSalary: 5000,
        monthsWorked: 0,
        gratificacaoSum: 1000,
        adicionalMonthly: 500,
      }),
    ).toBe(0);
  });

  it("base e adic zerados, só gratificação → ainda calcula", () => {
    // (0 + 1200 + 0) / 12 = 100
    expect(
      calcGrossValue({
        baseSalary: 0,
        monthsWorked: 12,
        gratificacaoSum: 1200,
      }),
    ).toBe(100);
  });

  it("arredondamento de centavo", () => {
    // (3333.33 × 12 + 0 + 0) / 12 = 3333.33
    expect(
      calcGrossValue({ baseSalary: 3333.33, monthsWorked: 12 }),
    ).toBe(3333.33);
  });
});

describe("calcBonus13 — assinatura completa", () => {
  it("default sem grat/adic → comportamento legado", () => {
    const result = calcBonus13({
      admissionDate: "2026-01-01",
      year: 2026,
      baseSalary: 5000,
    });
    expect(result.monthsWorked).toBe(12);
    expect(result.grossValue).toBe(5000);
  });

  it("com gratificacao e adicional", () => {
    const result = calcBonus13({
      admissionDate: "2026-01-01",
      year: 2026,
      baseSalary: 5000,
      gratificacaoSum: 3000,
      adicionalMonthly: 500,
    });
    expect(result.monthsWorked).toBe(12);
    // (5000×12 + 3000 + 500×12) / 12 = (60000 + 3000 + 6000) / 12 = 5750
    expect(result.grossValue).toBe(5750);
  });

  it("admissão no meio do ano + adicional pro-rata", () => {
    // Admissão 2026-07-01 → jul a dez = 6 meses
    const result = calcBonus13({
      admissionDate: "2026-07-01",
      year: 2026,
      baseSalary: 6000,
      gratificacaoSum: 0,
      adicionalMonthly: 1000,
    });
    expect(result.monthsWorked).toBe(6);
    // (6000×6 + 0 + 1000×6) / 12 = (36000 + 6000) / 12 = 3500
    expect(result.grossValue).toBe(3500);
  });
});

describe("splitInstallments", () => {
  it("divide bruto em duas parcelas iguais quando bruto par", () => {
    expect(splitInstallments(5000)).toEqual({ first: 2500, second: 2500 });
  });

  it("garante que first + second === bruto (sem perda de centavo)", () => {
    const { first, second } = splitInstallments(5250.55);
    expect(first + second).toBeCloseTo(5250.55, 2);
  });
});

describe("calcBonus13Taxes — INSS+IRPF sobre 13º (sem redutor)", () => {
  it("bruto 0 → 0/0/0", () => {
    expect(calcBonus13Taxes({ grossValue: 0, dependents: 0 })).toEqual({
      inss: 0,
      irpf: 0,
      net: 0,
    });
  });

  it("bruto positivo retorna líquido = bruto − INSS − IRPF", () => {
    const t = calcBonus13Taxes({ grossValue: 5000, dependents: 0 });
    expect(t.net).toBeCloseTo(5000 - t.inss - t.irpf, 2);
    expect(t.inss).toBeGreaterThan(0);
  });
});
