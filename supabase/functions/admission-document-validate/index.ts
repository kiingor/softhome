// Edge Function: admission-document-validate
//
// Pré-valida com Claude (Sonnet 4.6) um documento submetido pelo candidato
// na admissão. Não substitui o RH — só monta um parecer estruturado pra
// agilizar a revisão humana.
//
// A lógica de validação fica em _shared/validate-admission-doc.ts —
// reusada pelo admission-public-submit que dispara a IA em background
// logo após o upload.
//
// Body: { document_id: uuid }
// Auth: JWT de admin_gc/gestor_gc/rh.
//
// Side effects (via runDocumentValidation):
//   - admission_documents.ai_validation_result + ai_confidence
//   - admission_events kind='doc_validated'
//   - status passa por ai_validating durante e volta pra submitted
//
// Deploy: npx supabase functions deploy admission-document-validate
// Secrets: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL (opcional)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  runDocumentValidation,
  ValidationError,
} from "../_shared/validate-admission-doc.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ValidateBody {
  document_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

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
  if (authErr || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // 2. Body
  let documentId: string;
  try {
    const body = (await req.json()) as ValidateBody;
    documentId = body.document_id;
    if (!documentId) throw new Error("missing document_id");
  } catch {
    return jsonResponse(
      { error: "Body must include { document_id }" },
      400,
    );
  }

  // 3. Permissão (admin_gc/gestor_gc + empresa)
  // Busca a empresa do doc antes de checar pertinência
  const { data: doc, error: docErr } = await sbAdmin
    .from("admission_documents")
    .select("company_id")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) {
    return jsonResponse({ error: "Documento não encontrado" }, 404);
  }

  const { data: roles } = await sbUser
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roleStrings = (roles ?? []).map((r) =>
    String((r as { role: string }).role),
  );
  const isAdmin = roleStrings.includes("admin_gc") ||
    roleStrings.includes("admin");
  const isGestor = roleStrings.includes("gestor_gc") ||
    roleStrings.includes("rh");

  if (!isAdmin && !isGestor) {
    return jsonResponse(
      { error: "Sem permissão pra validar documentos" },
      403,
    );
  }

  if (!isAdmin) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: doc.company_id,
      _user_id: user.id,
    });
    if (!belongs) {
      return jsonResponse(
        { error: "Documento não é da sua empresa" },
        403,
      );
    }
  }

  // 4. Roda o pipeline (helper compartilhado)
  try {
    const { result, confidence } = await runDocumentValidation({
      sbAdmin,
      documentId,
      actorUserId: user.id,
    });
    return jsonResponse({ success: true, result, confidence });
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    return jsonResponse(
      { error: "Falha na validação", details: (err as Error).message },
      500,
    );
  }
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
