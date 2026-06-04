// Tipos da tela Feedback Colaborador (Guardião da Cultura).
// Espelham os DTOs da API legada api.softcom.cloud (camelCase, como chegam).

export type FeedbackStatus = "Pendente" | "Em dia" | "Em Atraso";

/** Um colaborador no painel `/v1/feedbacks`. */
export interface FeedbackColaborador {
  id: number;
  nome: string | null;
  feedbacks: number;
  dataUltimoFeedback: string | null;
  status: FeedbackStatus;
}

/** KPIs agregados do painel (respeitam o filtro de Guardião). */
export interface FeedbacksTotais {
  colaboradores: number;
  pendente: number;
  emDia: number;
  emAtraso: number;
  feedbacks: number;
}

export interface FeedbacksResponse {
  totais: FeedbacksTotais;
  colaboradores: FeedbackColaborador[];
}

/** Resultado do typeahead `/v1/busca-colaborador`. */
export interface BuscaColaborador {
  id: number;
  nomeSuporte: string | null;
  nome: string | null;
  telefones: string | null;
  telefones2: string | null;
  email: string | null;
  setor: string | null;
  desativado: boolean | null;
}

/** Um objetivo/feedback de um colaborador. */
export interface Objetivo {
  id: number;
  tipo: string | null;
  datas: string | null;
  comentario: string | null;
  mostrarSuporte: boolean;
  lancamentoUsuarioId: number;
  lancamentoDatas: string | null;
}

/** Guardião(ã) da Cultura selecionado — quem lança os feedbacks. */
export interface Guardiao {
  id: number;
  nome: string;
}

/**
 * Opções fixas do Select de tipo no form. O legado guarda `Tipo` como texto
 * livre; o RH só lança "Comentário" ou "Objetivo". Se a agenda esperar
 * "Comentario" sem acento, basta trocar o `value` aqui (o label permanece).
 */
export const OBJETIVO_TIPOS = [
  { value: "Comentário", label: "Comentário" },
  { value: "Objetivo", label: "Objetivo" },
] as const;

/** Ordem das colunas: ação primeiro, saudável por último. */
export const FEEDBACK_STATUS_ORDER: FeedbackStatus[] = [
  "Pendente",
  "Em Atraso",
  "Em dia",
];

/** Aparência por status (cores via Tailwind). */
export const FEEDBACK_STATUS_META: Record<
  FeedbackStatus,
  { label: string; description: string; dotClass: string; headerClass: string; countClass: string }
> = {
  Pendente: {
    label: "Pendente",
    description: "Nunca recebeu feedback",
    dotClass: "bg-amber-500",
    headerClass: "text-amber-700 dark:text-amber-400",
    countClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  "Em Atraso": {
    label: "Em atraso",
    description: "Último feedback há mais de 120 dias",
    dotClass: "bg-rose-500",
    headerClass: "text-rose-700 dark:text-rose-400",
    countClass: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  "Em dia": {
    label: "Em dia",
    description: "Feedback nos últimos 120 dias",
    dotClass: "bg-emerald-500",
    headerClass: "text-emerald-700 dark:text-emerald-400",
    countClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
};
