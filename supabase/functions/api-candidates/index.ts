// Edge Function: api-candidates
//
// API externa para criação de candidatos no banco de talentos.
// Aceita cv_url como URL pública já hospedada (ex: link do Supabase
// Storage, Google Drive, etc.) — sem upload de arquivo.
//
// Autentica via header x-api-key com SOFTHOUSE_API_KEY.
//
// POST /api-candidates
//   Body: CandidateInput (ver docs/API.md)
//   Retorna: { data: { id, name, email, cv_url, created_at } }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-api-key, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim())
    return json({ error: "name é obrigatório." }, 400);

  // Resolve company_id: usa o fornecido ou pega o único registro
  let companyId = body.company_id as string | undefined;
  if (!companyId) {
    const { data: companies, error: compErr } = await sb
      .from("companies")
      .select("id")
      .limit(2);
    if (compErr || !companies?.length) {
      return json({ error: "Não foi possível determinar a empresa. Forneça company_id." }, 400);
    }
    if (companies.length > 1) {
      return json({
        error:
          "Múltiplas empresas encontradas. Forneça company_id explicitamente.",
      }, 400);
    }
    companyId = companies[0].id;
  }

  const { data, error } = await sb
    .from("candidates")
    .insert({
      company_id: companyId,
      name: (body.name as string).trim(),
      email: (body.email as string) ?? null,
      phone: (body.phone as string) ?? null,
      cpf: (body.cpf as string)?.replace(/\D/g, "") || null,
      cv_url: (body.cv_url as string) ?? null,
      cv_filename: (body.cv_filename as string) ?? null,
      linkedin_url: (body.linkedin_url as string) ?? null,
      source: (body.source as string) ?? "api_migracao",
      notes: (body.notes as string) ?? null,
      is_active: (body.is_active as boolean) ?? true,
    })
    .select("id, name, email, phone, cv_url, source, is_active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return json({ error: "E-mail já cadastrado nesta empresa." }, 409);
    }
    return json({ error: error.message }, 422);
  }

  // Dispara cv-process em background pra gerar embedding (busca semântica)
  // se cv_url foi fornecido. Fire-and-forget: a resposta não espera.
  if (data.cv_url && data.cv_url.startsWith("http")) {
    // @ts-ignore EdgeRuntime é injetado pelo Supabase Edge Runtime
    EdgeRuntime.waitUntil(
      triggerCvProcess(data.id, data.cv_url).catch((e) =>
        console.error("[api-candidates] cv-process falhou:", e),
      ),
    );
  }

  return json({ data }, 201);
});

async function triggerCvProcess(candidateId: string, cvUrl: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cv-process`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ candidateId, cvUrl }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`cv-process ${resp.status}: ${text}`);
  }
}

