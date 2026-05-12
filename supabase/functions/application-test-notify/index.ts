// Edge Function: application-test-notify
//
// Envia o link dos testes da vaga para o candidato via WhatsApp (Evolution).
// O candidato recebe uma mensagem com o link público /recrutamento/teste/:token
// e responde sem precisar de login.
//
// Body (JSON): {
//   application_id: uuid,
//   public_url_origin: string   // ex: "https://gc.softcom.com.br"
// }
//
// Auth: JWT de admin_gc/gestor_gc/rh.
// Side effects: chama Evolution API. Não escreve em banco.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NotifyBody {
  application_id: string;
  public_url_origin: string;
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
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

  if (!evolutionUrl || !evolutionKey) {
    return jsonResponse(
      { error: "EvolutionAPI não configurada para WhatsApp." },
      500,
    );
  }

  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authErr,
  } = await sbUser.auth.getUser();
  if (authErr || !user) {
    return jsonResponse({ error: "Sessão inválida" }, 401);
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey);

  // 2. Body
  let body: NotifyBody;
  try {
    body = await req.json();
    if (!body.application_id) {
      throw new Error("application_id obrigatório");
    }
  } catch (err) {
    return jsonResponse(
      { error: "Body inválido: " + (err as Error).message },
      400,
    );
  }

  // 3. Busca application + candidato + vaga
  const { data: application, error: appErr } = await sbAdmin
    .from("candidate_applications")
    .select(
      "id, company_id, candidate:candidates(id, name, phone), job:job_openings(id, title)",
    )
    .eq("id", body.application_id)
    .maybeSingle();

  if (appErr || !application) {
    return jsonResponse({ error: "Aplicação não encontrada" }, 404);
  }

  const candidate = application.candidate as
    | { id: string; name: string; phone: string | null }
    | null;
  const job = application.job as { id: string; title: string } | null;

  if (!candidate?.phone) {
    return jsonResponse(
      {
        error:
          "Candidato sem telefone cadastrado. Atualize o cadastro antes de enviar.",
      },
      400,
    );
  }

  // 4. Pega instância WhatsApp da empresa
  const { data: instance } = await sbAdmin
    .from("whatsapp_instances")
    .select("instance_name, status")
    .eq("company_id", application.company_id)
    .eq("status", "open")
    .maybeSingle();

  if (!instance) {
    return jsonResponse(
      {
        error:
          "WhatsApp não conectado para esta empresa. Configure em Integrações.",
      },
      400,
    );
  }

  // 5. Busca application_tests pendentes (status not_started ou in_progress)
  const { data: tests, error: testsErr } = await sbAdmin
    .from("application_tests")
    .select(
      "id, access_token, status, test:admission_tests(name, slug)",
    )
    .eq("application_id", body.application_id)
    .in("status", ["not_started", "in_progress"]);

  if (testsErr) {
    return jsonResponse(
      { error: "Erro ao buscar testes: " + testsErr.message },
      500,
    );
  }

  if (!tests || tests.length === 0) {
    return jsonResponse(
      {
        error:
          "Nenhum teste pendente atribuído. Atribua os testes antes de enviar.",
      },
      400,
    );
  }

  // 6. Monta mensagem
  const firstName = candidate.name.split(" ")[0];
  const jobTitle = job?.title ?? "vaga";
  const origin = body.public_url_origin.replace(/\/$/, "");

  // Se for só 1 teste, manda um link direto. Se forem vários, lista todos.
  let messageBody: string;
  if (tests.length === 1) {
    const t = tests[0];
    const testName =
      (t.test as { name?: string } | null)?.name ?? "teste";
    messageBody =
      `Olá ${firstName}! 👋\n\n` +
      `Você avançou na seleção para *${jobTitle}* na *Softcom*! 🎉\n\n` +
      `Próxima etapa: responder o teste *${testName}*.\n\n` +
      `Acesse o link abaixo para começar:\n` +
      `👉 ${origin}/recrutamento/teste/${t.access_token}\n\n` +
      `Reserve um tempinho sem distrações. Suas respostas são salvas automaticamente. 📝\n\n` +
      `Qualquer dúvida, estamos por aqui! 💬`;
  } else {
    const links = tests
      .map((t) => {
        const testName =
          (t.test as { name?: string } | null)?.name ?? "teste";
        return `• *${testName}*: ${origin}/recrutamento/teste/${t.access_token}`;
      })
      .join("\n");
    messageBody =
      `Olá ${firstName}! 👋\n\n` +
      `Você avançou na seleção para *${jobTitle}* na *Softcom*! 🎉\n\n` +
      `Próxima etapa: responder ${tests.length} testes. Acesse os links abaixo:\n\n` +
      `${links}\n\n` +
      `Reserve um tempinho sem distrações. Suas respostas são salvas automaticamente. 📝\n\n` +
      `Qualquer dúvida, estamos por aqui! 💬`;
  }

  // 7. Limpa telefone (Brasil)
  let phone = candidate.phone.replace(/\D/g, "");
  if (!phone.startsWith("55")) {
    phone = "55" + phone;
  }

  // 8. Envia via Evolution
  const baseUrl = evolutionUrl.replace(/\/$/, "");
  let evolutionResponse: unknown = null;
  let status = "sent";
  try {
    const res = await fetch(
      `${baseUrl}/message/sendText/${instance.instance_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionKey,
        },
        body: JSON.stringify({
          number: phone,
          text: messageBody,
        }),
      },
    );
    evolutionResponse = await res.json().catch(() => null);
    if (!res.ok) {
      status = "failed";
      return jsonResponse(
        {
          error: "Falha ao enviar pelo WhatsApp",
          details: evolutionResponse,
        },
        502,
      );
    }
  } catch (err) {
    return jsonResponse(
      { error: "Erro de rede com WhatsApp: " + (err as Error).message },
      502,
    );
  }

  return jsonResponse({
    success: true,
    status,
    tests_count: tests.length,
    phone_sent_to: phone,
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
