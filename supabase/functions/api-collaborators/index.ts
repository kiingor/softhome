// Edge Function: api-collaborators
//
// API externa para criação de colaboradores. Usada para migração de
// dados e integrações externas. Autentica via header x-api-key com
// SOFTHOUSE_API_KEY (secret configurado no Supabase).
//
// Usa service_role para bypass de RLS — seguro pois valida a API key
// antes de qualquer operação.
//
// POST /api-collaborators
//   Body: CollaboratorInput (ver docs/API.md)
//   Retorna: { data: { id, name, cpf, status, regime, created_at } }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-api-key, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const VALID_STATUSES = ["ativo", "aguardando_documentacao"] as const;
const VALID_REGIMES = ["clt", "pj", "estagiario"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  // Auth via x-api-key ou Authorization: Bearer <key>
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const expectedKey = Deno.env.get("SOFTHOUSE_API_KEY");
  if (!expectedKey || apiKey !== expectedKey) {
    return json({ error: "Unauthorized. Forneça um x-api-key válido." }, 401);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET / — retorna valores de referência (status, regime)
  if (req.method === "GET") {
    const { data: companies } = await sb
      .from("companies")
      .select("id, name")
      .order("name");
    return json({
      reference: {
        status: VALID_STATUSES,
        regime: VALID_REGIMES,
      },
      companies: companies ?? [],
    });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  // Validação dos campos obrigatórios
  if (!body.store_id) return json({ error: "store_id é obrigatório." }, 400);
  if (!body.name || typeof body.name !== "string" || !body.name.trim())
    return json({ error: "name é obrigatório." }, 400);
  if (!body.cpf) return json({ error: "cpf é obrigatório." }, 400);

  // Normaliza CPF (remove pontuação)
  const cpf = String(body.cpf).replace(/\D/g, "");
  if (cpf.length !== 11) return json({ error: "cpf deve ter 11 dígitos numéricos." }, 400);

  // Valida status
  const status = (body.status as string) ?? "ativo";
  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return json({ error: `status inválido. Valores aceitos: ${VALID_STATUSES.join(", ")}` }, 400);
  }

  // Valida regime
  const regime = (body.regime as string) ?? "clt";
  if (!VALID_REGIMES.includes(regime as typeof VALID_REGIMES[number])) {
    return json({ error: `regime inválido. Valores aceitos: ${VALID_REGIMES.join(", ")}` }, 400);
  }

  // Resolve company_id: usa o fornecido ou deriva da store
  let companyId = body.company_id as string | undefined;
  if (!companyId) {
    const { data: store, error: storeErr } = await sb
      .from("stores")
      .select("company_id")
      .eq("id", body.store_id)
      .single();
    if (storeErr || !store) {
      return json({ error: "store_id não encontrado." }, 400);
    }
    companyId = store.company_id;
  }

  const { data, error } = await sb
    .from("collaborators")
    .insert({
      company_id: companyId,
      store_id: body.store_id,
      contracted_store_id: (body.contracted_store_id as string) ?? null,
      position_id: (body.position_id as string) ?? null,
      team_id: (body.team_id as string) ?? null,
      name: (body.name as string).trim(),
      cpf,
      email: (body.email as string) ?? null,
      phone: (body.phone as string) ?? null,
      admission_date: (body.admission_date as string) ?? null,
      birth_date: (body.birth_date as string) ?? null,
      regime,
      status,
      is_temp: (body.is_temp as boolean) ?? false,
    })
    .select("id, name, cpf, status, regime, admission_date, created_at")
    .single();

  if (error) {
    // CPF duplicado por constraint único
    if (error.code === "23505") {
      return json({ error: "CPF já cadastrado nesta empresa." }, 409);
    }
    return json({ error: error.message }, 422);
  }

  return json({ data }, 201);
});
