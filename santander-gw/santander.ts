// Cliente mTLS do Santander — transporte, token e contrato do provedor.
//
// POR QUE ISTO NÃO É UMA EDGE FUNCTION (ver ADR 0006)
// O edge-runtime da VPS é `deno_core` com um subconjunto de ops, e
// `Deno.createHttpClient` — a única forma de fazer mTLS em Deno — é API instável
// cuja flag não controlamos lá dentro. Um bump de imagem poderia removê-la em
// silêncio, no dia do pagamento. Além disso a chave privada como variável de
// ambiente aparece em `docker inspect` e no backup do `functions-secrets.env`,
// num runtime que roda outras 40 funções. Aqui a chave é arquivo em volume
// read-only, e o processo faz uma coisa só.
//
// SEM CERTIFICADO NÃO EXISTE NEM ERRO DE APLICAÇÃO: o Akamai devolve 403 (HTML
// "Access Denied") antes de a request chegar no Santander. Se aparecer HTML no
// `provider_body` de um erro, o problema é certificado/rede, não credencial.
// Roteiro de diagnóstico completo na tabela da ADR 0006.
//
// A CLASSIFICAÇÃO DE ERRO É A PARTE QUE VALE DINHEIRO
// Todo erro sai daqui com `indeterminate`, que responde a única pergunta que
// importa pro chamador: "dá pra afirmar que o dinheiro NÃO saiu?".
//   indeterminate = false → recusa provada. O chamador pode marcar failed.
//   indeterminate = true  → não sabemos. O chamador marca 'unknown' e chama
//                           gente (payroll_pix_mark_unknown).
// Na dúvida a resposta é `true`. Errar pra "trava e chama gente" custa um
// pagamento atrasado; errar pra "falhou, tenta de novo" custa um pagamento em
// dobro, e PIX não tem estorno unilateral.

import { log, maskDoc, maskName, maskPixKey } from "./mask.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de transporte
// ─────────────────────────────────────────────────────────────────────────────

/** Timeout por operação. O PATCH é o mais generoso porque é ele que move dinheiro:
 *  desistir cedo demais de uma confirmação em voo só cria estado 'unknown' à toa. */
const TIMEOUT_TOKEN_MS = 10_000;
const TIMEOUT_POST_MS = 10_000;
const TIMEOUT_PATCH_MS = 30_000;
const TIMEOUT_GET_MS = 15_000;

/** Retry SÓ nestes status, e SÓ em token e GET (ver `retry` em CallOpts). */
const RETRY_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 3;
/** Retry-After do provedor é respeitado, mas com teto: um `Retry-After: 600`
 *  seguraria a request muito além do budget de quem chamou o gateway. */
const RETRY_AFTER_CAP_MS = 8_000;

/** Corpo do provedor no texto do erro. 300 chars pegam o JSON de erro inteiro do
 *  Santander e cortam a página HTML do Akamai antes de ela poluir o log. */
const PROVIDER_BODY_MAX = 300;

/** PIX carrega até 140 chars de remittance. Se o provedor reclamar de tamanho,
 *  é esta constante que desce — e nada mais. */
const REMITTANCE_MAX = 140;

const DEFAULT_BASE_URL = "https://trust-sandbox.api.santander.com.br";
const DEFAULT_CERT_PATH = "/certs/client.crt";
const DEFAULT_KEY_PATH = "/certs/client.key";

/** Vencimento do e-CNPJ A1 da Softcom (AC SAFEWEB RFB v5). Certificado vencido em
 *  dia de folha é o incidente clássico — a ADR 0006 exige alerta 30 dias antes. */
const DEFAULT_CERT_NOT_AFTER = "2027-08-12";
export const CERT_EXPIRY_WARN_DAYS = 30;

export type DictCodeType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

/** O enum do nosso banco é minúsculo (public.pix_key_type); o do Santander, MAIÚSCULO. */
export const DICT_CODE_TYPES: ReadonlySet<string> = new Set([
  "CPF",
  "CNPJ",
  "EMAIL",
  "PHONE",
  "EVP",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Erro tipado
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorKind =
  /** Falta env var / certificado ilegível. Nada foi enviado. */
  | "config"
  /** Kill-switch ligado. Nada foi enviado. */
  | "disabled"
  /** Corpo inválido, barrado por nós. Nada foi enviado. */
  | "bad_request"
  /** O banco disse não (4xx de negócio). Recusa PROVADA. */
  | "provider_rejected"
  /** 5xx / 429 / 408 do provedor. Pode ter processado antes de falhar. */
  | "provider_unavailable"
  /** Estourou o AbortController. O caso caro: a resposta se perde, o dinheiro não. */
  | "timeout"
  /** TLS/DNS/conexão. Só é seguro chamar de "não saiu" antes do primeiro byte — e não dá pra saber. */
  | "network";

/**
 * INVARIANTE: 4xx ⇔ indeterminate=false, 5xx ⇔ indeterminate=true.
 *
 * Não é estética de REST. A payroll-pix-pay classifica pela FAIXA do status
 * (>=500, 408 e 429 viram 'unknown'; o resto vira 'failed'), então o status é o
 * contrato de verdade — o campo `indeterminate` é a documentação dele.
 *
 * Daí `config` ser 424 e `disabled` ser 423, e não os 500/503 que a semântica
 * HTTP pediria: os dois são PROVADAMENTE pré-voo (nenhum fetch aconteceu). Um
 * 503 no kill-switch prenderia a folha inteira em 'unknown' — 300 transferências
 * exigindo resolução humana escrita porque alguém desligou os pagamentos, que é
 * justamente a ação segura e reversível. Pior: transformaria o estado 'unknown'
 * em ruído, e ruído é como uma trava de segurança vira clique automático.
 */
const KIND_HTTP_STATUS: Record<ErrorKind, number> = {
  // 424 Failed Dependency: falta env/certificado. Nada foi enviado.
  config: 424,
  // 423 Locked: kill-switch. Nada foi enviado.
  disabled: 423,
  bad_request: 400,
  provider_rejected: 422,
  provider_unavailable: 502,
  timeout: 504,
  network: 502,
};

/** Status do kill-switch, exportado pra que o main.ts não repita o número —
 *  dois lugares com o mesmo status é como um dos dois muda sozinho. */
export const DISABLED_STATUS = KIND_HTTP_STATUS.disabled;

/** Só estes três deixam dúvida sobre onde o dinheiro parou. */
const INDETERMINATE_KINDS: ReadonlySet<ErrorKind> = new Set<ErrorKind>([
  "provider_unavailable",
  "timeout",
  "network",
]);

export class SantanderError extends Error {
  readonly kind: ErrorKind;
  /**
   * Mensagem SEM o eco do provedor — é esta que vai pro log.
   *
   * O corpo de erro do Santander devolve o que mandamos ("dictCode inválido:
   * fulano@gmail.com"), então despejar `message` no log plantaria chave PIX em
   * texto plano no `docker logs`. O corpo cru continua indo na RESPOSTA, onde o
   * destino dele é `response_payload` de payroll_pix_transfers — tabela com RLS
   * e audit trigger, que é o lugar certo pra ele.
   */
  readonly baseMessage: string;
  /** Status que o GATEWAY devolve pro chamador. */
  readonly status: number;
  /** Status que o PROVEDOR devolveu, quando houve resposta. */
  readonly providerStatus?: number;
  /** Corpo do provedor, truncado. Nunca contém PII nossa — é o eco dele. */
  readonly providerBody?: string;
  /** true = não dá pra afirmar que o dinheiro não saiu. Ver cabeçalho. */
  readonly indeterminate: boolean;
  readonly retryAfterMs?: number;

  constructor(
    kind: ErrorKind,
    message: string,
    opts: { providerStatus?: number; providerBody?: string; retryAfterMs?: number } = {},
  ) {
    const body = opts.providerBody?.slice(0, PROVIDER_BODY_MAX);
    super(body ? `${message}: ${body}` : message);
    this.name = "SantanderError";
    this.baseMessage = message;
    this.kind = kind;
    this.status = KIND_HTTP_STATUS[kind];
    this.providerStatus = opts.providerStatus;
    this.providerBody = body;
    this.indeterminate = INDETERMINATE_KINDS.has(kind);
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/**
 * Traduz o status do provedor em kind.
 *
 * 408 e 429 caem em `provider_unavailable` (e não em `provider_rejected`) de
 * propósito: os dois significam "tenta de novo", e "tenta de novo" com dinheiro
 * é decisão humana, não do código.
 */
function kindForStatus(status: number): ErrorKind {
  if (status === 408 || status === 429) return "provider_unavailable";
  if (status >= 400 && status < 500) return "provider_rejected";
  return "provider_unavailable";
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuração — lida A CADA REQUEST, nunca no boot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kill-switch dos pagamentos PIX.
 *
 * Mesma forma do isAgendaSyncDisabled() de
 * supabase/functions/_shared/softcom-cloud.ts: lido por request (Deno.env), então
 * desligar pagamento NÃO exige redeploy nem rebuild — basta setar a variável e
 * reiniciar o container (ou trocar no env_file e `docker compose up -d`), e
 * voltar é igualmente barato.
 *
 * Default = HABILITADO (só desliga quando o valor for truthy).
 *
 * ESCOPO: bloqueia POST e PATCH — os verbos que criam e movem dinheiro. NÃO
 * bloqueia GET nem /pix/search, de propósito: quando alguém desliga o pagamento
 * é justamente quando MAIS se precisa consultar o que já foi enviado. Uma
 * reconciliação desligada junto transformaria um susto em pagamento órfão.
 */
export function isPixPaymentsDisabled(): boolean {
  const raw = (Deno.env.get("PIX_PAYMENTS_DISABLED") ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export interface GwConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  workspaceId: string;
  debitBranch: string;
  debitAccount: string;
  /** 'production' quando a base for o host trust-open. Vai pro log pra não haver dúvida depois. */
  environment: "sandbox" | "production";
}

function requireEnv(name: string): string {
  const value = (Deno.env.get(name) ?? "").trim();
  if (!value) {
    throw new SantanderError("config", `Falta a variável de ambiente ${name}`);
  }
  return value;
}

export function readConfig(): GwConfig {
  const baseUrl = (Deno.env.get("SANTANDER_BASE_URL") ?? DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  return {
    baseUrl,
    clientId: requireEnv("SANTANDER_CLIENT_ID"),
    clientSecret: requireEnv("SANTANDER_CLIENT_SECRET"),
    workspaceId: requireEnv("SANTANDER_WORKSPACE_ID"),
    debitBranch: requireEnv("SANTANDER_DEBIT_BRANCH"),
    debitAccount: requireEnv("SANTANDER_DEBIT_ACCOUNT"),
    // Deriva do host em vez de ser mais uma env: duas fontes de verdade pro
    // ambiente é como se "ensaiei no sandbox" vira "paguei de verdade".
    environment: baseUrl.includes("trust-open") ? "production" : "sandbox",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cliente mTLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `Deno.createHttpClient` é API instável: dependendo da versão ela nem aparece
 * nos tipos estáveis, e o `deno cache` do build quebraria por erro de tipo numa
 * API que EXISTE em runtime. Por isso o acesso é por cast, e a existência dela
 * vira uma checagem explícita (hasHttpClientSupport) que o main.ts roda no boot.
 * Descobrir que o runtime não tem mTLS no dia do pagamento é o cenário que a
 * ADR 0006 usou pra tirar isto de dentro do edge-runtime.
 */
type HttpClientLike = { close(): void };

const createHttpClient = (Deno as unknown as {
  createHttpClient?: (opts: { cert: string; key: string }) => HttpClientLike;
}).createHttpClient;

export function hasHttpClientSupport(): boolean {
  return typeof createHttpClient === "function";
}

let httpClient: HttpClientLike | null = null;

export function certPaths(): { cert: string; key: string } {
  return {
    cert: (Deno.env.get("SANTANDER_CERT_PATH") ?? DEFAULT_CERT_PATH).trim(),
    key: (Deno.env.get("SANTANDER_KEY_PATH") ?? DEFAULT_KEY_PATH).trim(),
  };
}

/**
 * Cliente HTTP com o certificado cliente. Criado uma vez e reusado — cada
 * `createHttpClient` abre um pool próprio, e um por request esgotaria o
 * handshake TLS na primeira folha grande.
 *
 * O PEM é lido do volume read-only. Trocar o certificado exige reiniciar o
 * container (por isso o alerta de vencimento existe: renovar sem reiniciar não
 * tem efeito nenhum).
 */
function getHttpClient(): HttpClientLike {
  if (httpClient) return httpClient;

  if (!createHttpClient) {
    throw new SantanderError(
      "config",
      "Deno.createHttpClient indisponível — falta a flag --unstable-http neste runtime",
    );
  }

  const { cert: certPath, key: keyPath } = certPaths();
  let cert: string;
  let key: string;
  try {
    cert = Deno.readTextFileSync(certPath);
    key = Deno.readTextFileSync(keyPath);
  } catch (err) {
    throw new SantanderError(
      "config",
      `Não consegui ler o certificado (${certPath} / ${keyPath}): ${(err as Error).message}`,
    );
  }
  if (!cert.includes("BEGIN CERTIFICATE")) {
    throw new SantanderError("config", `${certPath} não parece um PEM de certificado`);
  }
  if (!key.includes("PRIVATE KEY")) {
    // Erro clássico da conversão: esquecer o -nodes no openssl e gerar chave
    // com senha ("ENCRYPTED PRIVATE KEY"), que o Deno não abre.
    throw new SantanderError(
      "config",
      `${keyPath} não parece uma chave privada PEM sem senha (ver README, openssl -nodes)`,
    );
  }

  httpClient = createHttpClient({ cert, key });
  return httpClient;
}

/** Dias até o vencimento do certificado. Vem de env porque parsear X.509 em Deno
 *  puro seria mais código do que o problema merece — o README manda conferir com
 *  `openssl x509 -enddate` e ajustar a variável na renovação. */
export function certDaysLeft(): number {
  const raw = (Deno.env.get("SANTANDER_CERT_NOT_AFTER") ?? DEFAULT_CERT_NOT_AFTER).trim();
  const notAfter = new Date(`${raw}T23:59:59Z`);
  if (Number.isNaN(notAfter.getTime())) return -1;
  return Math.floor((notAfter.getTime() - Date.now()) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chamada ao provedor
// ─────────────────────────────────────────────────────────────────────────────

interface CallOpts {
  method: "GET" | "POST" | "PATCH";
  url: string;
  headers: Record<string, string>;
  /** Corpo JSON. */
  body?: unknown;
  /** Corpo cru (form-urlencoded do token). */
  rawBody?: string;
  timeoutMs: number;
  /**
   * Retry automático em 429/503.
   *
   * Só `true` em token e GET. POST e PATCH NUNCA repetem sozinhos: um retry
   * automático em cima de uma request que pode ter vingado é uma aposta com o
   * dinheiro dos outros. O estado 'unknown' do banco existe exatamente pra
   * devolver essa decisão pra uma pessoa.
   */
  retry: boolean;
  label: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
}

async function callOnce(o: CallOpts): Promise<{ status: number; json: unknown; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs);
  const startedAt = Date.now();
  try {
    // `client` só existe no RequestInit do Deno com os tipos instáveis
    // carregados; o cast mantém o `deno cache` do Dockerfile type-checando.
    const init = {
      method: o.method,
      headers: o.headers,
      body: o.rawBody ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
      signal: ctrl.signal,
      client: getHttpClient(),
    } as RequestInit;

    const resp = await fetch(o.url, init);

    const text = await resp.text();
    const elapsed = Date.now() - startedAt;

    if (!resp.ok) {
      throw new SantanderError(
        kindForStatus(resp.status),
        `Santander ${o.label} HTTP ${resp.status} (${elapsed}ms)`,
        {
          providerStatus: resp.status,
          providerBody: text,
          retryAfterMs: parseRetryAfter(resp.headers.get("retry-after")),
        },
      );
    }

    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // 2xx com corpo não-JSON não é sucesso pra nós: pode ser página de
        // borda do Akamai devolvida com 200 em algum caminho esquisito.
        throw new SantanderError(
          "provider_unavailable",
          `Santander ${o.label} devolveu 2xx com corpo não-JSON`,
          { providerStatus: resp.status, providerBody: text },
        );
      }
    }
    return { status: resp.status, json, text };
  } catch (err) {
    if (err instanceof SantanderError) throw err;
    if ((err as Error).name === "AbortError" || (err as Error).name === "TimeoutError") {
      throw new SantanderError(
        "timeout",
        `Santander ${o.label}: timeout após ${o.timeoutMs}ms`,
      );
    }
    throw new SantanderError(
      "network",
      `Santander ${o.label}: falha de rede/TLS — ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function call(o: CallOpts): Promise<{ status: number; json: unknown; text: string }> {
  if (!o.retry) return await callOnce(o);

  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(o);
    } catch (err) {
      const retryable = err instanceof SantanderError &&
        err.providerStatus !== undefined &&
        RETRY_STATUSES.has(err.providerStatus);
      if (!retryable || attempt >= MAX_RETRIES) throw err;

      // 1s, 2s, 4s + jitter (o jitter evita que a folha inteira volte junto).
      const backoff = (err as SantanderError).retryAfterMs ??
        Math.min(1000 * 2 ** attempt, RETRY_AFTER_CAP_MS);
      const delay = backoff + Math.floor(Math.random() * 300);
      log("warn", "provider.retry", {
        label: o.label,
        attempt: attempt + 1,
        max: MAX_RETRIES,
        provider_status: (err as SantanderError).providerStatus,
        delay_ms: delay,
      });
      await sleep(delay);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token OAuth — cache em memória + mutex
// ─────────────────────────────────────────────────────────────────────────────

/** O token vive 900s. Renovamos aos ~800s: 100s de margem cobrem uma chamada
 *  lenta que pegou o token no limite e chegaria no banco já vencida — que seria
 *  um 401 no meio de um pagamento, ou seja, um 'unknown'. */
const TOKEN_SAFETY_MARGIN_MS = 100_000;
const TOKEN_DEFAULT_TTL_S = 900;

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;
/** Mutex simples: enquanto uma renovação está em voo, todo mundo espera A MESMA
 *  promise. Sem isso, uma folha de 300 colaboradores dispararia 300 requests de
 *  token no primeiro segundo — e o Santander responderia com 429. */
let tokenInFlight: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const cfg = readConfig();
  const form = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
  });

  const { json } = await call({
    method: "POST",
    url: `${cfg.baseUrl}/auth/oauth/v2/token`,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    rawBody: form.toString(),
    timeoutMs: TIMEOUT_TOKEN_MS,
    // Token PODE repetir: pedir token não move dinheiro.
    retry: true,
    label: "token",
  });

  const payload = (json ?? {}) as Record<string, unknown>;
  const token = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!token) {
    throw new SantanderError("provider_unavailable", "Resposta do token sem access_token");
  }
  const ttl = Number(payload.expires_in);
  const ttlSeconds = Number.isFinite(ttl) && ttl > 0 ? ttl : TOKEN_DEFAULT_TTL_S;

  cachedToken = {
    token,
    // Math.max: se o provedor um dia devolver um TTL menor que a margem, o
    // cache viraria "sempre vencido" e cada request pediria token de novo.
    expiresAtMs: Date.now() + Math.max(ttlSeconds * 1000 - TOKEN_SAFETY_MARGIN_MS, 30_000),
  };

  log("info", "token.renewed", { expires_in_s: ttlSeconds, environment: cfg.environment });
  return token;
}

export async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now()) return cachedToken.token;
  if (tokenInFlight) return await tokenInFlight;

  tokenInFlight = fetchToken().finally(() => {
    tokenInFlight = null;
  });
  return await tokenInFlight;
}

/** Descarta o token em cache. Usado quando o provedor devolve 401 num GET — o
 *  relógio dele e o nosso podem discordar. Nunca usado em POST/PATCH: lá, 401 é
 *  resposta final e quem decide o que fazer é o chamador. */
export function invalidateToken(): void {
  cachedToken = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contrato do Santander
// ─────────────────────────────────────────────────────────────────────────────

function paymentsUrl(cfg: GwConfig, suffix = ""): string {
  return `${cfg.baseUrl}/management_payments_partners/v1/workspaces/${
    encodeURIComponent(cfg.workspaceId)
  }/pix_payments${suffix}`;
}

async function authHeaders(cfg: GwConfig): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    authorization: `Bearer ${token}`,
    // O X-Application-Key é o client_id, e é OBRIGATÓRIO junto do Bearer — sem
    // ele a chamada morre antes da aplicação, com erro que não menciona o header.
    "X-Application-Key": cfg.clientId,
    accept: "application/json",
    "content-type": "application/json",
  };
}

export interface PixDocument {
  documentNumber: string;
  documentType: "CPF" | "CNPJ";
  name: string;
}

export interface PixTransferInput {
  idempotencyKey: string;
  /** Já normalizado como string "1234.56". Ver normalizeAmount() no main.ts. */
  amount: string;
  dictCode: string;
  dictCodeType: DictCodeType;
  payeeName: string;
  payeeDocument?: string | null;
  description?: string | null;
  /** Pagador vem do chamador porque o sistema é multi-CNPJ: matriz e filiais
   *  pagam cada uma com o próprio CNPJ (payer_snapshot da RPC). */
  payer?: PixDocument | null;
  /** Conta débito por request, mesmo motivo. Sem isso, cai no par do env. */
  debitAccount?: { branch: string; number: string } | null;
}

/**
 * remittanceInformation = descrição + idempotency_key.
 *
 * A DESCRIÇÃO é que é truncada, nunca a chave, e a chave vai no fim: é ela que
 * permite achar o pagamento quando o POST deu timeout e não temos o
 * provider_payment_id. Truncar a chave transformaria o canal de recuperação
 * secundário em enfeite. (O primário é `tags`, que a ADR 0006 provou que volta
 * inteiro no GET.)
 */
function buildRemittance(description: string | null | undefined, key: string): string {
  const room = REMITTANCE_MAX - key.length - 1;
  const desc = (description ?? "").trim().slice(0, Math.max(room, 0));
  return desc ? `${desc} ${key}`.slice(0, REMITTANCE_MAX) : key.slice(0, REMITTANCE_MAX);
}

export function buildPaymentPayload(
  cfg: GwConfig,
  input: PixTransferInput,
): Record<string, unknown> {
  const branch = input.debitAccount?.branch ?? cfg.debitBranch;
  const number = input.debitAccount?.number ?? cfg.debitAccount;

  const payload: Record<string, unknown> = {
    debitAccount: { branch, number },
    // A tag do Santander tem TETO DE 20 CARACTERES (provado contra o sandbox:
    // "Tag deve receber no máximo 20 caracteres"), e a nossa idempotency_key
    // (sh-<32hex>-<attempt>) tem 37. Então a tag leva só um prefixo — o canal de
    // recuperação de verdade, quando o provider_payment_id se perde num timeout,
    // é o remittanceInformation abaixo, que cabe a chave INTEIRA (140 chars) e é
    // onde matchesKey/searchByIdempotencyKey procuram primeiro.
    tags: [input.idempotencyKey.slice(0, 20)],
    // O Santander chama a chave de telefone de CELULAR, não PHONE (provado
    // contra o sandbox: 'PHONE' devolve "Tipo de chave Pix inválida", 'CELULAR'
    // é aceito). O nosso enum interno segue 'phone'; a tradução mora aqui, na
    // camada que fala o contrato do provedor.
    dictCodeType: input.dictCodeType === "PHONE" ? "CELULAR" : input.dictCodeType,
    dictCode: input.dictCode,
    remittanceInformation: buildRemittance(input.description, input.idempotencyKey),
    // Strings, não números: o contrato do Santander é string e o valor vem de
    // numeric(12,2) do Postgres. Passar por float no caminho é onde centavo some.
    //
    // Os CINCO campos de valor espelham um pagamento real lido do sandbox
    // (ADR 0006): sem desconto nem acréscimo, os quatro derivados são o próprio
    // valor. `paymentValue` é OBRIGATÓRIO — sua ausência foi o primeiro 400 que
    // o sandbox devolveu (_field: paymentValue, "Valor do pagamento é obrigatório").
    nominalValue: input.amount,
    deductedValue: "0.00",
    addedValue: "0.00",
    totalValue: input.amount,
    paymentValue: input.amount,
  };

  if (input.payer) payload.payer = input.payer;

  // O `beneficiary` NÃO é enviado, de propósito. Este endpoint paga PELA CHAVE:
  // o DICT resolve o favorecido (banco, agência, conta, documento) a partir do
  // dictCode e devolve tudo isso na resposta. Provado contra o sandbox — um POST
  // só com dictCode/dictCodeType cria o pagamento; já um `beneficiary` PARCIAL
  // (só o nome, que era o que dava pra montar do nosso cadastro) faz a validação
  // exigir a conta inteira e recusar o pagamento. Mandar meio favorecido é pior
  // do que não mandar nenhum: quem confere que a chave é da pessoa certa é o
  // operador, na tela de confirmação, antes do código sair.
  // (input.payeeName/payeeDocument seguem no log mascarado de createPayment.)

  return payload;
}

export interface ProviderPaymentView {
  provider_payment_id: string | null;
  /** Label CRU do provedor (READY_TO_PAY, PAYED, …). A tradução pro nosso enum
   *  é do chamador de propósito: o nosso enum diz onde o DINHEIRO está, não como
   *  o banco chamou o estado, e um label novo do Santander não pode quebrar nada. */
  status: string | null;
  end_to_end_id: string | null;
  transaction_code: string | null;
  tags: string[];
  raw: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function viewOf(raw: unknown): ProviderPaymentView {
  const p = (raw ?? {}) as Record<string, unknown>;
  const tx = (p.transaction ?? {}) as Record<string, unknown>;
  return {
    provider_payment_id: str(p.id) ?? str(p.paymentId),
    status: str(p.status),
    end_to_end_id: str(tx.endToEnd) ?? str(p.endToEnd),
    transaction_code: str(tx.code),
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t)) : [],
    raw,
  };
}

/**
 * POST — cria o pagamento. Devolve READY_TO_PAY e **NÃO move dinheiro**.
 * Sem retry automático: ver CallOpts.retry.
 */
export async function createPayment(input: PixTransferInput): Promise<ProviderPaymentView> {
  const cfg = readConfig();
  const payload = buildPaymentPayload(cfg, input);

  log("info", "pix.create.start", {
    idempotency_key: input.idempotencyKey,
    // O VALOR não vai pro log. É o líquido da folha de uma pessoa identificável
    // (a idempotency_key leva ao entry_id, e dele ao colaborador) — salário em
    // texto plano é exatamente o que o CLAUDE.md proíbe. Quem precisa do valor
    // tem payroll_pix_transfers.amount e o request_payload no banco; o log só
    // precisa provar QUAL pagamento passou por aqui.
    dict_code_type: input.dictCodeType,
    // PII mascarada — é o que o CLAUDE.md exige e o suficiente pra conferir.
    dict_code: maskPixKey(input.dictCode, input.dictCodeType),
    payee: maskName(input.payeeName),
    payee_document: maskDoc(input.payeeDocument),
    environment: cfg.environment,
  });

  const { json } = await call({
    method: "POST",
    url: paymentsUrl(cfg),
    headers: await authHeaders(cfg),
    body: payload,
    timeoutMs: TIMEOUT_POST_MS,
    retry: false,
    label: "POST pix_payments",
  });

  const view = viewOf(json);
  log("info", "pix.create.ok", {
    idempotency_key: input.idempotencyKey,
    provider_payment_id: view.provider_payment_id,
    provider_status: view.status,
  });
  return view;
}

/**
 * PATCH — confirma. É AQUI que o dinheiro anda (READY_TO_PAY → PAYED).
 *
 * O verbo é PATCH porque PUT e DELETE devolvem 502 no sandbox (ADR 0006). O
 * CORPO é a única parte do contrato que não foi provada contra o ambiente real:
 * por isso o valor do status sai de env (SANTANDER_CONFIRM_STATUS) e pode ser
 * sobrescrito por request — descobrir o corpo certo não pode exigir rebuild.
 */
export async function confirmPayment(
  paymentId: string,
  opts: { status?: string; amount?: string } = {},
): Promise<ProviderPaymentView> {
  const cfg = readConfig();
  const body: Record<string, unknown> = {
    status: opts.status ?? (Deno.env.get("SANTANDER_CONFIRM_STATUS") ?? "AUTHORIZED").trim(),
  };
  if (opts.amount) body.paymentValue = opts.amount;

  log("info", "pix.confirm.start", {
    provider_payment_id: paymentId,
    confirm_status: body.status,
    environment: cfg.environment,
  });

  const { json } = await call({
    method: "PATCH",
    url: paymentsUrl(cfg, `/${encodeURIComponent(paymentId)}`),
    headers: await authHeaders(cfg),
    body,
    timeoutMs: TIMEOUT_PATCH_MS,
    retry: false,
    label: "PATCH pix_payments",
  });

  const view = viewOf(json);
  log("info", "pix.confirm.ok", {
    provider_payment_id: view.provider_payment_id ?? paymentId,
    provider_status: view.status,
    has_e2e: view.end_to_end_id !== null,
  });
  return view;
}

/** GET de um pagamento. Único caminho da reconciliação — e o único, junto do
 *  search, que pode repetir à vontade. */
export async function getPayment(paymentId: string): Promise<ProviderPaymentView> {
  const cfg = readConfig();
  const url = paymentsUrl(cfg, `/${encodeURIComponent(paymentId)}`);

  const run = async () => {
    const { json } = await call({
      method: "GET",
      url,
      headers: await authHeaders(cfg),
      timeoutMs: TIMEOUT_GET_MS,
      retry: true,
      label: "GET pix_payments/{id}",
    });
    return viewOf(json);
  };

  try {
    return await run();
  } catch (err) {
    // 401 num GET normalmente é token que venceu entre a checagem e o uso.
    // Repetir CONSULTA é sempre seguro — ao contrário de repetir pagamento.
    if (err instanceof SantanderError && err.providerStatus === 401) {
      invalidateToken();
      log("warn", "token.retry_after_401", { provider_payment_id: paymentId });
      return await run();
    }
    throw err;
  }
}

/** Lista os pagamentos do workspace. Formato de coleção do Santander varia
 *  (array cru, `_content`, `content`…), então aceitamos todos os invólucros
 *  conhecidos em vez de quebrar quando eles mudarem de release. */
function extractList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    for (const key of ["_content", "content", "items", "payments", "data", "results"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
  }
  return [];
}

/** Casa o pagamento com a nossa chave. `tags` é o canal principal;
 *  remittanceInformation é a rede de segurança (a chave vai no fim dela). */
function matchesKey(payment: Record<string, unknown>, key: string): boolean {
  const tags = Array.isArray(payment.tags) ? payment.tags.map((t) => String(t)) : [];
  // key.slice(0,20) é o prefixo que buildPaymentPayload manda na tag (teto de 20
  // do Santander). Casar por ele cobre o caso de a chave completa não ter ido
  // pra tag — a rede principal continua sendo o remittance, com a chave inteira.
  const tagPrefix = key.slice(0, 20);
  if (tags.some((t) => t === key || t === tagPrefix || t.includes(key))) return true;
  const remittance = typeof payment.remittanceInformation === "string"
    ? payment.remittanceInformation
    : "";
  return remittance.includes(key);
}

/**
 * Procura pagamentos por idempotency_key.
 *
 * Existe pro caso 'unknown': o POST deu timeout, não temos o provider_payment_id
 * e mesmo assim precisamos descobrir se o pagamento nasceu no banco.
 *
 * ATENÇÃO: no SANDBOX isso não prova nada — o ambiente é um MOCK, duas chamadas
 * ao GET devolvem ids diferentes e ele não guarda estado. Serve pra provar
 * transporte e formato. Reconciliação de verdade só em produção.
 */
export async function searchByIdempotencyKey(
  key: string,
): Promise<{ matches: ProviderPaymentView[]; scanned: number }> {
  const cfg = readConfig();
  const { json } = await call({
    method: "GET",
    url: paymentsUrl(cfg),
    headers: await authHeaders(cfg),
    timeoutMs: TIMEOUT_GET_MS,
    retry: true,
    label: "GET pix_payments",
  });

  const list = extractList(json);
  const matches = list.filter((p) => matchesKey(p, key)).map(viewOf);
  log("info", "pix.search.done", {
    idempotency_key: key,
    scanned: list.length,
    matches: matches.length,
    environment: cfg.environment,
  });
  return { matches, scanned: list.length };
}
