import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify caller is company owner
    const { data: companyData, error: companyError } = await adminClient
      .from("companies")
      .select("id, owner_id")
      .eq("id", company_id)
      .single();

    if (companyError || !companyData) {
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (companyData.owner_id !== callerUser.id) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para criar usuários nesta empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Try to create the user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    let userId: string;

    if (createError) {
      // If user already exists, try to link them to this company
      if (createError.message?.includes("already been registered") || 
          createError.message?.includes("already exists")) {
        
        console.log("User already exists, attempting to link to company:", normalizedEmail);
        
        // Find existing user
        const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers();
        
        if (listError) {
          console.error("Error listing users:", listError);
          return new Response(
            JSON.stringify({ error: "Erro ao buscar usuário existente" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const existingUser = existingUsers.users.find(
          (u) => u.email?.toLowerCase() === normalizedEmail
        );

        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: "Usuário não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        userId = existingUser.id;

        // Check if already linked to this company
        const { data: existingLink } = await adminClient
          .from("company_users")
          .select("id")
          .eq("company_id", company_id)
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (existingLink) {
          return new Response(
            JSON.stringify({ error: "Este usuário já está cadastrado nesta empresa" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update password for existing user
        await adminClient.auth.admin.updateUserById(userId, { password });

        // Link to company
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
        }

        // Update profile to point to this company
        const { error: profileUpdateError } = await adminClient
          .from("profiles")
          .update({ company_id: company_id, full_name: full_name || null })
          .eq("user_id", userId);

        if (profileUpdateError) {
          console.error("Error updating profile:", profileUpdateError);
        }

        console.log("Existing user linked to company successfully:", userId);

        return new Response(
          JSON.stringify({ 
            success: true, 
            user_id: userId,
            message: "Usuário existente vinculado à empresa com sucesso" 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: createError.message || "Erro ao criar usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    userId = newUser.user!.id;
    console.log("User created successfully:", userId);

    // Setup all required records for the new user
    // 1. Create profile
    const { error: profileError } = await adminClient
      .from("profiles")
      .insert({
        user_id: userId,
        company_id: company_id,
        full_name: full_name || null,
      });

    if (profileError) {
      console.error("Error creating profile:", profileError);
    }

    // 2. Add the collaborator role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({ user_id: userId, role: "colaborador" });

    if (roleError) {
      console.error("Error adding role:", roleError);
    }

    // 3. Insert into company_users
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
    }

    console.log("All user records created successfully for:", userId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId,
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
