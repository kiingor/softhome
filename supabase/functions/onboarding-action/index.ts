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
    const { action, collaborator_id, session_id, data } = await req.json();

    if (!action || !collaborator_id) {
      return new Response(
        JSON.stringify({ error: "action e collaborator_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    switch (action) {
      case "validate_step": {
        const { step } = data;
        const updates: Record<string, any> = { current_step: step + 1 };
        if (step === 1) updates.data_validated = true;
        if (step === 2) updates.financial_validated = true;
        if (step === 3) updates.documents_completed = true;

        const { error } = await supabase
          .from("onboarding_sessions")
          .update(updates)
          .eq("id", session_id);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "report_error": {
        const { step, description } = data;

        const { error } = await supabase
          .from("onboarding_errors")
          .insert({
            onboarding_session_id: session_id,
            step,
            description,
          });

        if (error) throw error;

        // Also advance the step
        const updates: Record<string, any> = { current_step: step + 1 };
        if (step === 1) updates.data_validated = true;
        if (step === 2) updates.financial_validated = true;

        await supabase
          .from("onboarding_sessions")
          .update(updates)
          .eq("id", session_id);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "complete": {
        // Mark session as completed
        const { error: sessionError } = await supabase
          .from("onboarding_sessions")
          .update({
            current_step: 4,
            documents_completed: true,
            completed_at: new Date().toISOString(),
          })
          .eq("id", session_id);

        if (sessionError) throw sessionError;

        // Update collaborator status to validacao_pendente
        const { error: collabError } = await supabase
          .from("collaborators")
          .update({ status: "validacao_pendente" })
          .eq("id", collaborator_id);

        if (collabError) throw collabError;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Ação inválida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Onboarding action error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
