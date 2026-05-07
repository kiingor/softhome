// Análise interpretativa do perfil DISC. Conteúdo adaptado do html
// de referência (D:/TestesRH/Perfil Comportamental/teste-disc.html).

export type DiscFactor = "D" | "I" | "S" | "C";

export const DISC_LABELS: Record<DiscFactor, string> = {
  D: "Dominância",
  I: "Influência",
  S: "Estabilidade",
  C: "Conformidade",
};

export const DISC_COLORS: Record<DiscFactor, string> = {
  D: "bg-rose-500",
  I: "bg-amber-500",
  S: "bg-emerald-500",
  C: "bg-blue-500",
};

export const DISC_BG_COLORS: Record<DiscFactor, string> = {
  D: "bg-rose-100",
  I: "bg-amber-100",
  S: "bg-emerald-100",
  C: "bg-blue-100",
};

export const DISC_TEXT_COLORS: Record<DiscFactor, string> = {
  D: "text-rose-600",
  I: "text-amber-600",
  S: "text-emerald-600",
  C: "text-blue-600",
};

interface FatorDesc {
  nome: string;
  arquetipo: string;
  palavra: string;
  forcas: string[];
  atencao: string[];
}

export const FATOR_DESC: Record<DiscFactor, FatorDesc> = {
  D: {
    nome: "Dominância",
    arquetipo: "O Realizador",
    palavra: "resultado",
    forcas: [
      "Toma decisões rápidas sob pressão e assume responsabilidade pelo desfecho",
      "Aceita desafios difíceis e mantém o foco em entregar o objetivo",
      "Comunica-se de forma direta e objetiva, evitando rodeios",
    ],
    atencao: [
      "Pode parecer impaciente ou pouco diplomático em momentos de tensão",
      "Tende a delegar pouco e a assumir riscos sem consultar o time",
    ],
  },
  I: {
    nome: "Influência",
    arquetipo: "O Comunicador",
    palavra: "pessoas",
    forcas: [
      "Engaja e inspira pessoas pela energia e otimismo",
      "Articula bem ideias em apresentações, vendas e negociações",
      "Constrói rede de relacionamentos rapidamente",
    ],
    atencao: [
      "Pode priorizar o entusiasmo em detrimento do detalhe técnico",
      "Tende a se distrair com novas oportunidades antes de fechar a anterior",
    ],
  },
  S: {
    nome: "Estabilidade",
    arquetipo: "O Apoiador",
    palavra: "consistência",
    forcas: [
      "Entrega de forma constante, leal e sem ruído",
      "Costura times e suaviza conflitos com paciência genuína",
      "Mantém qualidade em tarefas repetitivas e de longo prazo",
    ],
    atencao: [
      "Resiste a mudanças bruscas e prefere previsibilidade",
      "Pode evitar confrontos necessários para preservar o clima",
    ],
  },
  C: {
    nome: "Conformidade",
    arquetipo: "O Especialista",
    palavra: "precisão",
    forcas: [
      "Trabalha com rigor técnico, dados e processos bem definidos",
      "Antecipa riscos pela análise cuidadosa antes de agir",
      "Entrega com altíssimo padrão de qualidade e conformidade",
    ],
    atencao: [
      "Pode travar a execução em busca da perfeição",
      "Tende a ser crítico consigo e com colegas em padrões altos",
    ],
  },
};

const RESUMOS: Record<string, string> = {
  // Trifatoriais
  CSD: "'Metódico Realizador'. O rigor técnico (C) e a paciência operacional (S) guiam a rotina, com Dominância (D) latente que garante que o trabalho saia do papel. Mestre dos processos que não desistem diante de dificuldades.",
  DSC: "'Realizador Estruturado'. Combina entrega de resultado (D) com constância (S) e cuidado técnico (C). Funciona muito bem em posições onde é preciso liderar com método, sem abrir mão da qualidade nem do clima do time.",
  CDI: "'Especialista Persuasivo'. Une rigor analítico (C) à entrega de resultado (D) e à habilidade de articular ideias (I). Sabe vender uma solução técnica para públicos que exigem profundidade.",
  DIC: "'Líder Comunicador Técnico'. Resultado (D), articulação (I) e rigor (C) andam juntos. Lidera mostrando dados, mas com energia para mobilizar pessoas — bom para gestão de produto, consultoria e liderança técnica.",
  DIS: "'Líder Inspirador'. Foco em resultado (D), poder de influência (I) e respeito ao time (S). Funciona bem em liderança comercial, gestão de pessoas e papéis que exigem firmeza com empatia.",
  ISC: "'Comunicador Cuidadoso'. Articula com leveza (I), preserva o relacionamento (S) e zela pelo detalhe (C). Encaixa bem em atendimento consultivo, parcerias e papéis que exigem confiança de longo prazo.",
  // Bifatoriais
  DC: "'Estrategista Implacável'. Combina urgência por resultado (D) com rigor analítico (C). Decide rápido apoiado em dados — perfil clássico de gestão executiva orientada por métricas.",
  CD: "'Especialista Resolutivo'. Profundidade técnica (C) com pulso para fazer acontecer (D). Trabalha bem em áreas críticas onde erro custa caro e prazo aperta.",
  DI: "'Líder Carismático'. Entrega resultado (D) com poder de influência (I). Atrai gente, abre mercados e fecha negócios. Bom para vendas complexas, expansão e papéis de liderança visível.",
  ID: "'Mobilizador'. Comunicação envolvente (I) com pulso de execução (D). Move equipes pelo entusiasmo e garante que a agenda avance.",
  IS: "'Construtor de Pontes'. Articula com leveza (I) e cuida do clima (S). Segura times unidos em momentos de pressão.",
  SI: "'Anfitrião Confiável'. Estabilidade (S) com calor humano (I). Cria ambientes seguros onde as pessoas rendem o melhor.",
  SC: "'Operador Meticuloso'. Constância (S) com rigor (C). Entrega qualidade sem alarde — coluna vertebral de operações que precisam funcionar todos os dias.",
  CS: "'Analista Confiável'. Rigor técnico (C) com paciência (S). Excelente em auditoria, qualidade e papéis que exigem método e discrição.",
  DS: "'Realizador Constante'. Pulso de execução (D) com lealdade (S). Lidera pelo exemplo, sem teatro.",
  SD: "'Apoiador Determinado'. Estabilidade (S) que, quando precisa, assume o protagonismo (D). Sólido em papéis de retaguarda crítica.",
  IC: "'Comunicador Técnico'. Articula bem (I) e fundamenta com dados (C). Encaixa em pré-vendas, consultoria e relações institucionais.",
  CI: "'Analista Articulado'. Rigor técnico (C) que sabe se comunicar (I). Bom em papéis que traduzem complexidade para o negócio.",
  // Unifatoriais
  D: "'Líder Decisor'. Dominância clara — existe pra entregar resultado, romper inércia e fazer acontecer. Brilha em ambientes desafiadores e papéis de liderança direta.",
  I: "'Influenciador'. Influência clara — sua matéria-prima são as pessoas. Brilha em vendas, comunicação, relações públicas e papéis em que carisma fecha negócio.",
  S: "'Pilar Estável'. Estabilidade clara — é a constância silenciosa que faz a operação rodar. Brilha em papéis de longo prazo, suporte e qualidade.",
  C: "'Especialista'. Conformidade clara — rigor, dados e padrão. Brilha em engenharia, jurídico, auditoria e qualquer função em que erro tem custo alto.",
};

const POSICIONAMENTO: Record<DiscFactor, string> = {
  D: "Em entrevistas, leve cases de decisão sob pressão e metas batidas. Empresas que valorizam agressividade comercial, liderança e turnaround respondem bem a esse perfil.",
  I: "Em entrevistas, mostre exemplos de pessoas mobilizadas, públicos atendidos e narrativas vendidas. Áreas de growth, comunicação, vendas consultivas e parcerias são o campo natural.",
  S: "Em entrevistas, destaque entregas consistentes, baixa rotatividade dos times e processos mantidos estáveis. Operações, customer success e back office reconhecem esse valor.",
  C: "Em entrevistas, leve métricas de qualidade, redução de erros, processos documentados. Engenharia, dados, finanças, jurídico e qualidade premiam esse rigor.",
};

export interface DiscAnalysis {
  /** Pontos brutos por fator (0-40, somam 40). */
  raw: Record<DiscFactor, number>;
  /** Percentuais (linear 4x + 8 sobre os pontos brutos). */
  pct: Record<DiscFactor, number>;
  /** Lista ordenada do mais alto pro mais baixo. */
  ranked: Array<{ factor: DiscFactor; raw: number; pct: number }>;
  /** Letras dos fatores >= 40% em ordem de intensidade. */
  highFactors: DiscFactor[];
  /** Código (ex: "DI", "CSD", "DISC", "S"). */
  code: string;
  /** Classificação: 'Equilibrado' | 'Unifatorial X' | 'Bifatorial XY' | 'Trifatorial XYZ' | 'Tetrafatorial DISC' */
  intensity: string;
  /** Resumo interpretativo com aspas. */
  summary: string;
  /** Forças do(s) fator(es) dominante(s). */
  strengths: string[];
  /** Pontos de atenção. */
  watchouts: string[];
  /** Sugestão de posicionamento em recrutamento. */
  positioning: string;
}

const HIGH_THRESHOLD = 40;

function toPct(score: number): number {
  // Normalização linear ~4x + 8 (do html de referência).
  const pct = Math.round(4 * score + 8);
  return Math.max(0, Math.min(100, pct));
}

export function buildDiscAnalysis(
  counts: Record<DiscFactor, number>,
): DiscAnalysis {
  const raw: Record<DiscFactor, number> = { D: counts.D, I: counts.I, S: counts.S, C: counts.C };
  const pct: Record<DiscFactor, number> = {
    D: toPct(raw.D),
    I: toPct(raw.I),
    S: toPct(raw.S),
    C: toPct(raw.C),
  };

  const factors: DiscFactor[] = ["D", "I", "S", "C"];
  const ranked = factors
    .map((f) => ({ factor: f, raw: raw[f], pct: pct[f] }))
    .sort((a, b) => b.pct - a.pct);

  const highFactors = ranked.filter((r) => r.pct >= HIGH_THRESHOLD).map((r) => r.factor);

  let intensity: string;
  let code: string;
  if (highFactors.length === 0) {
    intensity = "Equilibrado";
    code = ranked.map((r) => r.factor).join("");
  } else if (highFactors.length === 1) {
    intensity = `Unifatorial ${highFactors[0]}`;
    code = highFactors[0];
  } else if (highFactors.length === 2) {
    intensity = `Bifatorial ${highFactors.join("")}`;
    code = highFactors.join("");
  } else if (highFactors.length === 3) {
    intensity = `Trifatorial ${highFactors.join("")}`;
    code = highFactors.join("");
  } else {
    intensity = "Tetrafatorial DISC";
    code = "DISC";
  }

  const summary = RESUMOS[code] ?? buildGenericSummary(code, ranked);

  const dominant = highFactors[0] ?? ranked[0].factor;
  const dominantDesc = FATOR_DESC[dominant];
  const strengths = [...dominantDesc.forcas];
  const watchouts = [...dominantDesc.atencao];
  // Adiciona forças/atenção do segundo fator se for bifatorial+
  if (highFactors.length >= 2) {
    const secondary = highFactors[1];
    strengths.push(...FATOR_DESC[secondary].forcas.slice(0, 1));
    watchouts.push(...FATOR_DESC[secondary].atencao.slice(0, 1));
  }
  const positioning = POSICIONAMENTO[dominant];

  return { raw, pct, ranked, highFactors, code, intensity, summary, strengths, watchouts, positioning };
}

function buildGenericSummary(
  code: string,
  ranked: Array<{ factor: DiscFactor; raw: number; pct: number }>,
): string {
  if (code === "DISC") {
    return "Perfil equilibrado entre os quatro fatores. Adapta o comportamento à situação, sem dominância forte. Em recrutamento, é um ativo: se molda à cultura, desde que o processo deixe claro o que se espera.";
  }
  const parts: string[] = [];
  ranked.slice(0, 3).forEach((r, i) => {
    const desc = FATOR_DESC[r.factor];
    if (i === 0) parts.push(`Marca principal: ${desc.nome.toLowerCase()} (${r.factor}) — foco em ${desc.palavra}`);
    else parts.push(`com apoio de ${desc.nome.toLowerCase()} (${r.factor})`);
  });
  return parts.join(", ") + ".";
}
