// Edge Function: holidays-sync
//
// Sincroniza feriados nacionais brasileiros (BrasilAPI) pra uma store
// específica num ano. Idempotente. Não sobrescreve feriados marcados
// como `type='manual'` (preserva edições do usuário).
//
// Body: { storeId: uuid, year: number }
// Response: { success, inserted, updated, skipped, year }
//
// Auth: admin_gc / gestor_gc da empresa da store.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRASIL_API_BASE = "https://brasilapi.com.br/api/feriados/v1";

interface BrasilApiHoliday {
  date: string;        // YYYY-MM-DD
  name: string;
  type: string;        // 'national' (BrasilAPI sempre nacional)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

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
  if (authErr || !user) return jsonResponse({ error: "Invalid token" }, 401);

  // Permission: admin_gc ou gestor_gc
  const { data: roles } = await sbUser
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleStrings = (roles ?? []).map((r) =>
    String((r as { role: string }).role),
  );
  const isAdmin = roleStrings.includes("admin_gc");
  const isGestor = roleStrings.includes("gestor_gc");
  if (!isAdmin && !isGestor) {
    return jsonResponse({ error: "Sem permissão" }, 403);
  }

  let storeId: string;
  let year: number;
  try {
    const body = await req.json();
    storeId = String(body.storeId ?? "").trim();
    year = Number(body.year);
    if (!storeId) throw new Error("missing storeId");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error("year inválido");
    }
  } catch (e) {
    return jsonResponse(
      { error: "Body deve ter { storeId, year }: " + (e as Error).message },
      400,
    );
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Busca store pra resolver company_id + checar existência
  const { data: store, error: storeErr } = await sbAdmin
    .from("stores")
    .select("id, company_id")
    .eq("id", storeId)
    .single();
  if (storeErr || !store) {
    return jsonResponse({ error: "Empresa não encontrada" }, 404);
  }

  // gestor_gc só sincroniza pra própria company
  if (!isAdmin && isGestor) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: store.company_id,
      _user_id: user.id,
    });
    if (!belongs) {
      return jsonResponse(
        { error: "Empresa não pertence à sua company" },
        403,
      );
    }
  }

  // Fetch BrasilAPI
  let brasilApiData: BrasilApiHoliday[];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(`${BRASIL_API_BASE}/${year}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      throw new Error(`BrasilAPI HTTP ${resp.status}`);
    }
    brasilApiData = await resp.json();
  } catch (err) {
    return jsonResponse(
      {
        error: "Falha ao buscar BrasilAPI",
        details: (err as Error).message,
      },
      502,
    );
  }

  if (!Array.isArray(brasilApiData) || brasilApiData.length === 0) {
    return jsonResponse({ error: "BrasilAPI retornou lista vazia" }, 502);
  }

  // Busca feriados existentes pra essa store no ano (pra preservar manuais)
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const { data: existing, error: existingErr } = await sbAdmin
    .from("store_holidays")
    .select("date, type")
    .eq("store_id", storeId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (existingErr) {
    return jsonResponse(
      { error: "Falha lendo feriados existentes", details: existingErr.message },
      500,
    );
  }

  const manualDates = new Set(
    (existing ?? [])
      .filter((h) => (h as { type: string }).type === "manual")
      .map((h) => (h as { date: string }).date),
  );

  // Filtra: não sobrescreve manuais. Os outros (national/state/municipal de
  // syncs anteriores) o upsert atualiza nome se a BrasilAPI mudou.
  const rowsToUpsert = brasilApiData
    .filter((h) => !manualDates.has(h.date))
    .map((h) => ({
      store_id: storeId,
      company_id: store.company_id,
      date: h.date,
      name: h.name,
      type: "national" as const,
      source: `brasilapi:${year}`,
    }));

  let inserted = 0;
  if (rowsToUpsert.length > 0) {
    const { error: upsertErr, count } = await sbAdmin
      .from("store_holidays")
      .upsert(rowsToUpsert, {
        onConflict: "store_id,date",
        ignoreDuplicates: false,
        count: "exact",
      });
    if (upsertErr) {
      return jsonResponse(
        { error: "Upsert falhou", details: upsertErr.message },
        500,
      );
    }
    inserted = count ?? rowsToUpsert.length;
  }

  return jsonResponse({
    success: true,
    year,
    storeId,
    fetched: brasilApiData.length,
    upserted: inserted,
    skippedManual: manualDates.size,
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
