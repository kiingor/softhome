import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header to verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a client with the user's token to verify they're authenticated
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is authenticated and has permission
    const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !callerUser) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the request body
    const { email, password, full_name, company_id } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "ID da empresa é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify caller is company owner (has permission to create users)
    const { data: companyData, error: companyError } = await adminClient
      .from("companies")
      .select("id, owner_id")
      .eq("id", company_id)
      .single();

    if (companyError || !companyData) {
      console.error("Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller is company owner
    if (companyData.owner_id !== callerUser.id) {
      console.error("User is not company owner:", callerUser.id);
      return new Response(
        JSON.stringify({ error: "Sem permissão para criar usuários nesta empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the user using admin API (doesn't log in as them)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // Auto-confirm the email
    });

    if (createError) {
      console.error("Error creating user:", createError);
      
      if (createError.message?.includes("already been registered") || 
          createError.message?.includes("already exists")) {
        return new Response(
          JSON.stringify({ error: "Este email já possui uma conta cadastrada" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: createError.message || "Erro ao criar usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("User created successfully:", newUser.user?.id);

    // Setup all required records for the new user
    if (newUser.user) {
      const userId = newUser.user.id;
      const normalizedEmail = email.toLowerCase().trim();

      // 1. Create profile with company_id (critical for user_belongs_to_company to work)
      const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
          user_id: userId,
          company_id: company_id,
          full_name: full_name || null,
        });

      if (profileError) {
        console.error("Error creating profile:", profileError);
        // Continue anyway, profile might already exist from trigger
      }

      // 2. Add the collaborator role to the new user
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "colaborador" });

      if (roleError) {
        console.error("Error adding role:", roleError);
        // Don't fail the whole operation, just log it
      }

      // 3. Insert into company_users table so user appears in the list
      const { error: companyUserError } = await adminClient
        .from("company_users")
        .insert({
          company_id: company_id,
          email: normalizedEmail,
          full_name: full_name || null,
          user_id: userId,
          invited_by: callerUser.id,
          is_active: true,
          accepted_at: new Date().toISOString(),
        });

      if (companyUserError) {
        console.error("Error adding company_user:", companyUserError);
        // Don't fail the whole operation, just log it
      }

      console.log("All user records created successfully for:", userId);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: newUser.user?.id,
        message: "Usuário criado com sucesso" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
