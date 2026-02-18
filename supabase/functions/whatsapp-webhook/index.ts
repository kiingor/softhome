import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-company-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const event = body.event;
    const instanceName = body.instance;

    if (!instanceName) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find instance in DB
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!instance) {
      console.log("Instance not found in DB:", instanceName);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event === "CONNECTION_UPDATE" || body.event === "connection.update") {
      const state = body.data?.state || body.data?.instance?.state || body.state;
      
      const updateData: Record<string, unknown> = {};
      
      if (state === "open") {
        updateData.status = "open";
        // Try to get phone number from the event data
        const phoneNumber = body.data?.instance?.wuid?.split("@")?.[0] || 
                           body.data?.wuid?.split("@")?.[0] || null;
        if (phoneNumber) {
          updateData.phone_number = phoneNumber;
        }
      } else if (state === "close" || state === "refused") {
        updateData.status = "close";
        updateData.phone_number = null;
      } else if (state === "connecting") {
        updateData.status = "connecting";
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("whatsapp_instances")
          .update(updateData)
          .eq("id", instance.id);
        console.log(`Instance ${instanceName} updated:`, updateData);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
