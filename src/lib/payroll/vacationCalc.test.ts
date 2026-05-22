// Bateria de testes pra calcVacation cobrindo os 2 colaboradores da agenda
// que o user quer testar:
//   • Colab 384 (Rodrigo): salário R$ 8.574,65 — acima do teto INSS, IRPF cheio
//   • Colab 816 (referência): salário R$ 5.000,00 — faixa 14% INSS, IRPF normalmente
//     isento pelo redutor MAS em férias paga (applyRedutor=false)
//
// Cenários cobertos por cada colab:
//   • Férias 30 dias sem extras (caso básico)
//   • Férias 30 dias com gratificação habitual (entra na base)
//   • Férias 30 dias com bonificação (entra no bruto, sem 1/3, sem tributar)
//   • Férias 30 dias com grat + boni juntas
//   • Férias 20 dias + 10 dias vendidos (abono isento)
//   • Férias 30 dias com 1 dependente
//
// Bugs históricos cobertos:
//   • IRPF de férias usa applyRedutor=false (renda exclusiva, sem isenção R$ 5k)
//   • Boni NÃO compõe base de cálculo (só vai pro bruto)
//   • Abono pecuniário é isento INSS/IRRF

import { describe, it, expect } from "vitest";
import {
  calcVacation,
  calcVacationPayrollMonth,
  vacationDaysInMonth,
} from "./vacationCalc";

describe("calcVacation — Colab 384 (Rodrigo, salário R$ 8.574,65)", () => {
  const SALARY = 8574.65;

  it("30 dias, sem extras, sem dependentes", () => {
    const r = calcVacation({ salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 0 });
    expect(r.remuneracao_base).toBe(8574.65);
    expect(r.valor_ferias).toBe(8574.65);
    expect(r.um_terco_ferias).toBe(2858.22);
    expect(r.valor_abono).toBe(0);
    expect(r.um_terco_abono).toBe(0);
    expect(r.valor_bonificacao).toBe(0);
    expect(r.base_inss).toBe(11432.87); // 8574.65 + 2858.22
    expect(r.inss).toBe(988.09);         // teto
    expect(r.base_irrf).toBe(10444.78);  // 11432.87 - 988.09
    // IRPF: 10444.78 × 0.275 − 908.73 = 1963.58
    expect(r.irrf).toBe(1963.58);
    expect(r.bruto).toBe(11432.87);
    expect(r.liquido).toBe(8481.20);     // 11432.87 - 988.09 - 1963.58
  });

  it("30 dias com gratificação R$ 500 (linha separada, entra na base)", () => {
    const r = calcVacation({
      salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 0,
      gratifications: 500,
    });
    expect(r.remuneracao_base).toBe(9074.65); // info: 8574.65 + 500
    expect(r.valor_ferias).toBe(8574.65);     // SÓ salário (sem grat embutida)
    expect(r.gratificacao_valor).toBe(500);   // grat proporcional (30/30 = full)
    expect(r.um_terco_ferias).toBe(3024.88);  // 1/3 de (8574.65 + 500)
    expect(r.base_inss).toBe(12099.53);       // mesma base de antes
    expect(r.inss).toBe(988.09);              // ainda teto
    expect(r.base_irrf).toBe(11111.44);
    expect(r.irrf).toBe(2146.92);             // IRPF maior por causa da grat
    expect(r.gratifications).toBe(500);
    expect(r.valor_bonificacao).toBe(0);
    expect(r.bruto).toBe(12099.53);           // soma de TODAS as linhas (sem dupla contagem)
    expect(r.liquido).toBe(8964.52);          // 12099.53 - 988.09 - 2146.92
  });

  it("30 dias com bonificação R$ 300 (livre, sem tributar)", () => {
    const r = calcVacation({
      salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 0,
      bonifications: 300,
    });
    // Boni NÃO afeta remuneracao_base nem cálculo de impostos
    expect(r.remuneracao_base).toBe(8574.65);
    expect(r.valor_ferias).toBe(8574.65);
    expect(r.um_terco_ferias).toBe(2858.22);
    expect(r.base_inss).toBe(11432.87);
    expect(r.inss).toBe(988.09);
    expect(r.irrf).toBe(1963.58);   // mesmo do caso básico
    expect(r.valor_bonificacao).toBe(300);
    expect(r.bruto).toBe(11732.87); // 11432.87 + 300 (só no bruto)
    expect(r.liquido).toBe(8781.20); // 11732.87 - 988.09 - 1963.58
  });

  it("30 dias com grat + boni juntas", () => {
    const r = calcVacation({
      salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 0,
      gratifications: 500, bonifications: 300,
    });
    // Grat entra na base + linha gratificacao_valor; boni só vai pro bruto
    expect(r.remuneracao_base).toBe(9074.65);
    expect(r.valor_ferias).toBe(8574.65);
    expect(r.gratificacao_valor).toBe(500);
    expect(r.um_terco_ferias).toBe(3024.88);
    expect(r.valor_bonificacao).toBe(300);
    expect(r.bruto).toBe(12399.53);           // 8574.65 + 500 + 3024.88 + 300
    expect(r.inss).toBe(988.09);
    expect(r.irrf).toBe(2146.92);
    expect(r.liquido).toBe(9264.52);
  });

  it("20 dias gozo + 10 vendidos (abono isento)", () => {
    const r = calcVacation({ salary: SALARY, daysTaken: 20, daysSold: 10, dependents: 0 });
    // gozados: 20/30 da remuneracao
    // 8574.65/30 = 285.8216667
    // ×20 = 5716.43 (round 5716.4333... → 5716.43)
    expect(r.valor_ferias).toBe(5716.43);
    expect(r.um_terco_ferias).toBe(1905.48); // round2(5716.43/3) = round2(1905.4766) = 1905.48
    // vendidos: 10/30 — abono ISENTO
    expect(r.valor_abono).toBe(2858.22);     // round2(285.8216×10)=2858.22
    expect(r.um_terco_abono).toBe(952.74);   // round2(2858.22/3)
    // Base INSS = só gozados
    expect(r.base_inss).toBe(7621.91);       // 5716.43 + 1905.48
    // INSS faixa 14%: 7621.91 × 0.14 − 198.49 = 1067.0674 − 198.49 = 868.58
    expect(r.inss).toBe(868.58);
    expect(r.bruto).toBe(11432.87);          // gozados + 1/3 + abono + 1/3 abono
  });

  it("30 dias com 1 dependente (reduz IRPF)", () => {
    const r = calcVacation({ salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 1 });
    // base_irrf = 10444.78, base = 10444.78 - 189.59 = 10255.19
    // IRPF = 10255.19 × 0.275 - 908.73 = 2820.18 - 908.73 = 1911.45
    expect(r.irrf).toBe(1911.45);
    expect(r.liquido).toBe(8533.33); // 11432.87 - 988.09 - 1911.45
  });
});

describe("calcVacation — Colab 816 (referência R$ 5.000)", () => {
  const SALARY = 5000;

  it("30 dias, sem extras — férias TRIBUTA mesmo abaixo de R$ 5k", () => {
    // Regra: applyRedutor=false em férias (renda exclusiva)
    const r = calcVacation({ salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 0 });
    expect(r.remuneracao_base).toBe(5000);
    expect(r.valor_ferias).toBe(5000);
    expect(r.um_terco_ferias).toBe(1666.67);
    expect(r.base_inss).toBe(6666.67);
    // INSS faixa 14%: 6666.67 × 0.14 − 198.49 = 933.3338 − 198.49 = 734.84
    expect(r.inss).toBe(734.84);
    // IRPF base = 6666.67 - 734.84 = 5931.83
    // faixa 27.5%: 5931.83 × 0.275 - 908.73 = 1631.2533 - 908.73 = 722.52
    expect(r.irrf).toBe(722.52);
    expect(r.bruto).toBe(6666.67);
    expect(r.liquido).toBe(5209.31); // 6666.67 - 734.84 - 722.52
  });

  it("30 dias com gratificação R$ 800 (linha separada, aumenta base e impostos)", () => {
    const r = calcVacation({
      salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 0,
      gratifications: 800,
    });
    expect(r.remuneracao_base).toBe(5800);
    expect(r.valor_ferias).toBe(5000);        // SÓ salário
    expect(r.gratificacao_valor).toBe(800);   // grat proporcional 30/30
    expect(r.um_terco_ferias).toBe(1933.33);  // (5000 + 800) / 3
    expect(r.base_inss).toBe(7733.33);        // 5000 + 800 + 1933.33
    // INSS: 7733.33 × 0.14 − 198.49 = 1082.6662 − 198.49 = 884.18
    expect(r.inss).toBe(884.18);
    expect(r.gratifications).toBe(800);
    expect(r.valor_bonificacao).toBe(0);
    expect(r.bruto).toBe(7733.33);            // 5000 + 800 + 1933.33
  });

  it("30 dias com bonificação R$ 500 (isenta)", () => {
    const r = calcVacation({
      salary: SALARY, daysTaken: 30, daysSold: 0, dependents: 0,
      bonifications: 500,
    });
    // INSS/IRRF iguais ao caso básico
    expect(r.inss).toBe(734.84);
    expect(r.irrf).toBe(722.52);
    expect(r.valor_bonificacao).toBe(500);
    expect(r.bruto).toBe(7166.67);          // 6666.67 + 500
    expect(r.liquido).toBe(5709.31);        // 7166.67 - 734.84 - 722.52
  });

  it("15 dias gozo + 10 vendidos (parcial)", () => {
    const r = calcVacation({ salary: SALARY, daysTaken: 15, daysSold: 10, dependents: 0 });
    // valor_ferias = round2(5000/30 × 15) = round2(2500) = 2500
    expect(r.valor_ferias).toBe(2500);
    expect(r.um_terco_ferias).toBe(833.33);
    expect(r.valor_abono).toBe(1666.67);    // round2(5000/30 × 10) = round2(1666.6666) = 1666.67
    expect(r.um_terco_abono).toBe(555.56);  // round2(1666.67/3)
    // Base INSS só sobre gozados
    expect(r.base_inss).toBe(3333.33);      // 2500 + 833.33
    // INSS faixa 12%: 3333.33 × 0.12 − 111.40 = 399.9996 − 111.40 = 288.60
    expect(r.inss).toBe(288.60);
    // bruto = 2500 + 833.33 + 1666.67 + 555.56 = 5555.56
    expect(r.bruto).toBe(5555.56);
  });
});

describe("calcVacation — invariantes (qualquer salário)", () => {
  it("bonificação NUNCA entra na base de INSS", () => {
    const semBoni = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0 });
    const comBoni = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0, bonifications: 1000 });
    expect(comBoni.inss).toBe(semBoni.inss);
    expect(comBoni.irrf).toBe(semBoni.irrf);
    expect(comBoni.base_inss).toBe(semBoni.base_inss);
  });

  it("gratificação SIM entra na base de INSS", () => {
    const semGrat = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0 });
    const comGrat = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0, gratifications: 1000 });
    expect(comGrat.base_inss).toBeGreaterThan(semGrat.base_inss);
    expect(comGrat.inss).toBeGreaterThanOrEqual(semGrat.inss); // pode capar no teto
  });

  it("abono pecuniário (dias vendidos) NUNCA entra na base de INSS", () => {
    const so30Gozo = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 0 });
    const com10Vendidos = calcVacation({ salary: 5000, daysTaken: 30, daysSold: 10 });
    // INSS deve ser idêntico (abono não entra)
    expect(com10Vendidos.inss).toBe(so30Gozo.inss);
    // Mas o bruto cresce
    expect(com10Vendidos.bruto).toBeGreaterThan(so30Gozo.bruto);
  });

  it("bruto = férias + grat s/férias + 1/3 + abono + 1/3 abono + boni (sempre)", () => {
    const r = calcVacation({
      salary: 7000, daysTaken: 20, daysSold: 10, dependents: 0,
      gratifications: 400, bonifications: 200,
    });
    const sum =
      r.valor_ferias +
      r.gratificacao_valor +
      r.um_terco_ferias +
      r.valor_abono +
      r.um_terco_abono +
      r.valor_bonificacao;
    expect(Math.abs(r.bruto - Math.round(sum * 100) / 100)).toBeLessThanOrEqual(0.01);
  });

  it("liquido = bruto - inss - irrf (sempre)", () => {
    const r = calcVacation({
      salary: 8574.65, daysTaken: 30, daysSold: 0, dependents: 0,
      gratifications: 500, bonifications: 300,
    });
    const calc = Math.round((r.bruto - r.inss - r.irrf) * 100) / 100;
    expect(r.liquido).toBe(calc);
  });

  it("dias zerados → tudo zero", () => {
    const r = calcVacation({ salary: 5000, daysTaken: 0, daysSold: 0 });
    expect(r.valor_ferias).toBe(0);
    expect(r.um_terco_ferias).toBe(0);
    expect(r.bruto).toBe(0);
    expect(r.inss).toBe(0);
    expect(r.irrf).toBe(0);
    expect(r.liquido).toBe(0);
  });

  it("entrada inválida (negativa) é tratada como 0", () => {
    const r = calcVacation({
      salary: -1000, daysTaken: -5, daysSold: -3,
      dependents: -2, gratifications: -100, bonifications: -50,
    });
    expect(r.salary).toBe(0);
    expect(r.daysTaken).toBe(0);
    expect(r.bruto).toBe(0);
  });
});

describe("calcVacationPayrollMonth — recibo no mês do GOZO", () => {
  it("início 15/08/2026 → folha 08/2026", () => {
    const r = calcVacationPayrollMonth("2026-08-15");
    expect(r.month).toBe(8);
    expect(r.year).toBe(2026);
  });

  it("início 01/01/2026 → folha 01/2026", () => {
    const r = calcVacationPayrollMonth("2026-01-01");
    expect(r.month).toBe(1);
    expect(r.year).toBe(2026);
  });

  it("início 31/12/2026 → folha 12/2026", () => {
    const r = calcVacationPayrollMonth("2026-12-31");
    expect(r.month).toBe(12);
    expect(r.year).toBe(2026);
  });

  it("override manual prevalece", () => {
    const r = calcVacationPayrollMonth("2026-08-15", { month: 7, year: 2026 });
    expect(r.month).toBe(7);
    expect(r.year).toBe(2026);
  });

  it("não tem off-by-one por timezone (string ISO YYYY-MM-DD)", () => {
    // Bug clássico: new Date("2026-08-15") interpreta UTC; em fuso < 0 vira 14/08.
    // O helper extrai YYYY-MM-DD por regex pra evitar isso.
    const r = calcVacationPayrollMonth("2026-08-01");
    expect(r.month).toBe(8); // não pode virar Julho
  });
});

describe("vacationDaysInMonth — overlap entre férias e mês de folha", () => {
  it("férias 10/07 a 09/08, mês = Jul → 22 dias (10-31)", () => {
    expect(vacationDaysInMonth("2026-07-10", "2026-08-09", 7, 2026)).toBe(22);
  });

  it("férias 10/07 a 09/08, mês = Ago → 9 dias (01-09)", () => {
    expect(vacationDaysInMonth("2026-07-10", "2026-08-09", 8, 2026)).toBe(9);
  });

  it("férias 01/08 a 30/08 (mês inteiro) → 30 dias", () => {
    expect(vacationDaysInMonth("2026-08-01", "2026-08-30", 8, 2026)).toBe(30);
  });

  it("férias fora do mês → 0", () => {
    expect(vacationDaysInMonth("2026-07-01", "2026-07-30", 8, 2026)).toBe(0);
  });
});
