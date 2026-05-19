// Tipos do payload remoto da API api.softcom.cloud (codinome "agenda").
// Shapes confirmados via OpenAPI em https://api.softcom.cloud/api/docs-json
// (válida em 2026-05-18). IDs são `number` no remoto; convertemos
// pra string ao salvar em `external_id text`.

export interface RemoteEmpresaPdv {
  /** ID estável no remoto (coluna `Registro`). */
  id: number;
  /** Nome do PDV. Pode estar ausente em entradas antigas. */
  nomes?: string;
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  /** UF maiúscula (2 letras). */
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  /** CNPJ sem máscara (14 dígitos). */
  cnpj?: string;
  /** Flag de plano Prime — NÃO é status operacional. */
  primeAtivo?: boolean;
  [extra: string]: unknown;
}

export interface RemoteSetor {
  /** Coluna `Registro` da tabela `Rec_Setores`. */
  id: number;
  /** Já vem em Title Case. */
  nome: string;
  [extra: string]: unknown;
}

export interface RemoteCargo {
  /** Coluna `ID` da tabela `Rec_Funcoes`. */
  id: number;
  nome: string;
  nomeCracha?: string | null;
  /** Texto livre — NÃO é FK pra Rec_Setores. */
  setor?: string | null;
  nivel?: number | null;
  pdv?: string | null;
  /** Salário base de referência da tabela salarial. */
  salarioAtual?: number | null;
  [extra: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colaborador
// ─────────────────────────────────────────────────────────────────────────────

export interface RemoteColaborador {
  id: number;
  nomeSuporte?: string | null;
  nome?: string | null;
  ramalFixo?: string | null;
  ramais?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  sexo?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefones?: string | null;
  telefones2?: string | null;
  email?: string | null;
  cpf?: string | null;
  rg?: string | null;
  rgOrgao?: string | null;
  supervisorId?: number | null;
  empresa?: number | null;
  dataNascimento?: string | null;
  local?: string | null;
  setor?: number | null;
  subsetor?: string | null;
  agenda?: string | null;
  grupoIndicador?: string | null;
  grupoVendas?: string | null;
  etnia?: string | null;
  escolaridade?: string | null;
  tamanhoFarda?: string | null;
  dataAdmissao?: string | null;
  dataDemissao?: string | null;
  inspiraData?: string | null;
  inspiraValor?: number | null;
  cargoId?: number | null;
  salarioAtual?: number | null;
  tipoFuncionario?: string | null;
  cnpjContratado?: string | null;
  empresaContratada?: number | null;
  codigoContador?: number | null;
  pcd?: boolean | null;
  jovemAprendiz?: boolean | null;
  discordId?: string | null;
  usuarioDiscord?: string | null;
  homeoffice?: boolean | null;
  possuiAgenda?: boolean | null;
  pis?: string | null;
  ctps?: string | null;
  ctpsSerie?: string | null;
  ctpsUf?: string | null;
  conta?: string | null;
  contaPix?: string | null;
  comissaoMensal?: number | null;
  comissaoLicenca?: number | null;
  comissaoUpgrade?: number | null;
  comissaoTefInstalacao?: number | null;
  comissaoTefMensal?: number | null;
  gerenteLider?: boolean | null;
  gerenteDiretor?: boolean | null;
  gerenteApoio?: boolean | null;
  padrinho?: boolean | null;
  desativado?: boolean | null;
  [extra: string]: unknown;
}

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
}

export interface PaginatedColaboradores {
  data: RemoteColaborador[];
  pagination: PaginationMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-abas do colaborador
// ─────────────────────────────────────────────────────────────────────────────

export interface RemoteAbsenteismo {
  id: number;
  datas?: string | null;
  dias?: number | null;
  motivo?: string | null;
  observacao?: string | null;
  atestado?: number | null;
  bancoHoras?: number | null;
  [extra: string]: unknown;
}

export interface RemoteAdicional {
  id: number;
  tipo?: string | null;
  descricao?: string | null;
  valores?: number | null;
  desativado?: boolean | null;
  inspiraTipo?: string | null;
  inspiraGrupo?: string | null;
  lancamentoUsuario?: string | null;
  lancamentoDataHora?: string | null;
  [extra: string]: unknown;
}

export interface RemoteAfastamento {
  id: number;
  motivo?: number | null;
  dataInicial?: string | null;
  dataFinal?: string | null;
  descricao?: string | null;
  atestado?: boolean | null;
  lancamentoUsuario?: string | null;
  lancamentoDataHora?: string | null;
  compensado?: number | null;
  idViagem?: number | null;
  [extra: string]: unknown;
}

export interface RemoteDecimoTerceiro {
  id: number;
  datas?: string | null;
  anos?: number | null;
  pago?: string | null;
  valorPago?: number | null;
  observacao?: string | null;
  [extra: string]: unknown;
}

export interface RemoteEmail {
  id: number;
  email: string;
  [extra: string]: unknown;
}

export interface RemoteEstagio {
  id: number;
  dataInicial?: string | null;
  dataFinal?: string | null;
  renovacao?: boolean | null;
  notificacaoEnviada?: boolean | null;
  marcar?: boolean | null;
  [extra: string]: unknown;
}

export interface RemoteEvento {
  id: number;
  datas?: string | null;
  dataEvento?: string | null;
  evento?: string | null;
  funcao?: string | null;
  observacao?: string | null;
  valorPago?: number | null;
  lacrar?: boolean | null;
  [extra: string]: unknown;
}

export interface RemoteExame {
  id: number;
  exameTipo?: string | null;
  dataPrevista?: string | null;
  dataRealizado?: string | null;
  notificacaoEnviada?: boolean | null;
  marcar?: boolean | null;
  [extra: string]: unknown;
}

export interface RemoteFerias {
  id: number;
  datas?: string | null;
  periodoIn?: string | null;
  periodoFn?: string | null;
  dataLimite?: string | null;
  dataPrevista?: string | null;
  periodoInGozo?: string | null;
  periodoFnGozo?: string | null;
  pago?: string | null;
  valorPago?: number | null;
  inspiraNc?: number | null;
  observacao?: string | null;
  [extra: string]: unknown;
}

export interface RemoteParente {
  id: number;
  tipoParente?: string | null;
  nomeParente?: string | null;
  genero?: string | null;
  cpf?: string | null;
  dataNascimento?: string | null;
  [extra: string]: unknown;
}

export interface RemotePdv {
  id: number;
  pdv: string;
  f10?: number | null;
  [extra: string]: unknown;
}

export interface RemotePlano {
  id: number;
  plano?: string | null;
  matriculaPlano?: string | null;
  dataInicio?: string | null;
  tipo?: string | null;
  nomes?: string | null;
  dataNascimento?: string | null;
  cpf?: string | null;
  valorPlano?: number | null;
  obs?: string | null;
  desativado?: boolean | null;
  dataDesativado?: string | null;
  [extra: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento → entidades locais
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compõe endereço único a partir das partes retornadas pela API.
 * Retorna null se nada útil veio.
 */
export function composeAddress(parts: {
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}): string | null {
  const lr = parts.logradouro?.trim();
  const br = parts.bairro?.trim();
  const ct = parts.cidade?.trim();
  const uf = parts.uf?.trim();
  const cep = parts.cep?.trim();
  const cityUf = ct && uf ? `${ct}/${uf}` : (ct || uf || "");
  const segments = [lr, br, cityUf, cep].filter((s) => s && s.length > 0);
  return segments.length ? segments.join(", ") : null;
}

/** Nome amigável quando `nomes` está ausente. */
export function resolveEmpresaName(e: RemoteEmpresaPdv): string {
  return e.nomes?.trim() || e.cidade?.trim() || `PDV ${e.id}`;
}

/** Salário robusto: aceita number, string ou null/undefined. */
export function parseSalary(raw: number | string | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const trimmed = String(raw).trim();
  if (!trimmed) return 0;
  const hasComma = trimmed.includes(",");
  const cleaned = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
