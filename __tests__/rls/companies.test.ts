/**
 * RLS tests — companies table.
 *
 * The `companies` table itself uses legacy `meurh` policies (owner-based).
 * The "internal Softcom" model expects role-based access:
 *   - admin: sees everything
 *   - rh / gestor / colaborador: sees only their own company (via profiles)
 *
 * If these tests fail, it's a strong signal that companies' policies need
 * to be revised before Phase 1 (Jornada) goes live — see ADR 0002.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupFixtures,
  createFixtures,
  hasEnv,
  signInAs,
  type Fixtures,
} from "./fixtures";

const SKIP = !hasEnv();

describe.skipIf(SKIP)("RLS · companies", () => {
  let fx: Fixtures;

  beforeAll(async () => {
    fx = await createFixtures();
  }, 60_000);

  afterAll(async () => {
    if (fx) await cleanupFixtures(fx);
  }, 60_000);

  it("admin sees BOTH companies", async () => {
    const c = await signInAs(fx, "admin");
    const { data } = await c
      .from("companies")
      .select("id, company_name")
      .in("id", [fx.companyA.id, fx.companyB.id]);
    expect((data ?? []).map((r) => r.id).sort()).toEqual(
      [fx.companyA.id, fx.companyB.id].sort(),
    );
  });

  it("rh in company A sees ONLY company A", async () => {
    const c = await signInAs(fx, "rhA");
    const { data } = await c
      .from("companies")
      .select("id")
      .in("id", [fx.companyA.id, fx.companyB.id]);
    const ids = new Set((data ?? []).map((r) => r.id));
    expect(ids.has(fx.companyA.id)).toBe(true);
    expect(ids.has(fx.companyB.id)).toBe(false);
  });

  it("colaborador in company A sees ONLY company A", async () => {
    const c = await signInAs(fx, "colaboradorA");
    const { data } = await c
      .from("companies")
      .select("id")
      .in("id", [fx.companyA.id, fx.companyB.id]);
    const ids = new Set((data ?? []).map((r) => r.id));
    expect(ids.has(fx.companyA.id)).toBe(true);
    expect(ids.has(fx.companyB.id)).toBe(false);
  });
});
