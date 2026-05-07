// Edge Function: bonus-open-period
//
// Abre uma campanha de 13º Salário pra uma empresa em um ano específico:
//   1. Auth check (admin_gc / gestor_gc / rh)
//   2. Cria registro em bonus_periods (com unique constraint impedindo dup)
//   3. Lista colaboradores ATIVOS da empresa (apenas regime CLT)
//   4. Pra cada um: calcula meses trabalhados (regra ≥15 dias) + valor bruto
//      proporcional, snapshotando o salário base do position no momento.
//   5. Insere bonus_entries em batch.
//
// Body: { company_id: uuid, year: int, notes?: string }
// Response: { period_id, count, ok: true } | { error }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAYS_THRESHOLD_FOR_MONTH = 15;

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

function calcMonthsWorked(admissionDateStr: string | null, year: number): number {
  if (!admissionDateStr) return 0;
  const [y, m, d] = admissionDateStr.split("-").map((p) => parseInt(p, 10));
  const adm = new Date(y, m - 1, d);
  const yearEnd = new Date(year, 11, 31);

  if (adm > yearEnd) return 0;

  let count = 0;
  for (let mo = 0; mo < 12; mo++) {
    const monthStart = new Date(year, mo, 1);
    const monthEnd = new Date(year, mo, daysInMonth(year, mo));
    if (monthEnd < adm) continue;
    const effectiveStart = adm > monthStart ? adm : monthStart;
    const daysWorked =
      Math.floor((monthEnd.getTime() - effectiveStart.getTime()) / 86_400_000) + 1;
    if (daysWorked >= DAYS_THRESHOLD_FOR_MONTH) count++;
  }
  return Math.min(count, 12);
}

function calcGrossValue(baseSalary: number, monthsWorked: number): number {
  if (!baseSalary || baseSalary <= 0 || monthsWorked <= 0) return 0;
  return Math.round((baseSalary * monthsWorked * 100) / 12) / 100;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authErr,
  } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Invalid token" }, 401);

  // Auth: admin_gc / gestor_gc / rh
  const { data: roles } = await sbUser
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleStrings = (roles ?? []).map((r) => String((r as { role: string }).role));
  const isAdmin = roleStrings.some((r) => ["admin_gc", "admin"].includes(r));
  const isManager = roleStrings.some((r) => ["gestor_gc", "rh"].includes(r));
  if (!isAdmin && !isManager) {
    return json({ error: "Sem permissão pra abrir campanha de 13º" }, 403);
  }

  let body: { company_id?: string; year?: number; notes?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const companyId = String(body.company_id ?? "").trim();
  const year = Number(body.year);
  const notes = body.notes?.trim() || null;

  if (!companyId) return json({ error: "company_id obrigatório" }, 400);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return json({ error: "year inválido" }, 400);
  }

  // Gestor só pode abrir pra própria empresa
  if (!isAdmin) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: companyId,
      _user_id: user.id,
    });
    if (!belongs) return json({ error: "Sem permissão para esta empresa" }, 403);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Cria período (unique impede dup company×year)
  const { data: period, error: periodErr } = await sbAdmin
    .from("bonus_periods")
    .insert({
      company_id: companyId,
      year,
      status: "aberto",
      opened_by: user.id,
      notes,
    })
    .select("id")
    .single();

  if (periodErr || !period) {
    if (periodErr?.code === "23505") {
      return json({ error: `Já existe campanha de ${year} para esta empresa.` }, 409);
    }
    return json(
      { error: periodErr?.message ?? "Falha ao criar período" },
      500,
    );
  }

  const periodId = period.id;

  // 2. Lista colaboradores ativos do regime CLT — só esses recebem 13º
  const { data: collabs, error: collabErr } = await sbAdmin
    .from("collaborators")
    .select(`
      id,
      admission_date,
      regime,
      status,
      position_id
    `)
    .eq("company_id", companyId)
    .eq("status", "ativo")
    .eq("regime", "clt");

  if (collabErr) {
    return json({ error: collabErr.message }, 500);
  }

  if (!collabs || collabs.length === 0) {
    return json({ period_id: periodId, count: 0, ok: true });
  }

  // 3. Pega o salário do position de cada um (cache)
  const positionIds = Array.from(
    new Set(
      collabs
        .map((c) => (c as { position_id: string | null }).position_id)
        .filter((p): p is string => !!p),
    ),
  );
  const salaryByPosition = new Map<string, number>();
  if (positionIds.length > 0) {
    const { data: positions } = await sbAdmin
      .from("positions")
      .select("id, salary")
      .in("id", positionIds);
    for (const p of (positions ?? []) as Array<{ id: string; salary: number | null }>) {
      salaryByPosition.set(p.id, Number(p.salary) || 0);
    }
  }

  // 4. Calcula entries
  const entries = collabs.map((c) => {
    const collab = c as {
      id: string;
      admission_date: string | null;
      position_id: string | null;
    };
    const baseSalary = collab.position_id
      ? salaryByPosition.get(collab.position_id) ?? 0
      : 0;
    const monthsWorked = calcMonthsWorked(collab.admission_date, year);
    const grossValue = calcGrossValue(baseSalary, monthsWorked);
    return {
      period_id: periodId,
      collaborator_id: collab.id,
      base_salary: baseSalary,
      months_worked: monthsWorked,
      gross_value: grossValue,
      mode: "batch" as const,
    };
  });

  // 5. Insere em batch (entries.length <= ~300, sem chunking necessário)
  const { error: insertErr } = await sbAdmin.from("bonus_entries").insert(entries);
  if (insertErr) {
    // Best-effort cleanup do period se falhar
    await sbAdmin.from("bonus_periods").delete().eq("id", periodId);
    return json({ error: insertErr.message }, 500);
  }

  return json({
    period_id: periodId,
    count: entries.length,
    ok: true,
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
