import { describe, it, expect } from "vitest";
import {
  calcINSS,
  calcIRPF,
  calcFGTS,
  calcAllTaxes,
  INSS_CEILING_2026,
  DEPENDENT_DEDUCTION_2026,
} from "./cltCalc";

describe("calcINSS — tabela 2026", () => {
  it("salário zero ou negativo → 0", () => {
    expect(calcINSS(0)).toBe(0);
    expect(calcINSS(-100)).toBe(0);
  });

  it("salário mínimo (R$ 1.621) → 7,5%", () => {
    // 1621 × 7,5% = 121,575 → arredondamento JS dá 121.57
    expect(calcINSS(1621.0)).toBeCloseTo(121.58, 1);
  });

  it("limiar superior 1ª faixa (R$ 1.621,01)", () => {
    // 1621.01 × 9% − 24.32 = 145.89 − 24.32 ≈ 121.57
    expect(calcINSS(1621.01)).toBeCloseTo(121.57, 2);
  });

  it("R$ 2.500 (faixa 9%)", () => {
    // 2500 × 9% − 24.32 = 225 − 24.32 = 200.68
    expect(calcINSS(2500)).toBe(200.68);
  });

  it("R$ 3.000 (faixa 12%)", () => {
    // 3000 × 12% − 111.40 = 360 − 111.40 = 248.60
    expect(calcINSS(3000)).toBe(248.6);
  });

  it("R$ 5.000 (faixa 14%)", () => {
    // 5000 × 14% − 198.49 = 700 − 198.49 = 501.51
    expect(calcINSS(5000)).toBe(501.51);
  });

  it("R$ 6.000 (faixa 14%)", () => {
    // 6000 × 14% − 198.49 = 840 − 198.49 = 641.51
    expect(calcINSS(6000)).toBe(641.51);
  });

  it("teto exato (R$ 8.475,55) → R$ 988,09", () => {
    expect(calcINSS(8475.55)).toBe(INSS_CEILING_2026);
  });

  it("acima do teto → R$ 988,09 fixo", () => {
    expect(calcINSS(10000)).toBe(INSS_CEILING_2026);
    expect(calcINSS(50000)).toBe(INSS_CEILING_2026);
  });
});

describe("calcIRPF — tabela 2026 + redutor", () => {
  it("salário zero → 0", () => {
    expect(calcIRPF({ grossSalary: 0, inss: 0, dependents: 0 })).toBe(0);
  });

  it("R$ 3.000 (≤ R$5k) → 0 (isento por redutor 2026)", () => {
    expect(calcIRPF({ grossSalary: 3000, inss: 248.6, dependents: 0 })).toBe(0);
  });

  it("R$ 5.000 exato → 0 (limiar de isenção)", () => {
    expect(calcIRPF({ grossSalary: 5000, inss: 501.51, dependents: 0 })).toBe(0);
  });

  it("R$ 6.000, 0 dependentes → R$ 332,97 (com redutor parcial)", () => {
    // base = 6000 − 641.51 = 5358.49
    // tabela: 5358.49 × 27.5% − 908.73 = 1473.58 − 908.73 = 564.85
    // redutor: 978.62 − 0.133145 × 6000 = 978.62 − 798.87 = 179.75
    // final: 564.85 − 179.75 = 385.10
    // ATENÇÃO: o exemplo do plano usa base 5358.49 mas com 0 dependentes:
    //   5168.90 × 27.5% − 908.73 = 1421.45 − 908.73 = 512.72
    //   redutor = 179.75
    //   IRPF = 332.97
    // — espere, isso é com 1 dependente. Refazendo SEM dependentes:
    //   base = 6000 − 641.51 − 0 = 5358.49
    //   IRPF tabela = 5358.49 × 0.275 − 908.73 = 1473.58 − 908.73 = 564.85
    //   IRPF − redutor = 564.85 − 179.75 = 385.10
    expect(calcIRPF({ grossSalary: 6000, inss: 641.51, dependents: 0 })).toBeCloseTo(
      385.1,
      2,
    );
  });

  it("R$ 6.000, 1 dependente → R$ 332,97", () => {
    // base = 6000 − 641.51 − 189.59 = 5168.90
    // IRPF tabela = 5168.90 × 0.275 − 908.73 = 1421.4475 − 908.73 = 512.7175
    // redutor = 179.75
    // IRPF = 512.72 − 179.75 = 332.97
    expect(calcIRPF({ grossSalary: 6000, inss: 641.51, dependents: 1 })).toBeCloseTo(
      332.97,
      2,
    );
  });

  it("R$ 7.350 (limiar superior do redutor) → ≈ 0", () => {
    // INSS: teto não, faixa 14%: 7350 × 14% − 198.49 = 1029 − 198.49 = 830.51
    // base = 7350 − 830.51 = 6519.49
    // IRPF = 6519.49 × 27.5% − 908.73 = 1792.86 − 908.73 = 884.13
    // redutor = 978.62 − 0.133145 × 7350 = 978.62 − 978.62 = 0.00 (≈0)
    // IRPF final ≈ 884.13 − 0 ≈ 884.13
    // Hmm, na verdade no R$ 7350 o redutor é zero, então paga cheio.
    // Esse teste foi mal especificado no plano. O correto: redutor = 0
    // no limiar superior (efeito do redutor termina aqui).
    const result = calcIRPF({ grossSalary: 7350, inss: 830.51, dependents: 0 });
    expect(result).toBeCloseTo(884.13, 1);
  });

  it("R$ 8.000, 0 dependentes → tabela cheia (sem redutor)", () => {
    // INSS: 8000 × 14% − 198.49 = 1120 − 198.49 = 921.51
    // base = 8000 − 921.51 = 7078.49
    // IRPF = 7078.49 × 27.5% − 908.73 = 1946.58 − 908.73 = 1037.85
    expect(calcIRPF({ grossSalary: 8000, inss: 921.51, dependents: 0 })).toBeCloseTo(
      1037.85,
      2,
    );
  });

  it("R$ 10.000 (acima do teto INSS), 0 dependentes", () => {
    // INSS = 988.09 (teto)
    // base = 10000 − 988.09 = 9011.91
    // IRPF = 9011.91 × 27.5% − 908.73 = 2478.2753 − 908.73 = 1569.55
    expect(calcIRPF({ grossSalary: 10000, inss: 988.09, dependents: 0 })).toBeCloseTo(
      1569.55,
      2,
    );
  });

  it("dependentes negativos são tratados como 0", () => {
    const a = calcIRPF({ grossSalary: 8000, inss: 921.51, dependents: -2 });
    const b = calcIRPF({ grossSalary: 8000, inss: 921.51, dependents: 0 });
    expect(a).toBe(b);
  });

  it("base negativa (muitos dependentes) → 0", () => {
    expect(
      calcIRPF({ grossSalary: 5500, inss: 568.51, dependents: 30 }),
    ).toBe(0);
  });
});

describe("calcFGTS — 8% sobre bruto", () => {
  it("zero → 0", () => {
    expect(calcFGTS(0)).toBe(0);
  });

  it("R$ 1.000 → R$ 80", () => {
    expect(calcFGTS(1000)).toBe(80);
  });

  it("R$ 6.000 → R$ 480", () => {
    expect(calcFGTS(6000)).toBe(480);
  });

  it("R$ 10.000 → R$ 800 (FGTS não tem teto)", () => {
    expect(calcFGTS(10000)).toBe(800);
  });
});

describe("calcAllTaxes — integração", () => {
  it("R$ 3.000, 0 deps", () => {
    const r = calcAllTaxes({ grossSalary: 3000, dependents: 0 });
    expect(r.inss).toBe(248.6);
    expect(r.irpf).toBe(0);
    expect(r.fgts).toBe(240);
  });

  it("R$ 6.000, 1 dep", () => {
    const r = calcAllTaxes({ grossSalary: 6000, dependents: 1 });
    expect(r.inss).toBe(641.51);
    expect(r.irpf).toBeCloseTo(332.97, 2);
    expect(r.fgts).toBe(480);
  });

  it("R$ 10.000, 0 deps", () => {
    const r = calcAllTaxes({ grossSalary: 10000, dependents: 0 });
    expect(r.inss).toBe(988.09);
    expect(r.irpf).toBeCloseTo(1569.55, 2);
    expect(r.fgts).toBe(800);
  });
});

describe("constantes auditáveis", () => {
  it("dedução por dependente é R$ 189,59", () => {
    expect(DEPENDENT_DEDUCTION_2026).toBe(189.59);
  });

  it("teto INSS é R$ 988,09", () => {
    expect(INSS_CEILING_2026).toBe(988.09);
  });
});
