// Edge Function: import-collaborators
//
// Importação em lote de colaboradores a partir de planilha:
//   1. Auth check (admin_gc / gestor_gc da company)
//   2. Para cada linha:
//      a. Insere collaborator
//      b. Se position_id: cria payroll_entries fixos (salario_base + INSS/FGTS/IRPF)
//      c. Atribui benefits_assignments
//      d. Se email + create_auth=true: cria auth.users + profile + role + company_users
//   3. Erros não abortam — segue pra próxima linha e devolve relatório
//
// Body: { company_id: uuid, rows: ImportRow[] }
// Response: { results: ImportResult[], summary: { ok, errors, auth_created } }

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ImportRow = {
  row_index: number;
  name: string;
  cpf: string;
  rg: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  admission_date: string | null;
  regime: "clt" | "pj" | "estagiario";
  position_id: string | null;
  team_id: string | null;
  store_id: string | null;
  contracted_store_id: string | null;
  is_pcd: boolean;
  is_apprentice: boolean;
  is_temp: boolean;
  notes: string | null;
  benefit_ids: string[];
};

type ImportResult = {
  row_index: number;
  status: "ok" | "error";
  collaborator_id?: string;
  auth_user_created?: boolean;
  temp_password?: string;
  error?: string;
};

const cleanCPF = (s: string) => s.replace(/\D/g, "");
const cleanCEP = (s: string) => s.replace(/\D/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth" }, 401);

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
  if (authErr || !user) return json({ error: "Invalid token" }, 401);

  // Auth: admin_gc / gestor_gc
  const { data: roles } = await sbUser
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleStrings = (roles ?? []).map((r) => String((r as { role: string }).role));
  const isAdmin = roleStrings.some((r) => ["admin_gc", "admin"].includes(r));
  const isGestor = roleStrings.includes("gestor_gc");
  if (!isAdmin && !isGestor) {
    return json({ error: "Sem permissão pra importar colaboradores" }, 403);
  }

  let body: { company_id?: string; rows?: ImportRow[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const companyId = String(body.company_id ?? "").trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!companyId) return json({ error: "company_id obrigatório" }, 400);
  if (rows.length === 0) return json({ error: "Nenhuma linha pra importar" }, 400);

  // Gestor só importa pra empresa que pertence
  if (!isAdmin && isGestor) {
    const { data: belongs } = await sbUser.rpc("user_belongs_to_company", {
      _company_id: companyId,
      _user_id: user.id,
    });
    if (!belongs) {
      return json({ error: "Sem permissão para esta empresa" }, 403);
    }
  }

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cache positions p/ não consultar várias vezes a mesma
  const positionCache = new Map<
    string,
    { salary: number; inss_percent: number; fgts_percent: number; irpf_percent: number; name: string } | null
  >();

  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  const results: ImportResult[] = [];
  let okCount = 0;
  let errorCount = 0;
  let authCreatedCount = 0;

  for (const row of rows) {
    try {
      const cpfDigits = cleanCPF(row.cpf);
      if (!cpfDigits || !row.name?.trim()) {
        results.push({ row_index: row.row_index, status: "error", error: "Nome ou CPF ausente" });
        errorCount++;
        continue;
      }

      const insertPayload = {
        company_id: companyId,
        name: row.name.trim(),
        cpf: cpfDigits,
        rg: row.rg?.trim() || null,
        email: row.email?.trim().toLowerCase() || null,
        phone: row.phone?.replace(/\D/g, "") || null,
        birth_date: row.birth_date || null,
        address: row.address?.trim() || null,
        district: row.district?.trim() || null,
        city: row.city?.trim() || null,
        state: row.state?.trim().toUpperCase() || null,
        postal_code: row.postal_code ? cleanCEP(row.postal_code) : null,
        admission_date: row.admission_date || null,
        regime: row.regime || "clt",
        position_id: row.position_id || null,
        team_id: row.team_id || null,
        store_id: row.store_id || null,
        contracted_store_id: row.contracted_store_id || null,
        is_pcd: !!row.is_pcd,
        is_apprentice: !!row.is_apprentice,
        is_temp: !!row.is_temp,
        notes: row.notes?.trim() || null,
        status: "ativo" as const,
      };

      const { data: created, error: insertErr } = await sbAdmin
        .from("collaborators")
        .insert(insertPayload)
        .select("id, name")
        .single();

      if (insertErr || !created) {
        let msg = insertErr?.message ?? "Falha ao inserir";
        if (msg.includes("collaborators_cpf_company_id_key") || insertErr?.code === "23505") {
          msg = "CPF já cadastrado nesta empresa";
        }
        results.push({ row_index: row.row_index, status: "error", error: msg });
        errorCount++;
        continue;
      }

      const collaboratorId = created.id;

      // Lançamentos financeiros (salario + impostos)
      if (row.position_id) {
        let pos = positionCache.get(row.position_id);
        if (pos === undefined) {
          const { data: posData } = await sbAdmin
            .from("positions")
            .select("name, salary, inss_percent, fgts_percent, irpf_percent")
            .eq("id", row.position_id)
            .single();
          pos = posData
            ? {
                name: posData.name,
                salary: Number(posData.salary) || 0,
                inss_percent: Number(posData.inss_percent) || 0,
                fgts_percent: Number(posData.fgts_percent) || 0,
                irpf_percent: Number(posData.irpf_percent) || 0,
              }
            : null;
          positionCache.set(row.position_id, pos);
        }

        if (pos && pos.salary > 0) {
          const entries: Array<{
            type: string;
            description: string;
            value: number;
          }> = [
            { type: "salario_base", description: "Salário base (auto)", value: pos.salary },
          ];
          const inss = (pos.salary * pos.inss_percent) / 100;
          const fgts = (pos.salary * pos.fgts_percent) / 100;
          const irpf = (pos.salary * pos.irpf_percent) / 100;
          if (inss > 0) entries.push({ type: "inss", description: "INSS (auto)", value: inss });
          if (fgts > 0) entries.push({ type: "fgts", description: "FGTS (auto)", value: fgts });
          if (irpf > 0) entries.push({ type: "irpf", description: "IRPF (auto)", value: irpf });

          await sbAdmin.from("payroll_entries").insert(
            entries.map((e) => ({
              ...e,
              month,
              year,
              is_fixed: true,
              collaborator_id: collaboratorId,
              company_id: companyId,
              store_id: row.store_id || null,
              created_by: user.id,
            })),
          );
        }
      }

      // Benefícios
      if (row.benefit_ids?.length) {
        const uniqueBenefits = [...new Set(row.benefit_ids)];
        await sbAdmin.from("benefits_assignments").insert(
          uniqueBenefits.map((bid) => ({
            benefit_id: bid,
            collaborator_id: collaboratorId,
          })),
        );
      }

      // Auth user (apenas se email)
      let authUserCreated = false;
      let tempPassword: string | undefined;
      const emailNorm = insertPayload.email;
      if (emailNorm) {
        tempPassword = `${cpfDigits.slice(0, 4)}@SH`;
        try {
          const { data: authUser, error: authCreateErr } =
            await sbAdmin.auth.admin.createUser({
              email: emailNorm,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { name: insertPayload.name },
            });

          if (!authCreateErr && authUser?.user) {
            const userId = authUser.user.id;
            await sbAdmin.from("profiles").insert({
              user_id: userId,
              company_id: companyId,
              full_name: insertPayload.name,
            });
            await sbAdmin
              .from("user_roles")
              .insert({ user_id: userId, role: "colaborador" });
            try {
              await sbAdmin.from("company_users").insert({
                company_id: companyId,
                email: emailNorm,
                full_name: insertPayload.name,
                user_id: userId,
                invited_by: user.id,
                is_active: true,
                accepted_at: new Date().toISOString(),
              });
            } catch (_) {
              // company_users pode não existir — ignora
            }
            await sbAdmin
              .from("collaborators")
              .update({ user_id: userId })
              .eq("id", collaboratorId);
            authUserCreated = true;
            authCreatedCount++;
          }
        } catch (authErr) {
          console.error("[import-collaborators] auth user error", authErr);
        }
      }

      results.push({
        row_index: row.row_index,
        status: "ok",
        collaborator_id: collaboratorId,
        auth_user_created: authUserCreated,
        temp_password: authUserCreated ? tempPassword : undefined,
      });
      okCount++;
    } catch (e) {
      results.push({
        row_index: row.row_index,
        status: "error",
        error: e instanceof Error ? e.message : "Erro desconhecido",
      });
      errorCount++;
    }
  }

  return json({
    results,
    summary: { ok: okCount, errors: errorCount, auth_created: authCreatedCount },
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
