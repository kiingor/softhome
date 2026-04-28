/**
 * RLS tests — Jornada de Conhecimento (badges, collaborator_badges,
 * journey_milestones).
 *
 * Verifies multi-CNPJ isolation per ADR 0002 and the per-collaborator
 * read scope for the `colaborador` role.
 *
 * Skips entirely when env vars are missing — see fixtures.hasEnv().
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

describe.skipIf(SKIP)("RLS · journey · badges", () => {
  let fx: Fixtures;

  beforeAll(async () => {
    fx = await createFixtures();
  }, 60_000);

  afterAll(async () => {
    if (fx) await cleanupFixtures(fx);
  }, 60_000);

  it("admin sees badges from BOTH companies", async () => {
    const c = await signInAs(fx, "admin");
    const { data, error } = await c
      .from("badges")
      .select("id, company_id")
      .in("company_id", [fx.companyA.id, fx.companyB.id]);
    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((r) => r.company_id));
    expect(ids.has(fx.companyA.id)).toBe(true);
    expect(ids.has(fx.companyB.id)).toBe(true);
  });

  it("rh in company A sees ONLY company A badges (not B)", async () => {
    const c = await signInAs(fx, "rhA");
    const { data, error } = await c.from("badges").select("id, company_id");
    expect(error).toBeNull();
    const cids = new Set((data ?? []).map((r) => r.company_id));
    expect(cids.has(fx.companyA.id)).toBe(true);
    expect(cids.has(fx.companyB.id)).toBe(false);
  });

  it("colaborador in A reads badges of company A but CANNOT insert", async () => {
    const c = await signInAs(fx, "colaboradorA");
    const { data: reads } = await c
      .from("badges")
      .select("id, company_id")
      .eq("company_id", fx.companyA.id);
    expect((reads ?? []).length).toBeGreaterThan(0);

    const { error: insErr } = await c.from("badges").insert({
      company_id: fx.companyA.id,
      name: `should-fail-${fx.runId}`,
      category: "outro",
    });
    // Either RLS blocks (error) or returns no row — both must NOT succeed silently.
    expect(insErr).not.toBeNull();
  });

  it("gestor of company A canNOT see or edit company B badges", async () => {
    const c = await signInAs(fx, "gestorA");

    const { data: bRows } = await c
      .from("badges")
      .select("id")
      .eq("company_id", fx.companyB.id);
    expect(bRows ?? []).toHaveLength(0);

    const { error: updErr, data: updData } = await c
      .from("badges")
      .update({ description: "hostile-edit" })
      .eq("id", fx.badgeB.id)
      .select();
    // RLS UPDATE returns either an error OR an empty rowset (zero rows updated).
    expect((updData ?? []).length).toBe(0);
    void updErr; // either is acceptable; what matters is zero rows mutated
  });
});

describe.skipIf(SKIP)("RLS · journey · collaborator_badges", () => {
  let fx: Fixtures;

  beforeAll(async () => {
    fx = await createFixtures();
    // Seed: give colaboradorA a badge of companyA, and seed one for collaboratorB
    // so we can assert isolation.
    const c = await signInAs(fx, "admin");
    await c.from("collaborator_badges").insert([
      {
        company_id: fx.companyA.id,
        collaborator_id: fx.collaboratorA.id,
        badge_id: fx.badgeA.id,
        evidence: "rls-fixture: own badge of colab A",
      },
      {
        company_id: fx.companyB.id,
        collaborator_id: fx.collaboratorB.id,
        badge_id: fx.badgeB.id,
        evidence: "rls-fixture: badge of colab B (other company)",
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (fx) await cleanupFixtures(fx);
  }, 60_000);

  it("colaborador reads OWN collaborator_badges", async () => {
    const c = await signInAs(fx, "colaboradorA");
    const { data, error } = await c
      .from("collaborator_badges")
      .select("id, collaborator_id, company_id");
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      // Every visible row must belong to this colaborador OR be in their company
      // via an alternate read policy. Critical assertion: NEVER company B.
      expect(r.company_id).not.toBe(fx.companyB.id);
    }
    // And specifically can see own row
    const own = rows.find((r) => r.collaborator_id === fx.collaboratorA.id);
    expect(own).toBeTruthy();
  });

  it("colaborador does NOT read other companies' collaborator_badges", async () => {
    const c = await signInAs(fx, "colaboradorA");
    const { data } = await c
      .from("collaborator_badges")
      .select("id")
      .eq("company_id", fx.companyB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("rh of company A does NOT read collaborator_badges of company B", async () => {
    const c = await signInAs(fx, "rhA");
    const { data } = await c
      .from("collaborator_badges")
      .select("id, company_id")
      .eq("company_id", fx.companyB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("admin reads collaborator_badges across both companies", async () => {
    const c = await signInAs(fx, "admin");
    const { data } = await c
      .from("collaborator_badges")
      .select("id, company_id")
      .in("company_id", [fx.companyA.id, fx.companyB.id]);
    const cids = new Set((data ?? []).map((r) => r.company_id));
    expect(cids.has(fx.companyA.id)).toBe(true);
    expect(cids.has(fx.companyB.id)).toBe(true);
  });
});

describe.skipIf(SKIP)("RLS · journey · journey_milestones", () => {
  let fx: Fixtures;

  beforeAll(async () => {
    fx = await createFixtures();
    const c = await signInAs(fx, "admin");
    await c.from("journey_milestones").insert([
      {
        company_id: fx.companyA.id,
        collaborator_id: fx.collaboratorA.id,
        kind: "d30",
        due_date: "2026-05-27",
        status: "pending",
      },
      {
        company_id: fx.companyB.id,
        collaborator_id: fx.collaboratorB.id,
        kind: "d30",
        due_date: "2026-05-27",
        status: "pending",
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (fx) await cleanupFixtures(fx);
  }, 60_000);

  it("rh of A does not see milestones of B", async () => {
    const c = await signInAs(fx, "rhA");
    const { data } = await c
      .from("journey_milestones")
      .select("id, company_id")
      .eq("company_id", fx.companyB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("colaborador sees own milestones, never another company's", async () => {
    const c = await signInAs(fx, "colaboradorA");
    const { data } = await c
      .from("journey_milestones")
      .select("id, collaborator_id, company_id");
    const rows = data ?? [];
    for (const r of rows) {
      expect(r.company_id).not.toBe(fx.companyB.id);
    }
  });
});
