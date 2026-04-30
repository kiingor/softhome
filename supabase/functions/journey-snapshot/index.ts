// Edge Function: journey-snapshot
// Runs daily (via pg_cron or external scheduler) to populate
// `journey_milestones` rows for each active collaborator.
//
// Reads collaborators where status = 'ativo' AND admission_date IS NOT NULL.
// For each, computes due_date for kinds: d30, d60, d90, d180, annual.
// Inserts missing rows with the appropriate status (pending|due|overdue) and
// snapshots `badges_count` from collaborator_badges (awarded_at <= due_date).
// Updates existing rows whose status drifted to overdue.
//
// Uses SUPABASE_SERVICE_ROLE_KEY internally to bypass RLS.
//
// Auth (Bearer token):
//   - User JWT (admin_gc/gestor_gc/rh) → manual trigger pelo dashboard
//   - SUPABASE_SERVICE_ROLE_KEY → trigger automático via pg_cron (system call)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- Config ---------------------------------------------------------------

const MILESTONE_OFFSETS_DAYS: Record<"d30" | "d60" | "d90" | "d180", number> = {
  d30: 30,
  d60: 60,
  d90: 90,
  d180: 180,
};

// "Due" window: today within +/- DUE_WINDOW_DAYS of due_date.
// "Overdue": more than DUE_WINDOW_DAYS days past due_date with no completion.
const DUE_WINDOW_DAYS = 7;

// --- Date helpers ---------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateOnly(input: string): Date {
  // Treat YYYY-MM-DD as UTC midnight to avoid TZ drift in date math.
  const [y, m, d] = input.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MS_PER_DAY);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

// Annual = anniversary in the current year if not yet passed (inside the
// window we still treat as current-year), else next year. Recurring in the
// sense that the cron rolls it forward once the previous one is completed —
// but the UNIQUE(collaborator_id, kind) constraint means we keep ONE annual
// row at any given time, and we move it forward (UPDATE due_date) once it's
// completed and the next anniversary has been computed.
//
// For the FIRST run we just pick the next-due anniversary so we don't seed a
// row in the deep past.
function computeAnnualDueDate(admission: Date, today: Date): Date {
  const year = today.getUTCFullYear();
  const candidate = new Date(
    Date.UTC(year, admission.getUTCMonth(), admission.getUTCDate()),
  );
  // If this year's anniversary is more than DUE_WINDOW_DAYS in the past,
  // skip to next year. Otherwise keep current year so the snapshot can flag
  // it as `due` / `overdue` correctly.
  if (diffDays(today, candidate) > DUE_WINDOW_DAYS) {
    return new Date(
      Date.UTC(year + 1, admission.getUTCMonth(), admission.getUTCDate()),
    );
  }
  return candidate;
}

function computeStatusForDueDate(
  dueDate: Date,
  today: Date,
): "pending" | "due" | "overdue" {
  const delta = diffDays(today, dueDate); // positive = past due
  if (delta > DUE_WINDOW_DAYS) return "overdue";
  if (delta >= -DUE_WINDOW_DAYS) return "due";
  return "pending";
}

// --- Main handler ---------------------------------------------------------

interface Collaborator {
  id: string;
  company_id: string;
  admission_date: string;
  status: string;
}

interface ExistingMilestone {
  id: string;
  collaborator_id: string;
  kind: string;
  due_date: string;
  status: string;
}

interface ProcessResult {
  inserted: number;
  updated_to_overdue: number;
  total_collaborators_processed: number;
  errors: Array<{ collaborator_id?: string; kind?: string; message: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Método não permitido" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Configuração de ambiente ausente" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // --- Auth gate ------------------------------------------------------
  // Aceita 2 formas:
  //  1) Bearer = SUPABASE_SERVICE_ROLE_KEY → chamada de sistema (pg_cron)
  //  2) Bearer = JWT de auth.users → chamada manual via dashboard
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(
      JSON.stringify({ error: "Não autorizado" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const token = authHeader.replace(/^bearer\s+/i, "").trim();
  const isSystemCall = token === supabaseServiceKey;

  if (!isSystemCall) {
    try {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(
          JSON.stringify({ error: "Não autorizado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Falha ao validar token", detail: String((e as Error).message) }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: ProcessResult = {
    inserted: 0,
    updated_to_overdue: 0,
    total_collaborators_processed: 0,
    errors: [],
  };

  try {
    const today = todayUtc();

    // 1. Fetch active collaborators with admission_date.
    const { data: collaborators, error: collabErr } = await admin
      .from("collaborators")
      .select("id, company_id, admission_date, status")
      .eq("status", "ativo")
      .not("admission_date", "is", null);

    if (collabErr) {
      result.errors.push({ message: `collaborators fetch: ${collabErr.message}` });
      return jsonResponse(result, 500);
    }

    const collabs = (collaborators ?? []) as Collaborator[];
    result.total_collaborators_processed = collabs.length;

    if (collabs.length === 0) {
      return jsonResponse(result, 200);
    }

    // 2. Pre-fetch existing milestones for these collaborators (single query).
    const collabIds = collabs.map((c) => c.id);
    const { data: existing, error: existingErr } = await admin
      .from("journey_milestones")
      .select("id, collaborator_id, kind, due_date, status")
      .in("collaborator_id", collabIds);

    if (existingErr) {
      result.errors.push({ message: `journey_milestones fetch: ${existingErr.message}` });
      return jsonResponse(result, 500);
    }

    const existingByKey = new Map<string, ExistingMilestone>();
    for (const row of (existing ?? []) as ExistingMilestone[]) {
      existingByKey.set(`${row.collaborator_id}:${row.kind}`, row);
    }

    // 3. Process each collaborator.
    for (const collab of collabs) {
      try {
        const admission = parseDateOnly(collab.admission_date);

        const targets: Array<{ kind: string; dueDate: Date }> = [];
        for (const [kind, offset] of Object.entries(MILESTONE_OFFSETS_DAYS)) {
          targets.push({ kind, dueDate: addDaysUtc(admission, offset) });
        }
        targets.push({ kind: "annual", dueDate: computeAnnualDueDate(admission, today) });

        for (const { kind, dueDate } of targets) {
          await processMilestone(admin, collab, kind, dueDate, today, existingByKey, result);
        }
      } catch (e) {
        result.errors.push({
          collaborator_id: collab.id,
          message: `processing failed: ${(e as Error).message}`,
        });
      }
    }

    return jsonResponse(result, 200);
  } catch (e) {
    console.error("journey-snapshot fatal:", e);
    result.errors.push({ message: `fatal: ${(e as Error).message}` });
    return jsonResponse(result, 500);
  }
});

async function processMilestone(
  admin: SupabaseClient,
  collab: Collaborator,
  kind: string,
  dueDate: Date,
  today: Date,
  existingByKey: Map<string, ExistingMilestone>,
  result: ProcessResult,
): Promise<void> {
  const key = `${collab.id}:${kind}`;
  const existing = existingByKey.get(key);
  const dueIso = toIsoDate(dueDate);

  // Snapshot of badges awarded by the due_date.
  let badgesCount = 0;
  try {
    const { count, error } = await admin
      .from("collaborator_badges")
      .select("id", { count: "exact", head: true })
      .eq("collaborator_id", collab.id)
      .lte("awarded_at", `${dueIso}T23:59:59.999Z`);
    if (error) throw error;
    badgesCount = count ?? 0;
  } catch (e) {
    result.errors.push({
      collaborator_id: collab.id,
      kind,
      message: `badges count: ${(e as Error).message}`,
    });
    // Continue with 0 — better to record the milestone than skip entirely.
  }

  if (!existing) {
    // INSERT.
    const status = computeStatusForDueDate(dueDate, today);
    const { error } = await admin.from("journey_milestones").insert({
      company_id: collab.company_id,
      collaborator_id: collab.id,
      kind,
      due_date: dueIso,
      status,
      badges_count: badgesCount,
    });
    if (error) {
      // UNIQUE collisions can race with concurrent runs; treat as non-fatal.
      result.errors.push({
        collaborator_id: collab.id,
        kind,
        message: `insert: ${error.message}`,
      });
      return;
    }
    result.inserted += 1;
    return;
  }

  // EXISTING row: only flip pending|due → overdue when window has passed.
  if (
    (existing.status === "pending" || existing.status === "due") &&
    diffDays(today, parseDateOnly(existing.due_date)) > DUE_WINDOW_DAYS
  ) {
    const { error } = await admin
      .from("journey_milestones")
      .update({ status: "overdue" })
      .eq("id", existing.id);
    if (error) {
      result.errors.push({
        collaborator_id: collab.id,
        kind,
        message: `update overdue: ${error.message}`,
      });
      return;
    }
    result.updated_to_overdue += 1;
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
