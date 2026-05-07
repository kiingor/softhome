// Edge Function: admission-public-tests
//
// Endpoint público (sem auth) pra fluxo de testes da etapa 1 da admissão.
// Usado pela página pública /admissao/:token quando journey.status === 'tests_pending'.
//
// Actions:
//   action: 'get'      → retorna journey + lista de testes atribuídos
//   action: 'start'    → marca um teste como in_progress
//   action: 'save'     → salva progresso parcial (answers jsonb)
//   action: 'complete' → finaliza teste, calcula score, marca completed
//
// Quando todos os testes do journey forem 'completed', o status do journey
// vira 'tests_in_review' e o RH é notificado.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SaveBody {
  action: "save" | "complete";
  token: string;
  journeyTestId: string;
  answers: Record<string, unknown>;
  autoScore?: number;
  resultSummary?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const token = String(body.token ?? "").trim();
  if (!token) return j({ error: "missing token" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Valida token + carrega journey
  const { data: journey, error: jErr } = await sb
    .from("admission_journeys")
    .select("id, company_id, candidate_name, status, token_expires_at")
    .eq("access_token", token)
    .single();
  if (jErr || !journey) return j({ error: "Token inválido" }, 404);

  if (journey.token_expires_at) {
    const exp = new Date(journey.token_expires_at).getTime();
    if (exp < Date.now()) return j({ error: "Esse link expirou.", expired: true }, 410);
  }
  if (journey.status === "admitted" || journey.status === "cancelled") {
    return j({ error: "Processo encerrado", finalStatus: journey.status }, 410);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET: lista journey + testes
  // ─────────────────────────────────────────────────────────────────────────
  if (action === "get") {
    const { data: journeyTests, error: tErr } = await sb
      .from("admission_journey_tests")
      .select(
        "id, test_id, test_slug, status, started_at, completed_at, " +
          "test:admission_tests(name, description, category, time_limit_minutes, allow_pause)",
      )
      .eq("journey_id", journey.id)
      .order("assigned_at", { ascending: true });
    if (tErr) return j({ error: tErr.message }, 500);

    return j({
      success: true,
      journey: {
        id: journey.id,
        candidate_name: journey.candidate_name,
        status: journey.status,
      },
      tests: journeyTests ?? [],
    });
  }

  // Demais actions precisam de journeyTestId
  const journeyTestId = String(body.journeyTestId ?? "");
  if (!journeyTestId) return j({ error: "missing journeyTestId" }, 400);

  // Valida que esse journey_test pertence ao journey do token (anti-fraude)
  const { data: jt, error: jtErr } = await sb
    .from("admission_journey_tests")
    .select("id, journey_id, status")
    .eq("id", journeyTestId)
    .single();
  if (jtErr || !jt || jt.journey_id !== journey.id) {
    return j({ error: "Teste não encontrado" }, 404);
  }
  if (jt.status === "completed" || jt.status === "reviewed") {
    return j({ error: "Esse teste já foi finalizado" }, 409);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────────────────────────────────
  if (action === "start") {
    const { error } = await sb
      .from("admission_journey_tests")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", journeyTestId);
    if (error) return j({ error: error.message }, 500);

    // Atualiza status do journey pra tests_pending se ainda for 'created'
    if (journey.status === "created") {
      await sb
        .from("admission_journeys")
        .update({ status: "tests_pending" })
        .eq("id", journey.id);
    }

    await sb.from("admission_events").insert({
      company_id: journey.company_id,
      journey_id: journey.id,
      kind: "test_started",
      payload: { journey_test_id: journeyTestId },
    });

    return j({ success: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE (progresso parcial)
  // ─────────────────────────────────────────────────────────────────────────
  if (action === "save") {
    const { answers } = body as SaveBody;
    const { error } = await sb
      .from("admission_journey_tests")
      .update({ answers })
      .eq("id", journeyTestId);
    if (error) return j({ error: error.message }, 500);
    return j({ success: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMPLETE
  // ─────────────────────────────────────────────────────────────────────────
  if (action === "complete") {
    const { answers, autoScore, resultSummary } = body as SaveBody;
    const { error } = await sb
      .from("admission_journey_tests")
      .update({
        status: "completed",
        answers: answers ?? {},
        auto_score: typeof autoScore === "number" ? autoScore : null,
        result_summary: resultSummary ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", journeyTestId);
    if (error) return j({ error: error.message }, 500);

    await sb.from("admission_events").insert({
      company_id: journey.company_id,
      journey_id: journey.id,
      kind: "test_completed",
      payload: { journey_test_id: journeyTestId, score: autoScore ?? null },
    });

    // Verifica se todos os testes foram finalizados
    const { data: remaining } = await sb
      .from("admission_journey_tests")
      .select("id")
      .eq("journey_id", journey.id)
      .neq("status", "completed")
      .neq("status", "reviewed");

    if (!remaining || remaining.length === 0) {
      // Todos prontos → muda journey pra tests_in_review
      await sb
        .from("admission_journeys")
        .update({ status: "tests_in_review" })
        .eq("id", journey.id);
    }

    return j({
      success: true,
      allDone: !remaining || remaining.length === 0,
    });
  }

  return j({ error: `unknown action: ${action}` }, 400);
});

function j(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
