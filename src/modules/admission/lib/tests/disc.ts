import type { TestDefinition, DiscWordQuestion } from "./types";

// 40 perguntas DISC. Cada uma tem 4 palavras mapeadas a D / I / S / C.
// Conteúdo importado do material da Mr.Coach (D:/TestesRH/Perfil
// Comportamental/teste-disc.md).
const Q = (
  id: string,
  ...words: Array<[string, "D" | "I" | "S" | "C"]>
): DiscWordQuestion => ({
  id,
  type: "disc_word",
  prompt: "Qual palavra melhor te descreve?",
  options: words.map(([word, factor]) => ({ word, factor })),
});

export const discTest: TestDefinition = {
  slug: "disc",
  scoring: "disc",
  estimatedMinutes: 12,
  intro:
    "Esse teste mapeia seu perfil comportamental nos 4 fatores DISC: " +
    "Dominância, Influência, Estabilidade e Conformidade. Não tem certo ou " +
    "errado — escolha a palavra que mais combina com você. ✨",
  questions: [
    Q("q1", ["Decidido", "D"], ["Entusiasta", "I"], ["Preciso", "C"], ["Paciente", "S"]),
    Q("q2", ["Persuasivo", "I"], ["Receptivo", "S"], ["Competitivo", "D"], ["Lógico", "C"]),
    Q("q3", ["Previsível", "S"], ["Otimista", "I"], ["Direto", "D"], ["Disciplinado", "C"]),
    Q("q4", ["Cooperativo", "S"], ["Comunicativo", "I"], ["Ousado", "D"], ["Cuidadoso", "C"]),
    Q("q5", ["Sociável", "I"], ["Analítico", "C"], ["Independente", "D"], ["Amigável", "S"]),
    Q("q6", ["Expressivo", "I"], ["Moderado", "S"], ["Autoconfiante", "D"], ["Perfeccionista", "C"]),
    Q("q7", ["Sistemático", "C"], ["Inspirador", "I"], ["Apoiador", "S"], ["Resultadista", "D"]),
    Q("q8", ["Detalhista", "C"], ["Energético", "D"], ["Constante", "S"], ["Convincente", "I"]),
    Q("q9", ["Leal", "S"], ["Metódico", "C"], ["Corajoso", "D"], ["Popular", "I"]),
    Q("q10", ["Assertivo", "D"], ["Animado", "I"], ["Organizado", "C"], ["Diplomático", "S"]),
    Q("q11", ["Persistente", "D"], ["Tranquilo", "S"], ["Estimulante", "I"], ["Investigativo", "C"]),
    Q("q12", ["Rigoroso", "C"], ["Influente", "I"], ["Pioneiro", "D"], ["Conciliador", "S"]),
    Q("q13", ["Pragmático", "D"], ["Tolerante", "S"], ["Cativante", "I"], ["Objetivo", "C"]),
    Q("q14", ["Atencioso", "S"], ["Eloquente", "I"], ["Firme", "D"], ["Estruturado", "C"]),
    Q("q15", ["Estável", "S"], ["Magnético", "I"], ["Criterioso", "C"], ["Impetuoso", "D"]),
    Q("q16", ["Descontraído", "I"], ["Resoluto", "D"], ["Confiável", "S"], ["Racional", "C"]),
    Q("q17", ["Relacional", "I"], ["Exato", "C"], ["Ouvinte", "S"], ["Impulsionador", "D"]),
    Q("q18", ["Prudente", "C"], ["Criativo", "I"], ["Pacifista", "S"], ["Empreendedor", "D"]),
    Q("q19", ["Proativo", "D"], ["Caloroso", "I"], ["Equilibrado", "S"], ["Perceptivo", "C"]),
    Q("q20", ["Extrovertido", "I"], ["Técnico", "C"], ["Gentil", "S"], ["Destemido", "D"]),
    Q("q21", ["Eficiente", "D"], ["Charmoso", "I"], ["Factual", "C"], ["Harmônico", "S"]),
    Q("q22", ["Vibrante", "I"], ["Seguro", "S"], ["Rápido", "D"], ["Perspicaz", "C"]),
    Q("q23", ["Sereno", "S"], ["Formal", "C"], ["Motivador", "D"], ["Amigável", "I"]),
    Q("q24", ["Coerente", "C"], ["Ambicioso", "D"], ["Compreensivo", "S"], ["Espontâneo", "I"]),
    Q("q25", ["Participativo", "I"], ["Observador", "C"], ["Vigoroso", "D"], ["Zeloso", "S"]),
    Q("q26", ["Aglutinador", "I"], ["Discreto", "S"], ["Vigilante", "C"], ["Incisivo", "D"]),
    Q("q27", ["Focado", "D"], ["Dedicado", "S"], ["Sério", "C"], ["Afável", "I"]),
    Q("q28", ["Envolvente", "I"], ["Autônomo", "D"], ["Resiliente", "S"], ["Analista", "C"]),
    Q("q29", ["Radiante", "I"], ["Minucioso", "C"], ["Estacionário", "S"], ["Direcionado", "D"]),
    Q("q30", ["Comunicador", "I"], ["Estrategista", "D"], ["Cumpridor", "C"], ["Bondoso", "S"]),
    Q("q31", ["Prestativo", "S"], ["Calculista", "C"], ["Arrojado", "D"], ["Brilhante", "I"]),
    Q("q32", ["Prático", "D"], ["Versátil", "I"], ["Fundamentado", "C"], ["Acolhedor", "S"]),
    Q("q33", ["Mediador", "S"], ["Líder", "D"], ["Agradável", "I"], ["Imparcial", "C"]),
    Q("q34", ["Perito", "C"], ["Solidário", "S"], ["Espirituoso", "I"], ["Ativo", "D"]),
    Q("q35", ["Perseverante", "S"], ["Impetuoso", "D"], ["Deslumbrante", "I"], ["Escrupuloso", "C"]),
    Q("q36", ["Sistemático", "C"], ["Fiel", "S"], ["Compenetrado", "D"], ["Afetuoso", "I"]),
    Q("q37", ["Articulado", "I"], ["Resolvedor", "D"], ["Pontual", "C"], ["Tolerante", "S"]),
    Q("q38", ["Cauteloso", "C"], ["Audaz", "D"], ["Sociável", "I"], ["Amável", "S"]),
    Q("q39", ["Alegre", "I"], ["Executor", "D"], ["Crítico", "C"], ["Estável", "S"]),
    Q("q40", ["Organizado", "C"], ["Influente", "I"], ["Bondoso", "S"], ["Vencedor", "D"]),
  ],
};
