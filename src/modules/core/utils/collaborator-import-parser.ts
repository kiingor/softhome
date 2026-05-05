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
 * Aceita as variações comuns de planilha e devolve YYYY-MM-DD.
 * Se não conseguir interpretar, retorna a string original (validador vai sinalizar).
 */
export const normalizeDate = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  // Já em YYYY-MM-DD ou YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY (BR)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YY (interpreta YY 00-69 como 20YY, 70-99 como 19YY)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) {
    const [, d, mo, yy] = m;
    const yyN = parseInt(yy, 10);
    const y = yyN < 70 ? 2000 + yyN : 1900 + yyN;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // ISO com hora (toISOString do Excel cellDates) — pega só a parte da data
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
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
