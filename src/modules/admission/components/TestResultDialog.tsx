import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Info } from "@phosphor-icons/react";
import { getTestDefinition } from "../lib/tests";
import { DiscChart, BigFiveChart } from "./TestResultCharts";
import type { DiscFactor } from "../lib/tests/disc-analysis";
import type { Trait } from "../lib/tests/bigfive-analysis";
import type {
  Question,
  Answer,
  Answers,
  SingleChoiceQuestion,
  OpenTextQuestion,
  DiscWordQuestion,
  LikertQuestion,
} from "../lib/tests/types";
import type { JourneyTest } from "../hooks/use-admission-tests";

interface TestResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journeyTest: (JourneyTest & { test?: { name?: string } }) | null;
}

const LIKERT_LABELS: Record<number, string> = {
  1: "Discordo Totalmente",
  2: "Discordo",
  3: "Neutro",
  4: "Concordo",
  5: "Concordo Totalmente",
};

const TRAIT_LABELS: Record<string, string> = {
  O: "Abertura",
  C: "Conscienciosidade",
  E: "Extroversão",
  A: "Amabilidade",
  N: "Neuroticismo",
};

const DISC_LABELS: Record<string, string> = {
  D: "Dominância",
  I: "Influência",
  S: "Estabilidade",
  C: "Conformidade",
};

export function TestResultDialog({
  open,
  onOpenChange,
  journeyTest,
}: TestResultDialogProps) {
  if (!journeyTest) return null;
  const def = getTestDefinition(journeyTest.test_slug);
  const answers = (journeyTest.answers ?? {}) as unknown as Answers;
  const summary = journeyTest.result_summary as
    | {
        correct?: number;
        total?: number;
        objective?: { correct: number; total: number };
        open?: { answered: number; total: number };
        counts?: Record<"D" | "I" | "S" | "C", number>;
        dominant?: string;
        secondary?: string;
        profile?: string;
        traits?: Record<string, number>;
      }
    | null
    | undefined;

  const testName = journeyTest.test?.name ?? journeyTest.test_slug;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl !grid-rows-[auto_1fr] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>{testName}</DialogTitle>
          <DialogDescription>
            Respostas do candidato
            {journeyTest.completed_at &&
              ` · concluído em ${new Date(journeyTest.completed_at).toLocaleDateString("pt-BR")} às ${new Date(journeyTest.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </DialogDescription>

          {/* Resumo conforme tipo de teste */}
          {summary && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {/* Múltipla escolha pura */}
              {typeof summary.correct === "number" &&
                typeof summary.total === "number" && (
                  <Badge
                    className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100"
                  >
                    {summary.correct} / {summary.total} corretas
                  </Badge>
                )}

              {/* Informática (objetivas + abertas) */}
              {summary.objective && (
                <>
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100">
                    Objetivas: {summary.objective.correct} / {summary.objective.total}
                  </Badge>
                  {summary.open && (
                    <Badge className="bg-amber-100 text-amber-700 border-0 hover:bg-amber-100">
                      Abertas: {summary.open.answered} / {summary.open.total} (avalia manualmente)
                    </Badge>
                  )}
                </>
              )}

              {/* DISC */}
              {summary.profile && (
                <Badge className="bg-purple-100 text-purple-700 border-0 hover:bg-purple-100">
                  Perfil {summary.profile} —{" "}
                  {DISC_LABELS[summary.dominant ?? ""] ?? summary.dominant} dominante
                </Badge>
              )}
              {summary.counts && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  D:{summary.counts.D} · I:{summary.counts.I} · S:{summary.counts.S} · C:{summary.counts.C}
                </span>
              )}

              {/* BigFive */}
              {summary.traits && (
                <div className="flex flex-wrap gap-1">
                  {(["O", "C", "E", "A", "N"] as const).map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-xs"
                      title={TRAIT_LABELS[t]}
                    >
                      {t}: {summary.traits![t]}%
                    </Badge>
                  ))}
                </div>
              )}

              {typeof journeyTest.auto_score === "number" && (
                <Badge variant="outline" className="ml-auto">
                  Score: {journeyTest.auto_score}%
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-4">
          {!def ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Conteúdo desse teste não pôde ser carregado.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Visualização específica por tipo de teste */}
              {summary?.counts && (
                <DiscChart counts={summary.counts as Record<DiscFactor, number>} />
              )}
              {summary?.traits && (
                <BigFiveChart
                  scores={{
                    O: summary.traits.openness ?? 0,
                    C: summary.traits.conscientiousness ?? 0,
                    E: summary.traits.extraversion ?? 0,
                    A: summary.traits.agreeableness ?? 0,
                    N: summary.traits.neuroticism ?? 0,
                  } as Record<Trait, number>}
                />
              )}

              {/* Lista de perguntas e respostas */}
              <details
                className="rounded-xl border border-border bg-card group"
                open={!summary?.counts && !summary?.traits}
              >
                <summary className="px-4 py-3 cursor-pointer font-medium text-sm flex items-center justify-between hover:bg-muted/30 rounded-xl">
                  <span>Ver perguntas e respostas ({def.questions.length})</span>
                  <span className="text-xs text-muted-foreground group-open:hidden">expandir</span>
                  <span className="text-xs text-muted-foreground hidden group-open:inline">recolher</span>
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  {def.questions.map((q, idx) => (
                    <QuestionResult
                      key={q.id}
                      index={idx + 1}
                      question={q}
                      answer={answers[q.id]}
                    />
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-question
// ─────────────────────────────────────────────────────────────────────────────

function QuestionResult({
  index,
  question,
  answer,
}: {
  index: number;
  question: Question;
  answer: Answer | undefined;
}) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="font-mono text-xs text-muted-foreground tabular-nums pt-0.5">
          {String(index).padStart(2, "0")}
        </span>
        <p className="text-sm font-medium text-foreground flex-1">{question.prompt}</p>
      </div>

      <div className="pl-9">
        {question.type === "single_choice" && (
          <SingleChoiceResult question={question} answer={answer} />
        )}
        {question.type === "open_text" && (
          <OpenTextResult question={question} answer={answer} />
        )}
        {question.type === "disc_word" && (
          <DiscWordResult question={question} answer={answer} />
        )}
        {question.type === "likert_5" && (
          <LikertResult question={question} answer={answer} />
        )}
      </div>
    </div>
  );
}

function SingleChoiceResult({
  question,
  answer,
}: {
  question: SingleChoiceQuestion;
  answer: Answer | undefined;
}) {
  const chosen = answer?.type === "single_choice" ? answer.key : null;
  const correct = question.correctKey;
  const hasAutoGrade = !!correct;
  const isRight = hasAutoGrade && chosen === correct;
  const isWrong = hasAutoGrade && chosen !== null && chosen !== correct;

  return (
    <div className="space-y-1.5">
      {question.options.map((opt) => {
        const isChosen = chosen === opt.key;
        const isCorrectOpt = correct === opt.key;
        let cls = "border-border";
        let icon = null;
        if (hasAutoGrade && isChosen && isCorrectOpt) {
          cls = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20";
          icon = <CheckCircle className="w-4 h-4 text-emerald-600" weight="fill" />;
        } else if (hasAutoGrade && isChosen && !isCorrectOpt) {
          cls = "border-rose-500 bg-rose-50 dark:bg-rose-950/20";
          icon = <XCircle className="w-4 h-4 text-rose-600" weight="fill" />;
        } else if (hasAutoGrade && isCorrectOpt) {
          cls = "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10";
        } else if (isChosen) {
          cls = "border-primary bg-primary/5";
        }
        return (
          <div
            key={opt.key}
            className={`flex items-center gap-2 px-3 py-2 rounded border text-sm ${cls}`}
          >
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {opt.key}
            </span>
            <span className="flex-1">{opt.label}</span>
            {icon}
          </div>
        );
      })}
      {!hasAutoGrade && chosen === null && (
        <p className="text-xs text-muted-foreground italic">Não respondida</p>
      )}
      {hasAutoGrade && (
        <p className="text-xs flex items-center gap-1 pt-0.5">
          {isRight && (
            <span className="text-emerald-700 font-medium">Resposta correta ✓</span>
          )}
          {isWrong && (
            <span className="text-rose-700">
              Resposta incorreta — gabarito: <strong>{correct}</strong>
            </span>
          )}
          {!chosen && (
            <span className="text-muted-foreground italic">
              Não respondida (gabarito: <strong>{correct}</strong>)
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function OpenTextResult({
  question,
  answer,
}: {
  question: OpenTextQuestion;
  answer: Answer | undefined;
}) {
  const text = answer?.type === "open_text" ? answer.text : "";
  return (
    <div className="space-y-2">
      <div className="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap">
        {text || (
          <span className="italic text-muted-foreground">Não respondida</span>
        )}
      </div>
      {question.suggestedAnswer && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md p-2.5">
          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" weight="fill" />
          <div>
            <strong className="text-amber-700 dark:text-amber-400">Sugestão de gabarito (RH):</strong>{" "}
            {question.suggestedAnswer}
          </div>
        </div>
      )}
    </div>
  );
}

function DiscWordResult({
  question,
  answer,
}: {
  question: DiscWordQuestion;
  answer: Answer | undefined;
}) {
  const factor = answer?.type === "disc_word" ? answer.factor : null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      {question.options.map((opt) => {
        const isChosen = factor === opt.factor;
        return (
          <div
            key={opt.word}
            className={`px-3 py-2 rounded border text-sm flex items-center justify-between gap-2 ${
              isChosen ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            <span>{opt.word}</span>
            <Badge variant="outline" className="text-[10px] font-mono">
              {opt.factor}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function LikertResult({
  question,
  answer,
}: {
  question: LikertQuestion;
  answer: Answer | undefined;
}) {
  const value = answer?.type === "likert_5" ? answer.value : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <div
            key={v}
            className={`py-2 rounded border text-center font-bold text-sm ${
              value === v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {v}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value !== null ? (
          <>
            Resposta: <strong>{LIKERT_LABELS[value]}</strong>
            {" · "}
            <span>
              Traço: {TRAIT_LABELS[question.trait] ?? question.trait}
              {question.reversed && " (item invertido)"}
            </span>
          </>
        ) : (
          <span className="italic">Não respondida</span>
        )}
      </p>
    </div>
  );
}
