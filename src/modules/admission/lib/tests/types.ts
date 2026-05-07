// Tipos compartilhados pro catálogo de testes da admissão (stage 1).
//
// O conteúdo das perguntas vive em código (versionado, type-safe). O
// banco só armazena qual teste está ativo, suas configs (tempo/pausa)
// e as respostas/score do candidato.

export type TestSlug =
  | "logica"
  | "informatica"
  | "disc"
  | "bigfive_30"
  | "bigfive_50"
  | "bigfive_120";

/** Engine de pontuação. */
export type ScoringEngine =
  | "auto_multiple_choice"  // soma acertos / total
  | "open_review"           // RH avalia depois (perguntas abertas no fim)
  | "disc"                  // soma D/I/S/C, identifica perfil dominante
  | "bigfive";              // 5 traços OCEAN, alguns invertidos

export type QuestionType =
  | "single_choice"
  | "open_text"
  | "disc_word"             // 4 palavras → escolhe 1 (cada uma mapeia a D/I/S/C)
  | "likert_5";             // 1=Discordo Totalmente ... 5=Concordo Totalmente

export interface SingleChoiceQuestion {
  id: string;
  type: "single_choice";
  prompt: string;
  options: Array<{ key: string; label: string }>;
  correctKey?: string;       // só usado se autoGrade=true
}

export interface OpenTextQuestion {
  id: string;
  type: "open_text";
  prompt: string;
  suggestedAnswer?: string;  // mostra ao RH na hora de avaliar
}

export interface DiscWordQuestion {
  id: string;
  type: "disc_word";
  prompt: string;            // "Qual palavra melhor te descreve?"
  options: Array<{ word: string; factor: "D" | "I" | "S" | "C" }>;
}

export interface LikertQuestion {
  id: string;
  type: "likert_5";
  prompt: string;
  trait: "O" | "C" | "E" | "A" | "N";  // OCEAN
  reversed: boolean;         // se true, 5 vira 1, 4 vira 2, etc
  facet?: string;            // pra IPIP-NEO-120 (ex: "Anxiety", "Trust")
}

export type Question =
  | SingleChoiceQuestion
  | OpenTextQuestion
  | DiscWordQuestion
  | LikertQuestion;

export interface TestDefinition {
  slug: TestSlug;
  scoring: ScoringEngine;
  questions: Question[];
  /** Texto de boas-vindas exibido antes de iniciar. */
  intro: string;
  /** Total estimado em minutos pra UI exibir antes de iniciar. */
  estimatedMinutes: number;
}

export type Answer =
  | { type: "single_choice"; key: string }
  | { type: "open_text"; text: string }
  | { type: "disc_word"; factor: "D" | "I" | "S" | "C" }
  | { type: "likert_5"; value: 1 | 2 | 3 | 4 | 5 };

export type Answers = Record<string, Answer>;

export interface AutoScoreResult {
  /** Pontuação automática 0–100. */
  score: number;
  /** Detalhes por teste (perfil DISC, traços BigFive, etc). */
  summary: Record<string, unknown>;
  /** Se true, ainda tem perguntas abertas pra RH avaliar. */
  needsReview: boolean;
}
