/**
 * RLS test fixtures.
 *
 * Creates a self-contained set of companies + users + collaborators in the
 * linked Supabase project so we can exercise RLS policies as authenticated
 * users (anon key + JWT).
 *
 * IMPORTANT
 * - Service-role key bypasses RLS. Use it ONLY here for setup/teardown.
 * - Each run gets a unique `runId` so parallel runs don't collide.
 * - cleanup is best-effort but idempotent. If it fails halfway, retry —
 *   safe operations only (DELETE WHERE id IN (...)).
 *
 * See __tests__/rls/README.md for the conceptual model.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// Env
// -----------------------------------------------------------------------------

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** True when all env vars needed for RLS tests are present. */
export function hasEnv(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
}

/** Service-role client — bypasses RLS. Used only for fixtures setup/cleanup. */
function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "RLS fixtures require VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Role = "admin" | "rhA" | "gestorA" | "colaboradorA";

export interface FixtureUser {
  email: string;
  password: string;
  userId: string;
  role: Role;
}

export interface FixtureCompany {
  id: string;
  company_name: string;
}

export interface FixtureCollaborator {
  id: string;
  company_id: string;
  user_id: string | null;
}

export interface FixtureBadge {
  id: string;
  company_id: string;
}

export interface Fixtures {
  runId: string;
  companyA: FixtureCompany;
  companyB: FixtureCompany;
  users: Record<Role, FixtureUser>;
  collaboratorA: FixtureCollaborator; // linked to colaboradorA user
  collaboratorB: FixtureCollaborator; // company B, no user
  badgeA: FixtureBadge;
  badgeB: FixtureBadge;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function randomPassword(): string {
  return "Rls!" + Math.random().toString(36).slice(2, 14) + "Aa1";
}

function randomCnpj(seed: string): string {
  // Not validating CNPJ algorithm — DB allows any text. Just unique-ish.
  return `00.000.${seed.slice(0, 3)}/0001-${seed.slice(3, 5).padStart(2, "0")}`;
}

async function createAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createAuthUser(${email}) failed: ${error?.message}`);
  }
  return data.user.id;
}

// -----------------------------------------------------------------------------
// createFixtures
// -----------------------------------------------------------------------------

export async function createFixtures(): Promise<Fixtures> {
  const admin = adminClient();
  const runId = randomSuffix();

  // 1. Companies
  const { data: companies, error: cErr } = await admin
    .from("companies")
    .insert([
      {
        company_name: `RLS Matriz ${runId}`,
        plan_type: "starter",
        owner_id: "00000000-0000-0000-0000-000000000000", // placeholder; updated below
      },
      {
        company_name: `RLS Filial ${runId}`,
        plan_type: "starter",
        owner_id: "00000000-0000-0000-0000-000000000000",
      },
    ])
    .select("id, company_name");
  if (cErr || !companies || companies.length !== 2) {
    throw new Error(`insert companies failed: ${cErr?.message}`);
  }
  const [companyA, companyB] = companies;

  // 2. Auth users (one per role)
  const tag = (r: Role) => `rls-test-${r}-${runId}@softhome.test`;
  const mkUser = async (role: Role): Promise<FixtureUser> => {
    const email = tag(role);
    const password = randomPassword();
    const userId = await createAuthUser(admin, email, password);
    return { email, password, userId, role };
  };

  const users: Record<Role, FixtureUser> = {
    admin: await mkUser("admin"),
    rhA: await mkUser("rhA"),
    gestorA: await mkUser("gestorA"),
    colaboradorA: await mkUser("colaboradorA"),
  };

  // Update owner_id of companies to admin (avoids dangling FK and lets
  // legacy "owner" policies behave sanely).
  await admin
    .from("companies")
    .update({ owner_id: users.admin.userId })
    .in(
      "id",
      [companyA.id, companyB.id],
    );

  // 3. Profiles (link each user to a company; admin -> companyA arbitrarily)
  // Note: profile.company_id is the legacy "user belongs to this CNPJ" link
  // used by user_belongs_to_company(). admin's company_id doesn't matter
  // because the policies check role first.
  const profilesPayload = [
    { user_id: users.admin.userId, full_name: "RLS Admin", company_id: companyA.id },
    { user_id: users.rhA.userId, full_name: "RLS RH A", company_id: companyA.id },
    { user_id: users.gestorA.userId, full_name: "RLS Gestor A", company_id: companyA.id },
    { user_id: users.colaboradorA.userId, full_name: "RLS Colab A", company_id: companyA.id },
  ];
  const { error: pErr } = await admin.from("profiles").insert(profilesPayload);
  if (pErr) throw new Error(`insert profiles failed: ${pErr.message}`);

  // 4. user_roles
  // NB: app_role enum is ('admin','rh','gestor','contador','colaborador').
  // The future ADR roles (admin_gc, gestor_gc) are not in the enum yet.
  const rolesPayload = [
    { user_id: users.admin.userId, role: "admin" },
    { user_id: users.rhA.userId, role: "rh" },
    { user_id: users.gestorA.userId, role: "gestor" },
    { user_id: users.colaboradorA.userId, role: "colaborador" },
  ];
  const { error: rErr } = await admin.from("user_roles").insert(rolesPayload);
  if (rErr) throw new Error(`insert user_roles failed: ${rErr.message}`);

  // 5. Collaborators (one in A linked to colaboradorA, one in B with no user)
  const { data: collabs, error: kErr } = await admin
    .from("collaborators")
    .insert([
      {
        name: "Colab A",
        cpf: `999${runId}1`.slice(0, 11).padEnd(11, "0"),
        email: `colab-a-${runId}@softhome.test`,
        company_id: companyA.id,
        user_id: users.colaboradorA.userId,
        status: "ativo",
      },
      {
        name: "Colab B",
        cpf: `888${runId}2`.slice(0, 11).padEnd(11, "0"),
        email: `colab-b-${runId}@softhome.test`,
        company_id: companyB.id,
        user_id: null,
        status: "ativo",
      },
    ])
    .select("id, company_id, user_id");
  if (kErr || !collabs || collabs.length !== 2) {
    throw new Error(`insert collaborators failed: ${kErr?.message}`);
  }
  const [collaboratorA, collaboratorB] = collabs;

  // 6. Badges (one per company)
  const { data: badges, error: bErr } = await admin
    .from("badges")
    .insert([
      {
        company_id: companyA.id,
        name: `Badge A ${runId}`,
        description: "rls fixture badge — company A",
        category: "integracao",
      },
      {
        company_id: companyB.id,
        name: `Badge B ${runId}`,
        description: "rls fixture badge — company B",
        category: "integracao",
      },
    ])
    .select("id, company_id");
  if (bErr || !badges || badges.length !== 2) {
    throw new Error(`insert badges failed: ${bErr?.message}`);
  }
  const [badgeA, badgeB] = badges;

  // Silence unused randomCnpj for now; keep helper for future tests.
  void randomCnpj;

  return {
    runId,
    companyA,
    companyB,
    users,
    collaboratorA,
    collaboratorB,
    badgeA,
    badgeB,
  };
}

// -----------------------------------------------------------------------------
// signInAs
// -----------------------------------------------------------------------------

/**
 * Returns a Supabase client authenticated as the given fixture user.
 * Uses the **anon** key, so RLS applies normally.
 */
export async function signInAs(
  fx: Fixtures,
  role: Role,
): Promise<SupabaseClient> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error("signInAs requires VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY");
  }
  const u = fx.users[role];
  if (!u) throw new Error(`unknown role: ${role}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: u.email,
    password: u.password,
  });
  if (error) throw new Error(`signInAs(${role}) failed: ${error.message}`);
  return client;
}

// -----------------------------------------------------------------------------
// cleanupFixtures
// -----------------------------------------------------------------------------

export async function cleanupFixtures(fx: Fixtures): Promise<void> {
  const admin = adminClient();
  const userIds = Object.values(fx.users).map((u) => u.userId);
  const companyIds = [fx.companyA.id, fx.companyB.id];

  // Delete in FK-safe order. Errors are logged but don't abort cleanup.
  const safe = async (label: string, p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[rls cleanup] ${label}: ${(e as Error).message}`);
    }
  };

  await safe(
    "collaborator_badges",
    admin.from("collaborator_badges").delete().in("company_id", companyIds),
  );
  await safe(
    "journey_milestones",
    admin.from("journey_milestones").delete().in("company_id", companyIds),
  );
  await safe(
    "badges",
    admin.from("badges").delete().in("company_id", companyIds),
  );
  await safe(
    "collaborators",
    admin.from("collaborators").delete().in("company_id", companyIds),
  );
  await safe(
    "user_roles",
    admin.from("user_roles").delete().in("user_id", userIds),
  );
  await safe(
    "profiles",
    admin.from("profiles").delete().in("user_id", userIds),
  );

  // auth.users — must use admin API, can't DELETE FROM auth.users
  for (const id of userIds) {
    await safe(`auth.user(${id})`, admin.auth.admin.deleteUser(id));
  }

  await safe(
    "companies",
    admin.from("companies").delete().in("id", companyIds),
  );
}
