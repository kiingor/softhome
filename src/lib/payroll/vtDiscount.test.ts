import { describe, it, expect } from "vitest";
import {
  calcVtDiscount,
  vtDiscountExternalId,
  isTransportCategory,
  VT_DISCOUNT_RATE,
} from "./vtDiscount";

describe("calcVtDiscount", () => {
  it("desconta 6% do salário base", () => {
    expect(calcVtDiscount(2000)).toBe(120);
    expect(calcVtDiscount(1500)).toBe(90);
    expect(VT_DISCOUNT_RATE).toBe(0.06);
  });

  it("arredonda a centavos", () => {
    // 1537.77 * 0.06 = 92.2662 → 92.27
    expect(calcVtDiscount(1537.77)).toBe(92.27);
  });

  it("retorna 0 pra salário inválido (mantém CHECK value > 0)", () => {
    expect(calcVtDiscount(0)).toBe(0);
    expect(calcVtDiscount(-100)).toBe(0);
    expect(calcVtDiscount(Number.NaN)).toBe(0);
  });
});

describe("vtDiscountExternalId", () => {
  it("gera id determinístico por colaborador+competência com mês zero-padded", () => {
    expect(vtDiscountExternalId("abc", 2026, 6)).toBe("vt-abc-2026-06");
    expect(vtDiscountExternalId("abc", 2026, 12)).toBe("vt-abc-2026-12");
  });
});

describe("isTransportCategory", () => {
  it("só é true pra 'transport'", () => {
    expect(isTransportCategory("transport")).toBe(true);
    expect(isTransportCategory("meal")).toBe(false);
    expect(isTransportCategory(null)).toBe(false);
    expect(isTransportCategory(undefined)).toBe(false);
  });
});
