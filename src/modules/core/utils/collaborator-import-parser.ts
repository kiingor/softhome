import * as XLSX from "xlsx";

export type RawRow = Record<string, string | null>;

export type Regime = "clt" | "pj" | "estagiario";

export type ImportRow = {
  // Identidade
  name: string;
  cpf: string;
  rg: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;

  // Endereço
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;

  // Vínculo
  admission_date: string | null;
  regime: Regime;
  position_id: string | null;
  team_id: string | null;
  store_id: string | null;
  contracted_store_id: string | null;

  // Nomes brutos vindos do arquivo (pra exibir warning quando não bateu)
  raw_position_name: string | null;
  raw_team_name: string | null;
  raw_store_name: string | null;
  raw_contracted_store_name: string | null;

  // Flags
  is_pcd: boolean;
  is_apprentice: boolean;
  is_temp: boolean;

  notes: string | null;

  // Benefícios atribuídos via toolbar/drawer
  benefit_ids: string[];
};

export type Lookups = {
  positions: { id: string; name: string; salary: number }[];
  teams: { id: string; name: string }[];
  stores: { id: string; store_name: string }[];
};

/**
 * Normaliza pra comparação de nomes (Setor / Cargo / Loja):
 * - Remove acentos (Implementação ↔ Implementacao)
 * - Colapsa whitespace interno e tira whitespace de borda (incluindo \n, \t, NBSP)
 * - Lowercase
 */
export const normalizeName = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const parseBool = (v: string | null | undefined): boolean => {
  if (!v) return false;
  const n = normalizeName(v);
  return ["sim", "s", "true", "1", "yes", "y"].includes(n);
};

const trimOrNull = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

/**
 * Excel costuma armazenar CPF como número e descartar o zero à esquerda.
 * Esse helper pega só os dígitos e, se tiver 9, 10 ou 11 dígitos, pad pra 11.
 * (CPF tem 11; números com 9 ou 10 dígitos significam 1 ou 2 zeros perdidos.)
 */
export const normalizeCPF = (v: string | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const digits = String(v).replace(/\D/g, "");
  if (digits.length >= 9 && digits.length <= 11) return digits.padStart(11, "0");
  return digits;
};

/**
 * Verifica se y/m/d formam uma data real (sem rollover do Date).
 * Ex: 2020-02-31 → false; 2020-13-01 → false.
 */
const isRealDate = (y: number, mo: number, d: number): boolean => {
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
};

const fmt = (y: number, mo: number, d: number): string =>
  `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Resolve uma data formada por (y, a, b) tentando as duas ordens (a=mês,b=dia)
 * e (a=dia,b=mês). Retorna a string YYYY-MM-DD se exatamente uma for válida,
 * ou null se ambas forem ambíguas ou nenhuma servir.
 */
const tryResolveYMD = (y: number, a: number, b: number): string | null => {
  const asMD = isRealDate(y, a, b); // a=mês, b=dia
  const asDM = isRealDate(y, b, a); // a=dia, b=mês
  if (asMD && asDM) {
    // Ambíguo só se a !== b. Quando iguais, qualquer ordem dá o mesmo resultado.
    if (a === b) return fmt(y, a, b);
    return null;
  }
  if (asMD) return fmt(y, a, b);
  if (asDM) return fmt(y, b, a);
  return null;
};

/**
 * Aceita as variações comuns de planilha e devolve YYYY-MM-DD.
 * Detecta dia/mês trocados quando uma das interpretações é impossível.
 * Retorna a string original quando não consegue reconhecer nenhum padrão
 * (validador sinaliza como erro).
 */
export const normalizeDate = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  // ISO com hora (toISOString do Excel cellDates) — pega só a parte da data
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (isRealDate(y, mo, d)) return fmt(y, mo, d);
    return s;
  }

  // YYYY-MM-DD / YYYY/MM/DD — pode vir com mês/dia trocados de alguma origem
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const a = parseInt(m[2], 10);
    const b = parseInt(m[3], 10);
    return tryResolveYMD(y, a, b) ?? s;
  }

  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY (BR) — também tenta MM/DD se DD inválido
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    // Convencional BR: a=dia, b=mês
    if (isRealDate(y, b, a)) return fmt(y, b, a);
    // Se inválido, tenta MM/DD (US) — só aceita se realmente fizer sentido
    if (isRealDate(y, a, b)) return fmt(y, a, b);
    return s;
  }

  // DD/MM/YY (YY 00-69 → 20YY, 70-99 → 19YY)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const yy = parseInt(m[3], 10);
    const y = yy < 70 ? 2000 + yy : 1900 + yy;
    if (isRealDate(y, b, a)) return fmt(y, b, a);
    if (isRealDate(y, a, b)) return fmt(y, a, b);
    return s;
  }

  return s;
};

const parseRegime = (v: string | null | undefined): Regime => {
  const n = normalizeName(v);
  if (n === "pj") return "pj";
  if (n === "estagiario" || n === "estagiário") return "estagiario";
  return "clt";
};

export async function parseCollaboratorXlsx(file: File): Promise<RawRow[]> {
  const data = await file.arrayBuffer();
  // cellDates: deixa o xlsx interpretar células de data e formatar conforme cell format.
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheet =
    wb.Sheets["Colaboradores"] ?? wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
    dateNF: "yyyy-mm-dd",
  }) as RawRow[];
}

const COLUMN = {
  name: ["Nome*", "Nome"],
  cpf: ["CPF*", "CPF"],
  rg: ["RG"],
  email: ["Email", "E-mail"],
  phone: ["Telefone"],
  birth_date: ["Data de nascimento"],
  address: ["Endereço", "Endereco"],
  district: ["Bairro"],
  city: ["Cidade"],
  state: ["UF", "Estado"],
  postal_code: ["CEP"],
  admission_date: ["Data de admissão", "Data de admissao"],
  regime: ["Regime"],
  position: ["Cargo"],
  team: ["Setor"],
  store: ["Loja onde trabalha"],
  contracted_store: ["Loja contratante"],
  pcd: ["PCD"],
  apprentice: ["Aprendiz"],
  temp: ["Avulso"],
  notes: ["Observações", "Observacoes"],
} as const;

const pick = (row: RawRow, keys: readonly string[]): string | null => {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return null;
};

export function mapRowToImportRow(raw: RawRow, lookups: Lookups): ImportRow {
  const positionName = pick(raw, COLUMN.position);
  const teamName = pick(raw, COLUMN.team);
  const storeName = pick(raw, COLUMN.store);
  const contractedName = pick(raw, COLUMN.contracted_store);

  const positionsByName = new Map(
    lookups.positions.map((p) => [normalizeName(p.name), p]),
  );
  const teamsByName = new Map(
    lookups.teams.map((t) => [normalizeName(t.name), t]),
  );
  const storesByName = new Map(
    lookups.stores.map((s) => [normalizeName(s.store_name), s]),
  );

  const matchedPosition = positionName
    ? positionsByName.get(normalizeName(positionName))
    : undefined;
  const matchedTeam = teamName
    ? teamsByName.get(normalizeName(teamName))
    : undefined;
  const matchedStore = storeName
    ? storesByName.get(normalizeName(storeName))
    : undefined;
  const matchedContracted = contractedName
    ? storesByName.get(normalizeName(contractedName))
    : undefined;

  return {
    name: trimOrNull(pick(raw, COLUMN.name)) ?? "",
    cpf: normalizeCPF(pick(raw, COLUMN.cpf)),
    rg: trimOrNull(pick(raw, COLUMN.rg)),
    email: trimOrNull(pick(raw, COLUMN.email)),
    phone: trimOrNull(pick(raw, COLUMN.phone)),
    birth_date: normalizeDate(pick(raw, COLUMN.birth_date)),
    address: trimOrNull(pick(raw, COLUMN.address)),
    district: trimOrNull(pick(raw, COLUMN.district)),
    city: trimOrNull(pick(raw, COLUMN.city)),
    state: trimOrNull(pick(raw, COLUMN.state)),
    postal_code: trimOrNull(pick(raw, COLUMN.postal_code)),
    admission_date: normalizeDate(pick(raw, COLUMN.admission_date)),
    regime: parseRegime(pick(raw, COLUMN.regime)),

    position_id: matchedPosition?.id ?? null,
    team_id: matchedTeam?.id ?? null,
    store_id: matchedStore?.id ?? null,
    contracted_store_id: matchedContracted?.id ?? null,

    raw_position_name: positionName,
    raw_team_name: teamName,
    raw_store_name: storeName,
    raw_contracted_store_name: contractedName,

    is_pcd: parseBool(pick(raw, COLUMN.pcd)),
    is_apprentice: parseBool(pick(raw, COLUMN.apprentice)),
    is_temp: parseBool(pick(raw, COLUMN.temp)),

    notes: trimOrNull(pick(raw, COLUMN.notes)),

    benefit_ids: [],
  };
}

export function isRowEmpty(raw: RawRow): boolean {
  return Object.values(raw).every(
    (v) => v === null || v === undefined || String(v).trim() === "",
  );
}
