// Testes da regra skip-mês-seguinte.
//
// Cenário que o user quer cobrir:
//   1. Recibo lançado em Ago → ao abrir folha Set, colab é pulado (salário,
//      INSS, IRPF, FGTS, gratificação carry-over, etc.).
//   2. ADIANTAMENTO: colab tem férias gozo em Set, mas adiantou o recibo
//      pra Ago via botão "Adiantar Férias". `payroll_month` foi atualizado
//      pra 8, mas `end_date` continua em Set. Ao abrir Set, o colab AINDA
//      deve ser pulado (porque ele recebeu salário+recibo em Ago).
//
// O fix anterior filtrava por `end_date` no mês anterior — quebrava no caso 2.
// Fix novo filtra por `payroll_month/payroll_year`.

import { describe, it, expect } from "vitest";
import {
  getCollabsToSkipNextMonth,
  type ApprovedVacationForSkip,
} from "./vacationSkipRules";

describe("getCollabsToSkipNextMonth — caso normal", () => {
  it("recibo em Ago/26 → pula colab em Set/26", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 8, payroll_year: 2026 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 9, 2026);
    expect(skip.has("rod")).toBe(true);
    expect(skip.size).toBe(1);
  });

  it("dois colabs com recibo em Ago/26 → pula os dois em Set/26", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 8, payroll_year: 2026 },
      { collaborator_id: "ana", payroll_month: 8, payroll_year: 2026 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 9, 2026);
    expect(skip.size).toBe(2);
    expect(skip.has("rod")).toBe(true);
    expect(skip.has("ana")).toBe(true);
  });

  it("recibo em Jul/26 → NÃO pula em Set/26 (gap de mês)", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 7, payroll_year: 2026 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 9, 2026);
    expect(skip.size).toBe(0);
  });

  it("recibo no mesmo mês (Ago/26) → NÃO pula Ago/26", () => {
    // O recibo cai em Ago + salário em Ago juntos. Skip vale só pro MÊS SEGUINTE.
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 8, payroll_year: 2026 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 8, 2026);
    expect(skip.size).toBe(0);
  });

  it("vira do ano: recibo em Dez/25 → pula Jan/26", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 12, payroll_year: 2025 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 1, 2026);
    expect(skip.has("rod")).toBe(true);
  });

  it("vira do ano errado: recibo em Dez/24 → NÃO pula Jan/26", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 12, payroll_year: 2024 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 1, 2026);
    expect(skip.size).toBe(0);
  });
});

describe("getCollabsToSkipNextMonth — ADIANTAMENTO (regression test do bug)", () => {
  it("férias originalmente em Set/26 adiantada pra Ago/26 → pula Set/26", () => {
    // Cenário user: "se o usuario adiantar as ferias de Setembro pra agosto,
    // ele recebe em agosto e em setembro ele nao recebe nada"
    //
    // No banco: end_date='2026-09-30', payroll_month=8, payroll_year=2026.
    // O filtro CORRETO usa payroll_month (não end_date), então o colab é
    // pulado em Set.
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 8, payroll_year: 2026 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 9, 2026);
    expect(skip.has("rod")).toBe(true); // ✓ pula mesmo com end_date em Set
  });

  it("adiantamento múltiplos meses: gozo Out, adianta pra Ago → pula Set?", () => {
    // Edge case: adiantou recibo pra MUITO antes (Ago) mas o gozo é Out.
    // Set não tem recibo dele → não deve pular.
    // (skip cobre só MÊS SEGUINTE ao recibo, não meses subsequentes.)
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 8, payroll_year: 2026 },
    ];
    // Pula Set/26
    expect(getCollabsToSkipNextMonth(reqs, 9, 2026).has("rod")).toBe(true);
    // NÃO pula Out/26 (Out olha pra Set, e o recibo foi em Ago)
    expect(getCollabsToSkipNextMonth(reqs, 10, 2026).has("rod")).toBe(false);
  });
});

describe("getCollabsToSkipNextMonth — edge cases", () => {
  it("lista vazia → set vazio", () => {
    const skip = getCollabsToSkipNextMonth([], 9, 2026);
    expect(skip.size).toBe(0);
  });

  it("requests sem payroll_month (pending) → ignoradas", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: null, payroll_year: null },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 9, 2026);
    expect(skip.size).toBe(0);
  });

  it("payroll_year diferente do prev_year → não pula", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 8, payroll_year: 2025 },
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 9, 2026);
    expect(skip.size).toBe(0);
  });

  it("colab com 2 férias aprovadas (1 antiga + 1 recente) → pula se a recente match", () => {
    const reqs: ApprovedVacationForSkip[] = [
      { collaborator_id: "rod", payroll_month: 3, payroll_year: 2026 }, // antiga
      { collaborator_id: "rod", payroll_month: 8, payroll_year: 2026 }, // recente
    ];
    const skip = getCollabsToSkipNextMonth(reqs, 9, 2026);
    expect(skip.has("rod")).toBe(true);
  });
});
