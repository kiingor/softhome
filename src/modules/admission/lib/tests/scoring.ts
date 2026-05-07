// Pontuação automática dos testes. Cada engine retorna `score` 0-100 e
// `summary` com agregados específicos do teste.

import type {
  Answers,
  AutoScoreResult,
  TestDefinition,
  Question,
  LikertQuestion,
} from "./types";

export function scoreTest(test: TestDefinition, answers: Answers): AutoScoreResult {
  switch (test.scoring) {
    case "auto_multiple_choice":
      return scoreMultipleChoice(test.questions, answers);
    case "open_review":
      return scoreOpenReview(test.questions, answers);
    case "disc":
      return scoreDISC(test.questions, answers);
    case "bigfive":
      return scoreBigFive(test.questions as LikertQuestion[], answers);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Múltipla escolha pura
// ─────────────────────────────────────────────────────────────────────────────

function scoreMultipleChoice(questions: Question[], answers: Answers): AutoScoreResult {
  let total = 0;
  let correct = 0;
  for (const q of questions) {
    if (q.type !== "single_choice") continue;
    total++;
    const ans = answers[q.id];
    if (ans?.type === "single_choice" && ans.key === q.correctKey) correct++;
  }
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return {
    score,
    summary: { correct, total },
    needsReview: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Múltipla escolha + abertas (RH avalia depois)
// Score parcial só das objetivas; needsReview=true se houver abertas.
// ─────────────────────────────────────────────────────────────────────────────

function scoreOpenReview(questions: Question[], answers: Answers): AutoScoreResult {
  let total = 0;
  let correct = 0;
  let openCount = 0;
  let openAnswered = 0;
  for (const q of questions) {
    if (q.type === "single_choice") {
      total++;
      const ans = answers[q.id];
      if (ans?.type === "single_choice" && ans.key === q.correctKey) correct++;
    } else if (q.type === "open_text") {
      openCount++;
      const ans = answers[q.id];
      if (ans?.type === "open_text" && ans.text.trim().length > 0) openAnswered++;
    }
  }
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return {
    score,
    summary: {
      objective: { correct, total },
      open: { answered: openAnswered, total: openCount },
    },
    needsReview: openCount > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISC: conta D/I/S/C, identifica perfil dominante e secundário
// ─────────────────────────────────────────────────────────────────────────────

function scoreDISC(questions: Question[], answers: Answers): AutoScoreResult {
  const counts: Record<"D" | "I" | "S" | "C", number> = { D: 0, I: 0, S: 0, C: 0 };
  let total = 0;
  for (const q of questions) {
    if (q.type !== "disc_word") continue;
    total++;
    const ans = answers[q.id];
    if (ans?.type === "disc_word") {
      counts[ans.factor]++;
    }
  }
  const sorted = (Object.keys(counts) as Array<"D" | "I" | "S" | "C">).sort(
    (a, b) => counts[b] - counts[a],
  );
  const dominant = sorted[0];
  const secondary = sorted[1];

  // Score = % do fator dominante (0-100). Útil pra ranking se quiser.
  const score = total === 0 ? 0 : Math.round((counts[dominant] / total) * 100);

  return {
    score,
    summary: {
      counts,
      dominant,
      secondary,
      profile: `${dominant}/${secondary}`,
    },
    needsReview: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BigFive: média Likert por traço, normalizado pra 0-100. Itens reverse
// invertem (5 vira 1, 4 vira 2, 3 mantém, 2 vira 4, 1 vira 5).
// ─────────────────────────────────────────────────────────────────────────────

function scoreBigFive(questions: LikertQuestion[], answers: Answers): AutoScoreResult {
  const traits: Array<"O" | "C" | "E" | "A" | "N"> = ["O", "C", "E", "A", "N"];
  const sums: Record<string, { total: number; count: number }> = {};
  for (const t of traits) sums[t] = { total: 0, count: 0 };

  for (const q of questions) {
    const ans = answers[q.id];
    if (ans?.type !== "likert_5") continue;
    const value = q.reversed ? 6 - ans.value : ans.value;
    sums[q.trait].total += value;
    sums[q.trait].count++;
  }

  const traitScores: Record<string, number> = {};
  for (const t of traits) {
    const { total, count } = sums[t];
    // média 1-5 → normaliza pra 0-100: ((avg - 1) / 4) * 100
    const avg = count === 0 ? 0 : total / count;
    traitScores[t] = Math.round(((avg - 1) / 4) * 100);
  }

  // "Score" geral = média dos 5 traços, mas isso não tem significado
  // psicométrico real. Usamos só pra UI mostrar algum número.
  const avgScore = Math.round(
    (traitScores.O + traitScores.C + traitScores.E + traitScores.A + traitScores.N) / 5,
  );

  return {
    score: avgScore,
    summary: {
      traits: {
        openness: traitScores.O,
        conscientiousness: traitScores.C,
        extraversion: traitScores.E,
        agreeableness: traitScores.A,
        neuroticism: traitScores.N,
      },
    },
    needsReview: false,
  };
}
