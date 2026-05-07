import type { TestDefinition, LikertQuestion } from "./types";
import { bigfive50Test } from "./bigfive_50";

// IPIP-NEO-120 (Maples-Keller et al., 2019) — 30 facetas (4 itens cada).
// Adaptação livre pra português brasileiro. Os 50 itens da BFI-50 são
// reaproveitados; outros 70 cobrem facetas adicionais.
//
// IMPORTANTE: a tradução PT-BR validada da IPIP-NEO-120 ainda não tem
// versão pública livre de royalties. Por isso essa lista deve ser
// revisada por psicometrista antes de uso em decisão de admissão.
// Por padrão o teste fica `is_active=false` no catálogo (ver migration).

const Q = (
  id: string,
  prompt: string,
  trait: LikertQuestion["trait"],
  reversed: boolean,
  facet?: string,
): LikertQuestion => ({ id, type: "likert_5", prompt, trait, reversed, facet });

// 70 itens adicionais focados em facetas que a BFI-50 não cobre bem.
// Mistura de itens da IPIP, parafraseados ou traduzidos.
const additional: LikertQuestion[] = [
  // Openness — facetas: Imagination, Artistic Interests, Emotionality, Adventurousness, Intellect, Liberalism
  Q("o51", "Tenho uma vida interior ativa.", "O", false, "Imagination"),
  Q("o52", "Aprecio formas de arte como pintura, música e cinema.", "O", false, "ArtisticInterests"),
  Q("o53", "Acredito na importância da arte.", "O", false, "ArtisticInterests"),
  Q("o54", "Sou uma pessoa curiosa.", "O", false, "Adventurousness"),
  Q("o55", "Gosto de visitar lugares novos.", "O", false, "Adventurousness"),
  Q("o56", "Prefiro a rotina à variedade.", "O", true, "Adventurousness"),
  Q("o57", "Procuro aprender com cada experiência.", "O", false, "Intellect"),
  Q("o58", "Discuto ideias com facilidade.", "O", false, "Intellect"),
  Q("o59", "Estou aberto a opiniões diferentes das minhas.", "O", false, "Liberalism"),
  Q("o60", "Acredito que tradições são para serem mantidas.", "O", true, "Liberalism"),
  Q("o61", "Sinto emoções intensas.", "O", false, "Emotionality"),
  Q("o62", "Lembro-me com nitidez de momentos marcantes.", "O", false, "Emotionality"),

  // Conscientiousness — facetas: Self-Efficacy, Orderliness, Dutifulness, Achievement-Striving, Self-Discipline, Cautiousness
  Q("c51", "Confio na minha capacidade de realizar tarefas.", "C", false, "SelfEfficacy"),
  Q("c52", "Prefiro manter as coisas organizadas.", "C", false, "Orderliness"),
  Q("c53", "Cumpro minhas promessas.", "C", false, "Dutifulness"),
  Q("c54", "Trabalho duro pra atingir meus objetivos.", "C", false, "AchievementStriving"),
  Q("c55", "Conduzo as minhas tarefas até o fim.", "C", false, "SelfDiscipline"),
  Q("c56", "Penso antes de agir.", "C", false, "Cautiousness"),
  Q("c57", "Tomo decisões impulsivas.", "C", true, "Cautiousness"),
  Q("c58", "Adio compromissos.", "C", true, "SelfDiscipline"),
  Q("c59", "Quebro regras com frequência.", "C", true, "Dutifulness"),
  Q("c60", "Não me importo se as coisas estão fora de ordem.", "C", true, "Orderliness"),
  Q("c61", "Tenho dificuldade pra começar tarefas.", "C", true, "SelfEfficacy"),
  Q("c62", "Estabeleço metas e busco realizá-las.", "C", false, "AchievementStriving"),

  // Extraversion — facetas: Friendliness, Gregariousness, Assertiveness, Activity Level, Excitement-Seeking, Cheerfulness
  Q("e51", "Faço amigos rapidamente.", "E", false, "Friendliness"),
  Q("e52", "Procuro a companhia dos outros.", "E", false, "Gregariousness"),
  Q("e53", "Tomo a iniciativa em grupo.", "E", false, "Assertiveness"),
  Q("e54", "Mantenho-me ocupado o dia todo.", "E", false, "ActivityLevel"),
  Q("e55", "Procuro emoções fortes.", "E", false, "ExcitementSeeking"),
  Q("e56", "Sou uma pessoa alegre.", "E", false, "Cheerfulness"),
  Q("e57", "Prefiro estar sozinho.", "E", true, "Gregariousness"),
  Q("e58", "Evito tomar decisões pelo grupo.", "E", true, "Assertiveness"),
  Q("e59", "Passo a maior parte do tempo descansando.", "E", true, "ActivityLevel"),
  Q("e60", "Evito atividades arriscadas.", "E", true, "ExcitementSeeking"),
  Q("e61", "Sou tímido perto de pessoas novas.", "E", true, "Friendliness"),
  Q("e62", "Sorrio com frequência.", "E", false, "Cheerfulness"),

  // Agreeableness — facetas: Trust, Morality, Altruism, Cooperation, Modesty, Sympathy
  Q("a51", "Confio nas intenções das pessoas.", "A", false, "Trust"),
  Q("a52", "Prezo pela honestidade nas minhas relações.", "A", false, "Morality"),
  Q("a53", "Gosto de ajudar quem precisa.", "A", false, "Altruism"),
  Q("a54", "Evito conflitos quando possível.", "A", false, "Cooperation"),
  Q("a55", "Não busco chamar atenção pra mim mesmo.", "A", false, "Modesty"),
  Q("a56", "Comovo-me com a dor dos outros.", "A", false, "Sympathy"),
  Q("a57", "Suspeito das intenções dos outros.", "A", true, "Trust"),
  Q("a58", "Costumo manipular pessoas pra conseguir o que quero.", "A", true, "Morality"),
  Q("a59", "Coloco minhas necessidades à frente das dos outros.", "A", true, "Altruism"),
  Q("a60", "Costumo discutir até ter razão.", "A", true, "Cooperation"),
  Q("a61", "Acho que sou superior à maioria das pessoas.", "A", true, "Modesty"),
  Q("a62", "Não me afeto com sofrimento alheio.", "A", true, "Sympathy"),

  // Neuroticism — facetas: Anxiety, Anger, Depression, Self-Consciousness, Immoderation, Vulnerability
  Q("n51", "Preocupo-me com o que pode dar errado.", "N", false, "Anxiety"),
  Q("n52", "Fico irritado com facilidade.", "N", false, "Anger"),
  Q("n53", "Sinto-me triste sem razão clara.", "N", false, "Depression"),
  Q("n54", "Constranjo-me em situações sociais.", "N", false, "SelfConsciousness"),
  Q("n55", "Tenho dificuldade em resistir a tentações.", "N", false, "Immoderation"),
  Q("n56", "Sinto-me sobrecarregado por dificuldades.", "N", false, "Vulnerability"),
  Q("n57", "Mantenho a calma sob pressão.", "N", true, "Anxiety"),
  Q("n58", "Raramente fico bravo.", "N", true, "Anger"),
  Q("n59", "Sinto-me confiante sobre o futuro.", "N", true, "Depression"),
  Q("n60", "Sinto-me à vontade entre pessoas que não conheço.", "N", true, "SelfConsciousness"),
  Q("n61", "Consigo controlar meus impulsos.", "N", true, "Immoderation"),
  Q("n62", "Lido bem com situações inesperadas.", "N", true, "Vulnerability"),
];

// IDs prefixados pra não colidir com os da BFI-50 (q1..q50).
const remapped120 = [
  ...bigfive50Test.questions.map((q) => ({ ...q, id: `bf50_${q.id}` })),
  ...additional,
];

export const bigfive120Test: TestDefinition = {
  slug: "bigfive_120",
  scoring: "bigfive",
  estimatedMinutes: 25,
  intro:
    "Versão completa do BigFive (120 itens) — mede os 5 grandes traços e " +
    "30 facetas. Cerca de 25 minutos. Pode pausar e voltar quando quiser. 🧬",
  questions: remapped120 as LikertQuestion[],
};
