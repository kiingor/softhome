import type { TestDefinition } from "./types";
import { bigfive50Test } from "./bigfive_50";

// BFI-30: subset curado da BFI-50, mantendo 6 itens por traço (3 forward
// + 3 reverse). Equilibra precisão com velocidade (~6 minutos).
const SHORT_IDS = new Set([
  // E: q1+, q6-, q11+, q16-, q21+, q26-
  "q1", "q6", "q11", "q16", "q21", "q26",
  // A: q2-, q7+, q12-, q17+, q22-, q27+
  "q2", "q7", "q12", "q17", "q22", "q27",
  // C: q3+, q8-, q13+, q18-, q23+, q28-
  "q3", "q8", "q13", "q18", "q23", "q28",
  // N: q4+, q9-, q14+, q19+, q24-, q29+
  "q4", "q9", "q14", "q19", "q24", "q29",
  // O: q5+, q10-, q15+, q20-, q25+, q30-
  "q5", "q10", "q15", "q20", "q25", "q30",
]);

export const bigfive30Test: TestDefinition = {
  slug: "bigfive_30",
  scoring: "bigfive",
  estimatedMinutes: 7,
  intro:
    "Versão rápida do BigFive — 30 afirmações em ~6 minutos. Mede os 5 " +
    "grandes traços de personalidade. Responda com sinceridade. 🌟",
  questions: bigfive50Test.questions.filter((q) => SHORT_IDS.has(q.id)),
};
