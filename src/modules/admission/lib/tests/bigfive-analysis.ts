// Análise interpretativa dos 5 grandes traços (OCEAN). Pra cada traço,
// devolve um label, descrição curta de score baixo/médio/alto, e
// sugestões de leitura pra recrutamento.

export type Trait = "O" | "C" | "E" | "A" | "N";

export const TRAIT_LABELS: Record<Trait, string> = {
  O: "Abertura",
  C: "Conscienciosidade",
  E: "Extroversão",
  A: "Amabilidade",
  N: "Neuroticismo",
};

export const TRAIT_FULL_NAMES: Record<Trait, string> = {
  O: "Abertura à Experiência",
  C: "Conscienciosidade",
  E: "Extroversão",
  A: "Amabilidade",
  N: "Neuroticismo (Estabilidade Emocional invertida)",
};

export const TRAIT_COLORS: Record<Trait, string> = {
  O: "bg-violet-500",
  C: "bg-blue-500",
  E: "bg-amber-500",
  A: "bg-emerald-500",
  N: "bg-rose-500",
};

export const TRAIT_TEXT_COLORS: Record<Trait, string> = {
  O: "text-violet-600",
  C: "text-blue-600",
  E: "text-amber-600",
  A: "text-emerald-600",
  N: "text-rose-600",
};

interface TraitInterpretation {
  /** Label curto pro nível (Baixo / Médio / Alto). */
  level: "Baixo" | "Médio" | "Alto";
  /** Frase curta interpretativa. */
  reading: string;
}

/**
 * Interpreta um score 0-100 num traço. Faixas: 0-39 baixo, 40-60 médio,
 * 61-100 alto. Os textos refletem leitura de RH.
 */
export function interpretTrait(trait: Trait, score: number): TraitInterpretation {
  const level: TraitInterpretation["level"] =
    score <= 39 ? "Baixo" : score <= 60 ? "Médio" : "Alto";

  const TEXTS: Record<Trait, Record<TraitInterpretation["level"], string>> = {
    O: {
      Baixo:
        "Pragmático e tradicional. Prefere caminhos testados, processos estabelecidos e rotinas previsíveis. Cabe bem em operações estáveis.",
      Médio:
        "Equilibra abertura com pragmatismo. Aceita ideias novas quando fazem sentido, mas não muda por mudar.",
      Alto:
        "Curioso, criativo, atraído por ideias novas. Aprende rápido em contextos ambíguos. Bom pra inovação, P&D, design e estratégia.",
    },
    C: {
      Baixo:
        "Flexível e espontâneo. Pode ter dificuldade com prazos rígidos e processos detalhistas. Funciona melhor em rotinas dinâmicas.",
      Médio:
        "Organizado quando precisa, sem ser rígido. Equilibra disciplina com adaptação.",
      Alto:
        "Disciplinado, organizado, focado em metas. Cumpre prazos e mantém padrões. Ideal pra cargos de responsabilidade, gestão e operações precisas.",
    },
    E: {
      Baixo:
        "Reservado e introspectivo. Trabalha melhor em ambientes com menos exposição. Ótimo em papéis técnicos profundos.",
      Médio:
        "Sociável quando necessário, mas não busca holofotes. Adapta-se a contextos diversos.",
      Alto:
        "Sociável, energético, comunicativo. Ganha impulso ao interagir. Bom pra vendas, atendimento, liderança visível e papéis de fachada.",
    },
    A: {
      Baixo:
        "Direto e analítico nas relações. Coloca dados e resultados acima de harmonia. Bom pra negociação e papéis que exigem decisão sob conflito.",
      Médio:
        "Equilibra empatia com firmeza. Mantém boas relações sem evitar conflitos necessários.",
      Alto:
        "Cooperativo, empático, confia nas pessoas. Constrói relações fortes e cuida do clima. Ideal pra gestão de pessoas, customer success e cuidado.",
    },
    N: {
      Baixo:
        "Estabilidade emocional alta. Mantém a calma sob pressão e raramente entra em alta carga emocional. Confiável em crises.",
      Médio:
        "Reage com naturalidade ao estresse — não evita pressão, mas se recupera rápido.",
      Alto:
        "Mais sensível à pressão e mudança. Pode oscilar emocionalmente em cenários de alta carga. Vale validar contexto e suporte da liderança.",
    },
  };

  return { level, reading: TEXTS[trait][level] };
}

export interface BigFiveAnalysis {
  scores: Record<Trait, number>;
  /** Lista ordenada do mais alto pro mais baixo. */
  ranked: Array<{ trait: Trait; score: number; interpretation: TraitInterpretation }>;
  /** Resumo geral em 1-2 frases. */
  headline: string;
}

export function buildBigFiveAnalysis(scores: Record<Trait, number>): BigFiveAnalysis {
  const traits: Trait[] = ["O", "C", "E", "A", "N"];
  const ranked = traits
    .map((t) => ({ trait: t, score: scores[t], interpretation: interpretTrait(t, scores[t]) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const lowest = ranked[ranked.length - 1];
  const headline = buildHeadline(top, lowest);

  return { scores, ranked, headline };
}

function buildHeadline(
  top: { trait: Trait; score: number },
  lowest: { trait: Trait; score: number },
): string {
  const tName = TRAIT_LABELS[top.trait].toLowerCase();
  const lName = TRAIT_LABELS[lowest.trait].toLowerCase();

  if (top.score - lowest.score < 15) {
    return "Perfil equilibrado entre os 5 traços. Adapta-se bem a contextos diversos sem dominância forte de um único traço.";
  }
  return `Traço mais marcante: ${tName} (${top.score}%). Mais discreto: ${lName} (${lowest.score}%).`;
}
