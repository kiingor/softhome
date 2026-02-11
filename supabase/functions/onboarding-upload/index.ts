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
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const collaboratorId = formData.get("collaborator_id") as string;
    const companyId = formData.get("company_id") as string;
    const positionDocumentId = formData.get("position_document_id") as string;

    if (!file || !collaboratorId || !companyId || !positionDocumentId) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Upload file to storage
    const fileExt = file.name.split(".").pop();
    const filePath = `${companyId}/${collaboratorId}/${positionDocumentId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("collaborator-documents")
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("collaborator-documents")
      .getPublicUrl(filePath);

    // Check if document already exists (for re-upload after rejection)
    const { data: existing } = await supabase
      .from("collaborator_documents")
      .select("id")
      .eq("collaborator_id", collaboratorId)
      .eq("position_document_id", positionDocumentId)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from("collaborator_documents")
        .update({
          file_url: filePath,
          file_name: file.name,
          status: "pendente",
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      // Insert new
      const { error } = await supabase
        .from("collaborator_documents")
        .insert({
          collaborator_id: collaboratorId,
          company_id: companyId,
          position_document_id: positionDocumentId,
          file_url: filePath,
          file_name: file.name,
        });

      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ success: true, file_url: filePath }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Onboarding upload error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
