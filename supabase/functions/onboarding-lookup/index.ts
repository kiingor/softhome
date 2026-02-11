import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cpf } = await req.json();

    if (!cpf || typeof cpf !== "string") {
      return new Response(
        JSON.stringify({ error: "CPF é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedCpf = cpf.replace(/\D/g, "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find collaborator by CPF with allowed statuses
    const { data: collaborator, error: collabError } = await supabase
      .from("collaborators")
      .select("id, name, cpf, email, phone, position_id, company_id, status, position")
      .eq("cpf", cleanedCpf)
      .in("status", ["aguardando_documentacao", "reprovado"])
      .maybeSingle();

    if (collabError) throw collabError;

    if (!collaborator) {
      return new Response(
        JSON.stringify({ error: "CPF não encontrado ou cadastro já finalizado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company info
    const { data: company } = await supabase
      .from("companies")
      .select("company_name, logo_url, cnpj")
      .eq("id", collaborator.company_id)
      .single();

    // Get or create onboarding session
    let { data: session } = await supabase
      .from("onboarding_sessions")
      .select("*")
      .eq("collaborator_id", collaborator.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      const { data: newSession, error: sessionError } = await supabase
        .from("onboarding_sessions")
        .insert({
          collaborator_id: collaborator.id,
          company_id: collaborator.company_id,
          current_step: 1,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      session = newSession;
    }

    // Get required documents for position
    let requiredDocuments: any[] = [];
    if (collaborator.position_id) {
      const { data: docs } = await supabase
        .from("position_documents")
        .select("id, name, observation, file_type")
        .eq("position_id", collaborator.position_id);
      requiredDocuments = docs || [];
    }

    // Get uploaded documents
    const { data: uploadedDocs } = await supabase
      .from("collaborator_documents")
      .select("id, position_document_id, file_url, file_name, status, rejection_reason")
      .eq("collaborator_id", collaborator.id);

    // Get financial entries (current month)
    const now = new Date();
    const { data: financialEntries } = await supabase
      .from("payroll_entries")
      .select("id, type, value, description")
      .eq("collaborator_id", collaborator.id)
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear());

    // Get benefits
    const { data: benefitAssignments } = await supabase
      .from("benefits_assignments")
      .select("id, benefit:benefits(id, name, value, value_type)")
      .eq("collaborator_id", collaborator.id);

    // Get onboarding errors
    const { data: errors } = await supabase
      .from("onboarding_errors")
      .select("id, step, description, created_at")
      .eq("onboarding_session_id", session.id);

    return new Response(
      JSON.stringify({
        collaborator: {
          id: collaborator.id,
          name: collaborator.name,
          cpf: collaborator.cpf,
          email: collaborator.email,
          phone: collaborator.phone,
          position: collaborator.position,
          status: collaborator.status,
        },
        company: company || {},
        session,
        requiredDocuments,
        uploadedDocuments: uploadedDocs || [],
        financialEntries: financialEntries || [],
        benefits: benefitAssignments || [],
        errors: errors || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Onboarding lookup error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
