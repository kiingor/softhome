import type { TestDefinition, LikertQuestion } from "./types";

// IPIP BFI-50 — versão padrão do BigFive (Goldberg).
// 50 itens, 10 por traço (OCEAN), Likert 1-5.
// Tradução adaptada pra português brasileiro.
//
// Cada item tem `trait` (O/C/E/A/N) e `reversed` (se true, na pontuação
// inverte: 5 vira 1, 4 vira 2, etc).

const Q = (
  id: string,
  prompt: string,
  trait: LikertQuestion["trait"],
  reversed = false,
): LikertQuestion => ({ id, type: "likert_5", prompt, trait, reversed });

export const bigfive50Test: TestDefinition = {
  slug: "bigfive_50",
  scoring: "bigfive",
  estimatedMinutes: 15,
  intro:
    "Teste de personalidade BigFive — os 5 grandes traços (Abertura, " +
    "Conscienciosidade, Extroversão, Amabilidade, Estabilidade Emocional). " +
    'São 50 afirmações; pra cada uma escolha "Discordo Totalmente" até ' +
    '"Concordo Totalmente". Sem pressa, responda com sinceridade. 🌟',
  questions: [
    // Extraversion (E) — 10 itens
    Q("q1", "Sou o centro das atenções em festas.", "E", false),
    Q("q6", "Falo pouco.", "E", true),
    Q("q11", "Sinto-me confortável perto de pessoas.", "E", false),
    Q("q16", "Mantenho-me em segundo plano.", "E", true),
    Q("q21", "Inicio conversas com facilidade.", "E", false),
    Q("q26", "Tenho pouca conversa.", "E", true),
    Q("q31", "Falo com várias pessoas diferentes em festas.", "E", false),
    Q("q36", "Não gosto de chamar atenção pra mim.", "E", true),
    Q("q41", "Não me importo em ser o centro das atenções.", "E", false),
    Q("q46", "Sou quieto perto de estranhos.", "E", true),

    // Agreeableness (A) — 10 itens
    Q("q2", "Sinto pouco interesse pelos outros.", "A", true),
    Q("q7", "Tenho interesse por outras pessoas.", "A", false),
    Q("q12", "Insulto as pessoas.", "A", true),
    Q("q17", "Sinto a dor dos outros.", "A", false),
    Q("q22", "Não me interesso pelos problemas dos outros.", "A", true),
    Q("q27", "Tenho um coração mole.", "A", false),
    Q("q32", "Não me interesso de verdade pelos outros.", "A", true),
    Q("q37", "Tiro um tempo pra ajudar os outros.", "A", false),
    Q("q42", "Sinto as emoções dos outros.", "A", false),
    Q("q47", "Faço as pessoas se sentirem à vontade.", "A", false),

    // Conscientiousness (C) — 10 itens
    Q("q3", "Estou sempre preparado.", "C", false),
    Q("q8", "Deixo as minhas coisas espalhadas.", "C", true),
    Q("q13", "Presto atenção aos detalhes.", "C", false),
    Q("q18", "Faço bagunça com as coisas.", "C", true),
    Q("q23", "Faço as tarefas imediatamente.", "C", false),
    Q("q28", "Frequentemente me esqueço de devolver as coisas no lugar.", "C", true),
    Q("q33", "Gosto de ordem.", "C", false),
    Q("q38", "Fujo das minhas obrigações.", "C", true),
    Q("q43", "Sigo um cronograma.", "C", false),
    Q("q48", "Sou exigente no meu trabalho.", "C", false),

    // Neuroticism (N) — 10 itens (forward = mais neurótico)
    Q("q4", "Estresso-me com facilidade.", "N", false),
    Q("q9", "Estou relaxado a maior parte do tempo.", "N", true),
    Q("q14", "Preocupo-me com as coisas.", "N", false),
    Q("q19", "Mudo de humor com frequência.", "N", false),
    Q("q24", "Raramente fico triste.", "N", true),
    Q("q29", "Fico facilmente irritado.", "N", false),
    Q("q34", "Tenho frequentes mudanças de humor.", "N", false),
    Q("q39", "Fico aborrecido facilmente.", "N", false),
    Q("q44", "Sinto-me seguro.", "N", true),
    Q("q49", "Sinto-me deprimido com frequência.", "N", false),

    // Openness (O) — 10 itens
    Q("q5", "Tenho um vocabulário rico.", "O", false),
    Q("q10", "Tenho dificuldade em compreender ideias abstratas.", "O", true),
    Q("q15", "Tenho uma imaginação fértil.", "O", false),
    Q("q20", "Não tenho interesse em ideias abstratas.", "O", true),
    Q("q25", "Tenho ideias excelentes.", "O", false),
    Q("q30", "Não tenho uma boa imaginação.", "O", true),
    Q("q35", "Compreendo as coisas rapidamente.", "O", false),
    Q("q40", "Uso palavras difíceis.", "O", false),
    Q("q45", "Reflito sobre as coisas a fundo.", "O", false),
    Q("q50", "Estou cheio de ideias.", "O", false),
  ],
};
