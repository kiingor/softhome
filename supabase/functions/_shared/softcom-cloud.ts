// Cliente HTTP da API legada api.softcom.cloud (codinome "agenda").
//
// Centraliza URL base, autenticação (header `x-api-key`), timeout e
// parsing de erro. As Edge Functions de sync (sync-stores, sync-teams,
// sync-positions) importam apenas as funções list*() daqui.
//
// Secrets esperados (definir via `supabase secrets set`):
//   SOFTCOM_CLOUD_BASE_URL  default https://api.softcom.cloud
//   SOFTCOM_CLOUD_API_KEY   ak_...
//
// Doc oficial: https://api.softcom.cloud/api/docs (OpenAPI em /api/docs-json)

import type {
  PaginatedColaboradores,
  RemoteAbsenteismo,
  RemoteAdicional,
  RemoteAfastamento,
  RemoteCargo,
  RemoteColaborador,
  RemoteDecimoTerceiro,
  RemoteEmail,
  RemoteEmpresaPdv,
  RemoteEstagio,
  RemoteEvento,
  RemoteExame,
  RemoteFerias,
  RemoteParente,
  RemotePdv,
  RemotePlano,
  RemoteSetor,
} from "./softcom-cloud-types.ts";

const DEFAULT_BASE_URL = "https://api.softcom.cloud";
const DEFAULT_TIMEOUT_MS = 15000;

export class SoftcomCloudError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "SoftcomCloudError";
  }
}

interface FetchOptions {
  /** Path absoluto começando com `/v1/...`. */
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
}

function getConfig(): { baseUrl: string; apiKey: string } {
  const apiKey = Deno.env.get("SOFTCOM_CLOUD_API_KEY");
  if (!apiKey) {
    throw new SoftcomCloudError(
      500,
      "Falta env var SOFTCOM_CLOUD_API_KEY",
    );
  }
  const baseUrl =
    (Deno.env.get("SOFTCOM_CLOUD_BASE_URL") ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
  return { baseUrl, apiKey };
}

async function softcomFetch<T>(opts: FetchOptions): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}${opts.path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const resp = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new SoftcomCloudError(
        resp.status,
        `Softcom Cloud HTTP ${resp.status}: ${text.slice(0, 300)}`,
      );
    }
    return (await resp.json()) as T;
  } catch (err) {
    if (err instanceof SoftcomCloudError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new SoftcomCloudError(
        504,
        `Softcom Cloud timeout após ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
      );
    }
    throw new SoftcomCloudError(
      502,
      `Softcom Cloud network error: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints — confirmados no OpenAPI /api/docs-json
// ─────────────────────────────────────────────────────────────────────────────

/** GET /v1/empresas-pdv — lista todos os PDVs (matriz + filiais). */
export async function listEmpresasPdv(): Promise<RemoteEmpresaPdv[]> {
  return await softcomFetch<RemoteEmpresaPdv[]>({ path: "/v1/empresas-pdv" });
}

/** POST /v1/empresas-pdv — cria empresa/PDV. Retorna o criado. */
export async function createEmpresaPdv(
  body: Record<string, unknown>,
): Promise<RemoteEmpresaPdv> {
  return await softcomFetch<RemoteEmpresaPdv>({
    path: "/v1/empresas-pdv",
    method: "POST",
    body,
  });
}

/** PUT /v1/empresas-pdv/{id} — atualiza empresa/PDV. */
export async function updateEmpresaPdv(
  id: number | string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/empresas-pdv/${encodeURIComponent(String(id))}`,
    "PUT",
    body,
  );
}

/** DELETE /v1/empresas-pdv/{id} — remove empresa/PDV. */
export async function deleteEmpresaPdv(id: number | string): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/empresas-pdv/${encodeURIComponent(String(id))}`,
    "DELETE",
  );
}

/** GET /v1/setores — lista global de setores. */
export async function listSetores(): Promise<RemoteSetor[]> {
  return await softcomFetch<RemoteSetor[]>({ path: "/v1/setores" });
}

/** POST /v1/setores — cria setor. */
export async function createSetor(
  body: Record<string, unknown>,
): Promise<RemoteSetor> {
  return await softcomFetch<RemoteSetor>({
    path: "/v1/setores",
    method: "POST",
    body,
  });
}

/** PUT /v1/setores/{id} — atualiza setor. */
export async function updateSetor(
  id: number | string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/setores/${encodeURIComponent(String(id))}`,
    "PUT",
    body,
  );
}

/** DELETE /v1/setores/{id} — remove setor. */
export async function deleteSetor(id: number | string): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/setores/${encodeURIComponent(String(id))}`,
    "DELETE",
  );
}

/** GET /v1/cargos — lista global de cargos. */
export async function listCargos(): Promise<RemoteCargo[]> {
  return await softcomFetch<RemoteCargo[]>({ path: "/v1/cargos" });
}

/** POST /v1/cargos — cria cargo. */
export async function createCargo(
  body: Record<string, unknown>,
): Promise<RemoteCargo> {
  return await softcomFetch<RemoteCargo>({
    path: "/v1/cargos",
    method: "POST",
    body,
  });
}

/** PUT /v1/cargos/{id} — atualiza cargo. */
export async function updateCargo(
  id: number | string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/cargos/${encodeURIComponent(String(id))}`,
    "PUT",
    body,
  );
}

/** DELETE /v1/cargos/{id} — remove cargo. */
export async function deleteCargo(id: number | string): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/cargos/${encodeURIComponent(String(id))}`,
    "DELETE",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Colaboradores — sync (GET) e mutations (POST/PUT)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /v1/colaboradores — paginado. Default pageSize=50. */
export async function listColaboradores(
  opts: { page?: number; pageSize?: number; incluirDesativados?: boolean } = {},
): Promise<PaginatedColaboradores> {
  const qs = new URLSearchParams();
  if (opts.page != null) qs.set("page", String(opts.page));
  if (opts.pageSize != null) qs.set("pageSize", String(opts.pageSize));
  if (opts.incluirDesativados) qs.set("incluirDesativados", "true");
  const query = qs.toString();
  return await softcomFetch<PaginatedColaboradores>({
    path: `/v1/colaboradores${query ? "?" + query : ""}`,
  });
}

/** POST /v1/colaboradores — admite novo colaborador. Retorna o criado. */
export async function createColaborador(
  body: Record<string, unknown>,
): Promise<RemoteColaborador> {
  return await softcomFetch<RemoteColaborador>({
    path: "/v1/colaboradores",
    method: "POST",
    body,
  });
}

/** GET /v1/colaboradores/{id} — busca um colaborador específico. */
export async function getColaborador(
  id: number | string,
): Promise<RemoteColaborador> {
  return await softcomFetch<RemoteColaborador>({
    path: `/v1/colaboradores/${encodeURIComponent(String(id))}`,
  });
}

/**
 * Edição por aba. A API tem rotas separadas pra `identificacao`, `funcionais`,
 * `comissoes`. O nome da aba vira `/v1/colaboradores/{id}/{aba}` com método
 * PUT — comportamento alinhado ao OpenAPI.
 */
export type UpdateSection =
  | "identificacao"
  | "funcionais"
  | "comissoes"
  | "permissoes"
  /** Status do colaborador (ativo, inativo, demitido). Inclui termination_date. */
  | "status"
  /** Flags binárias: is_temp, is_manager_*, is_godfather. */
  | "flags";

export async function updateColaboradorSection(
  id: number | string,
  section: UpdateSection,
  body: Record<string, unknown>,
): Promise<unknown> {
  return await softcomFetch<unknown>({
    path: `/v1/colaboradores/${encodeURIComponent(String(id))}/${section}`,
    method: "POST", // PUT/PATCH conforme contrato — POST cobre na maioria das rotas legadas
    body,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-abas (GET por colaborador) — usadas no sync detalhado
// ─────────────────────────────────────────────────────────────────────────────

export async function listAbsenteismos(collabId: number | string): Promise<RemoteAbsenteismo[]> {
  return await softcomFetch<RemoteAbsenteismo[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/absenteismos`,
  });
}

export async function listAdicionais(collabId: number | string): Promise<RemoteAdicional[]> {
  return await softcomFetch<RemoteAdicional[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/adicionais`,
  });
}

export async function listAfastamentos(collabId: number | string): Promise<RemoteAfastamento[]> {
  return await softcomFetch<RemoteAfastamento[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/afastamentos`,
  });
}

export async function listDecimoTerceiro(collabId: number | string): Promise<RemoteDecimoTerceiro[]> {
  return await softcomFetch<RemoteDecimoTerceiro[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/decimo-terceiro`,
  });
}

export async function listEmails(collabId: number | string): Promise<RemoteEmail[]> {
  return await softcomFetch<RemoteEmail[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/emails`,
  });
}

export async function listEstagios(collabId: number | string): Promise<RemoteEstagio[]> {
  return await softcomFetch<RemoteEstagio[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/estagios`,
  });
}

export async function listEventos(collabId: number | string): Promise<RemoteEvento[]> {
  return await softcomFetch<RemoteEvento[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/eventos`,
  });
}

export async function listExames(collabId: number | string): Promise<RemoteExame[]> {
  return await softcomFetch<RemoteExame[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/exames`,
  });
}

export async function listFerias(collabId: number | string): Promise<RemoteFerias[]> {
  return await softcomFetch<RemoteFerias[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/ferias`,
  });
}

export async function listParentes(collabId: number | string): Promise<RemoteParente[]> {
  return await softcomFetch<RemoteParente[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/parentes`,
  });
}

export async function listPdvs(collabId: number | string): Promise<RemotePdv[]> {
  return await softcomFetch<RemotePdv[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/pdvs`,
  });
}

export async function listPlanos(collabId: number | string): Promise<RemotePlano[]> {
  return await softcomFetch<RemotePlano[]>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/planos`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD genérico de sub-recursos do colaborador
// kind ∈ {absenteismos, afastamentos, decimo-terceiro, ferias, planos, pdvs,
//         eventos, exames, parentes, emails, estagios, adicionais}
// ─────────────────────────────────────────────────────────────────────────────

export type SubResourceKind =
  | "absenteismos"
  | "afastamentos"
  | "decimo-terceiro"
  | "ferias"
  | "planos"
  | "pdvs"
  | "eventos"
  | "exames"
  | "parentes"
  | "emails"
  | "estagios"
  | "adicionais";

export async function createSubResource(
  kind: SubResourceKind,
  collabId: number | string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return await softcomFetch<unknown>({
    path: `/v1/colaboradores/${encodeURIComponent(String(collabId))}/${kind}`,
    method: "POST",
    body,
  });
}

/**
 * UPDATE de um item. A API usa PUT em
 * `/v1/colaboradores/{id}/{kind}/{itemId}`. Como nosso wrapper só tem GET/POST,
 * fazemos via fetch direto.
 */
export async function updateSubResource(
  kind: SubResourceKind,
  collabId: number | string,
  itemId: number | string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/colaboradores/${encodeURIComponent(String(collabId))}/${kind}/${encodeURIComponent(String(itemId))}`,
    "PUT",
    body,
  );
}

export async function deleteSubResource(
  kind: SubResourceKind,
  collabId: number | string,
  itemId: number | string,
): Promise<unknown> {
  return await softcomDirectFetch(
    `/v1/colaboradores/${encodeURIComponent(String(collabId))}/${kind}/${encodeURIComponent(String(itemId))}`,
    "DELETE",
  );
}

/**
 * fetch direto que aceita PUT/DELETE (o softcomFetch interno só tinha GET/POST).
 * Mesma config de auth/timeout.
 */
async function softcomDirectFetch(
  path: string,
  method: "PUT" | "DELETE",
  body?: unknown,
): Promise<unknown> {
  const apiKey = Deno.env.get("SOFTCOM_CLOUD_API_KEY");
  if (!apiKey) {
    throw new SoftcomCloudError(500, "Falta env SOFTCOM_CLOUD_API_KEY");
  }
  const baseUrl =
    (Deno.env.get("SOFTCOM_CLOUD_BASE_URL") ?? "https://api.softcom.cloud").replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new SoftcomCloudError(
        resp.status,
        `Softcom Cloud HTTP ${resp.status}: ${text.slice(0, 300)}`,
      );
    }
    // DELETE pode retornar 204 sem body
    if (resp.status === 204) return null;
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}
