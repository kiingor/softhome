// Edge Function: pix-gateway-config
//
// Lê e salva as credenciais do Santander por ambiente (pix_gateway_credentials),
// pra você configurar tudo pelo painel em vez de SSH. O client_secret é CIFRADO
// no edge (PIX_CRED_KEY, fora do banco) ANTES de gravar; a leitura NUNCA devolve
// o segredo — só diz se ele está configurado.
//
// AÇÕES (body { action, ... }):
//   get  → { environments: { sandbox: <cfg sem segredo>|null, production: ... } }
//   save → grava um ambiente. Na primeira vez o client_secret é obrigatório; num
//          save posterior sem client_secret, o segredo atual é preservado.
//
// Gate: papel admin_gc/admin/diretoria (o mesmo que troca o ambiente). Salvar
// credencial de produção é setup — ligar produção (com 2FA + prova) é a
// pix-env-switch. verify_jwt padrão.
//
// Deploy: npx supabase functions deploy pix-gateway-config
// Secrets: PIX_CRED_KEY (32 bytes base64)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { encryptSecret, isCryptoConfigured } from "../_shared/pix-crypto.ts";
import { gwBaseUrl, gwCredentialsHeader } from "../_shared/pix-env.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
type Sb = any;

const ENVIRONMENTS = ["sandbox", "production"] as const;

interface Body {
  action: "get" | "save" | "discover" | "create_workspace";
  environment?: string;
  client_id?: string;
  client_secret?: string;
  workspace_id?: string;
  base_url?: string;
  receipts_base_url?: string | null;
  debit_branch?: string;
  debit_account?: string;
  /** create_workspace: conta de débito do novo workspace de PIX. */
  branch?: string;
  number?: string;
  description?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sbUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ip = clientIp(req);

  // Papel: só admin_gc / admin / diretoria configuram credencial.
  const { data: roles } = await sbUser.from("user_roles").select("role").eq("user_id", user.id);
  const roleOk = (roles ?? []).some((r: { role: string }) =>
    ["admin_gc", "admin", "diretoria"].includes(String(r.role)),
  );
  if (!roleOk) {
    return json(
      { error: "FORBIDDEN_ROLE", message: "Só o admin de G&C e a diretoria configuram o gateway do PIX." },
      403,
    );
  }

  let body: Body;
  try {
    const raw = await req.json();
    const action = String(raw.action ?? "");
    if (!["get", "save", "discover", "create_workspace"].includes(action)) {
      throw new Error("action inválida");
    }
    body = { action: action as Body["action"], ...raw };
  } catch (e) {
    return json({ error: "BAD_REQUEST", message: (e as Error).message }, 400);
  }

  // ── discover ─────────────────────────────────────────────────────────────
  // Lista os workspaces (com conta + flag de PIX ativo) usando as credenciais
  // DIGITADAS no formulário — ainda não salvas. Assim dá pra ESCOLHER o workspace
  // e a conta antes de gravar. As creds vão transitórias pro gateway (header),
  // nada é armazenado aqui.
  if (body.action === "discover") {
    const clientId = str(body.client_id);
    const clientSecret = String(body.client_secret ?? "");
    const baseUrl = str(body.base_url);
    if (!clientId || !clientSecret || !baseUrl) {
      return json({ error: "BAD_REQUEST", message: "Pra buscar, preenche client_id, client_secret e base URL." }, 200);
    }
    const gwUrl = gwBaseUrl();
    const gwSecret = Deno.env.get("SANTANDER_GW_SECRET");
    if (!gwUrl || !gwSecret) {
      return json({ error: "NOT_CONFIGURED", message: "Gateway indisponível. Fala com o admin." }, 200);
    }
    const header = gwCredentialsHeader({
      client_id: clientId,
      client_secret: clientSecret,
      workspace_id: "",
      base_url: baseUrl.replace(/\/+$/, ""),
      receipts_base_url: null,
      debit_branch: "",
      debit_account: "",
    });
    try {
      const res = await fetch(`${gwUrl}/workspaces`, {
        headers: { Authorization: `Bearer ${gwSecret}`, ...header },
      });
      const data = (await res.json().catch(() => null)) as { workspaces?: unknown } | null;
      if (!res.ok) {
        const msg = res.status === 401 || res.status === 403
          ? "O Santander recusou essas credenciais. Confere client_id/secret/base URL (e se o certificado é o desse ambiente)."
          : `Não deu pra listar os workspaces agora (HTTP ${res.status}).`;
        return json({ error: "DISCOVER_FAILED", message: msg }, 200);
      }
      return json({ workspaces: Array.isArray(data?.workspaces) ? data!.workspaces : [] }, 200);
    } catch {
      return json({ error: "GATEWAY_UNREACHABLE", message: "Não deu pra falar com o gateway agora." }, 200);
    }
  }

  // ── create_workspace ─────────────────────────────────────────────────────
  // Cria um workspace type=PAYMENTS (o que liga PIX) com a conta de débito, usando
  // as credenciais DIGITADAS. É a saída pra quando a conta só tem workspaces de
  // Boleto/DDA. Não move dinheiro; é reversível no Santander (DELETE).
  if (body.action === "create_workspace") {
    const clientId = str(body.client_id);
    const clientSecret = String(body.client_secret ?? "");
    const baseUrl = str(body.base_url);
    const branch = str(body.branch);
    const number = str(body.number);
    const description = str(body.description) || undefined;
    if (!clientId || !clientSecret || !baseUrl || !branch || !number) {
      return json({ error: "BAD_REQUEST", message: "Preenche client_id, client_secret, base URL, agência e conta." }, 200);
    }
    const gwUrl = gwBaseUrl();
    const gwSecret = Deno.env.get("SANTANDER_GW_SECRET");
    if (!gwUrl || !gwSecret) {
      return json({ error: "NOT_CONFIGURED", message: "Gateway indisponível. Fala com o admin." }, 200);
    }
    const header = gwCredentialsHeader({
      client_id: clientId,
      client_secret: clientSecret,
      workspace_id: "",
      base_url: baseUrl.replace(/\/+$/, ""),
      receipts_base_url: null,
      debit_branch: "",
      debit_account: "",
    });
    try {
      const res = await fetch(`${gwUrl}/workspaces`, {
        method: "POST",
        headers: { Authorization: `Bearer ${gwSecret}`, "Content-Type": "application/json", ...header },
        body: JSON.stringify({
          type: "PAYMENTS",
          mainDebitAccount: { branch, number },
          description: description ?? "PIX Folha SoftHouse",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = res.status === 401 || res.status === 403
          ? "O Santander recusou (credenciais ou permissão pra criar workspace)."
          : `Não deu pra criar o workspace agora (HTTP ${res.status}).`;
        return json({ error: "CREATE_WS_FAILED", message: msg }, 200);
      }
      await sbAdmin.from("payment_2fa_events").insert({
        company_id: null,
        user_id: user.id,
        kind: "pix_workspace_created",
        metadata: { environment: String(body.environment ?? ""), branch, number },
        ip,
      });
      return json({ ok: true, workspace: data }, 200);
    } catch {
      return json({ error: "GATEWAY_UNREACHABLE", message: "Não deu pra falar com o gateway agora." }, 200);
    }
  }

  // ── get ────────────────────────────────────────────────────────────────────
  if (body.action === "get") {
    const { data: rows } = await sbAdmin
      .from("pix_gateway_credentials")
      .select("environment, client_id, workspace_id, base_url, receipts_base_url, debit_branch, debit_account, updated_at");
    const byEnv: Record<string, unknown> = { sandbox: null, production: null };
    for (const r of rows ?? []) {
      // NUNCA o segredo — só os campos de config + a marca de que existe.
      byEnv[(r as { environment: string }).environment] = {
        client_id: (r as Record<string, unknown>).client_id,
        workspace_id: (r as Record<string, unknown>).workspace_id,
        base_url: (r as Record<string, unknown>).base_url,
        receipts_base_url: (r as Record<string, unknown>).receipts_base_url,
        debit_branch: (r as Record<string, unknown>).debit_branch,
        debit_account: (r as Record<string, unknown>).debit_account,
        has_secret: true,
        updated_at: (r as Record<string, unknown>).updated_at,
      };
    }
    return json({ environments: byEnv }, 200);
  }

  // ── save ───────────────────────────────────────────────────────────────────
  if (!isCryptoConfigured()) {
    return json(
      { error: "CRYPTO_NOT_CONFIGURED", message: "Cifra indisponível (PIX_CRED_KEY). Fala com o admin." },
      200,
    );
  }

  const env = String(body.environment ?? "");
  if (!ENVIRONMENTS.includes(env as typeof ENVIRONMENTS[number])) {
    return json({ error: "BAD_REQUEST", message: "environment precisa ser 'sandbox' ou 'production'." }, 400);
  }

  const clientId = str(body.client_id);
  const workspaceId = str(body.workspace_id);
  const baseUrl = str(body.base_url);
  const debitBranch = str(body.debit_branch);
  const debitAccount = str(body.debit_account);
  const receiptsBaseUrl = body.receipts_base_url ? str(body.receipts_base_url) : null;
  const clientSecret = body.client_secret ? String(body.client_secret) : "";

  if (!clientId || !workspaceId || !baseUrl || !debitBranch || !debitAccount) {
    return json(
      { error: "BAD_REQUEST", message: "Preenche client_id, workspace, base URL, agência e conta." },
      200,
    );
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    return json({ error: "BAD_REQUEST", message: "A base URL precisa começar com https://" }, 200);
  }

  // Segredo: obrigatório na primeira vez; num save posterior sem segredo,
  // preserva o que já está gravado (edição dos demais campos sem re-digitar).
  const { data: existing } = await sbAdmin
    .from("pix_gateway_credentials")
    .select("client_secret_enc")
    .eq("environment", env)
    .maybeSingle();

  let secretEnc: string | null = (existing as { client_secret_enc?: string } | null)?.client_secret_enc ?? null;
  if (clientSecret) {
    try {
      secretEnc = await encryptSecret(clientSecret);
    } catch (e) {
      return json({ error: "ENCRYPT_FAILED", message: "Não deu pra cifrar o segredo: " + (e as Error).message }, 200);
    }
  }
  if (!secretEnc) {
    return json({ error: "SECRET_REQUIRED", message: "Informe o client_secret (primeira configuração deste ambiente)." }, 200);
  }

  const { error: upErr } = await sbAdmin
    .from("pix_gateway_credentials")
    .upsert({
      environment: env,
      client_id: clientId,
      workspace_id: workspaceId,
      base_url: baseUrl.replace(/\/+$/, ""),
      receipts_base_url: receiptsBaseUrl ? receiptsBaseUrl.replace(/\/+$/, "") : null,
      debit_branch: debitBranch,
      debit_account: debitAccount,
      client_secret_enc: secretEnc,
      updated_by: user.id,
    }, { onConflict: "environment" });

  if (upErr) {
    return json({ error: "SAVE_FAILED", message: "Não deu pra salvar agora." }, 200);
  }

  // Trilha sem segredo (nunca o client_secret, nem o ciphertext).
  await sbAdmin.from("payment_2fa_events").insert({
    company_id: null,
    user_id: user.id,
    kind: "pix_gateway_config_saved",
    metadata: { environment: env, secret_changed: !!clientSecret },
    ip,
  });

  return json({ ok: true, environment: env }, 200);
});

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
