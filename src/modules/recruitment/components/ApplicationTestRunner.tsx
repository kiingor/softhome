import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  CircleNotch as Loader2,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { getTestDefinition } from "@/modules/admission/lib/tests";
import { scoreTest } from "@/modules/admission/lib/tests/scoring";
import type {
  Answer,
  Answers,
  Question,
  LikertQuestion,
  DiscWordQuestion,
  SingleChoiceQuestion,
  OpenTextQuestion,
} from "@/modules/admission/lib/tests/types";
import {
  completeApplicationTestInSession,
  saveApplicationTestProgressInSession,
} from "../services/application-tests.service";

interface Props {
  /** Token da sessão (vem da URL, igual pra todos os testes da application). */
  sessionToken: string;
  /** ID do application_test específico que está sendo respondido. */
  testId: string;
  testSlug: string;
  initialAnswers?: Answers;
  onCompleted: () => void;
  onCancel?: () => void;
}

const LIKERT_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Discordo Totalmente",
  2: "Discordo",
  3: "Neutro",
  4: "Concordo",
  5: "Concordo Totalmente",
};

export function ApplicationTestRunner({
  sessionToken,
  testId,
  testSlug,
  initialAnswers,
  onCompleted,
  onCancel,
}: Props) {
  const def = useMemo(() => getTestDefinition(testSlug), [testSlug]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialAnswers ?? {});
  const [submitting, setSubmitting] = useState(false);

  if (!def) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Esse teste não pôde ser carregado. Avise o time de RH.
      </div>
    );
  }

  const total = def.questions.length;
  const current = def.questions[index];
  const currentAnswered = !!answers[current.id];
  const allAnswered = def.questions.every((q) => {
    const a = answers[q.id];
    if (!a) return false;
    if (a.type === "open_text") return a.text.trim().length > 0;
    return true;
  });
  const pct = ((index + (currentAnswered ? 1 : 0)) / total) * 100;

  const setAnswer = (a: Answer) => {
    setAnswers((prev) => {
      const next = { ...prev, [current.id]: a };
      saveApplicationTestProgressInSession(
        sessionToken,
        testId,
        next as unknown as Record<string, unknown>,
      ).catch(() => {
        /* autosave falha silencia */
      });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!allAnswered) {
      toast.error("Responde todas as perguntas antes de finalizar.");
      return;
    }
    setSubmitting(true);
    try {
      const result = scoreTest(def, answers);
      await completeApplicationTestInSession(
        sessionToken,
        testId,
        answers as unknown as Record<string, unknown>,
        result.score,
        result.summary,
      );
      onCompleted();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar respostas");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar à lista
            </Button>
          ) : (
            <span className="text-muted-foreground font-medium">{def.name}</span>
          )}
          <span className="text-muted-foreground tabular-nums">
            Pergunta {index + 1} de {total}
          </span>
        </div>
        {onCancel && (
          <p className="text-sm font-medium text-foreground">{def.name}</p>
        )}
        <Progress value={pct} className="h-2" />
      </div>

      <QuestionCard
        question={current}
        answer={answers[current.id]}
        onAnswer={setAnswer}
      />

      <div className="flex items-center justify-between gap-3 sticky bottom-0 bg-background/80 backdrop-blur py-3 border-t">
        <Button
          variant="outline"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Anterior
        </Button>
        {index < total - 1 ? (
          <Button
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            disabled={!currentAnswered}
          >
            Próxima
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!allAnswered || submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Finalizar teste
          </Button>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  answer,
  onAnswer,
}: {
  question: Question;
  answer: Answer | undefined;
  onAnswer: (a: Answer) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <p className="text-base sm:text-lg font-medium text-foreground leading-relaxed">
        {question.prompt}
      </p>
      <div>
        {question.type === "single_choice" && (
          <SingleChoiceInput question={question} answer={answer} onAnswer={onAnswer} />
        )}
        {question.type === "open_text" && (
          <OpenTextInput question={question} answer={answer} onAnswer={onAnswer} />
        )}
        {question.type === "disc_word" && (
          <DiscWordInput question={question} answer={answer} onAnswer={onAnswer} />
        )}
        {question.type === "likert_5" && (
          <LikertInput question={question} answer={answer} onAnswer={onAnswer} />
        )}
      </div>
    </div>
  );
}

function SingleChoiceInput({
  question,
  answer,
  onAnswer,
}: {
  question: SingleChoiceQuestion;
  answer: Answer | undefined;
  onAnswer: (a: Answer) => void;
}) {
  return (
    <div className="grid gap-2">
      {question.options.map((opt) => {
        const selected = answer?.type === "single_choice" && answer.key === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onAnswer({ type: "single_choice", key: opt.key })}
            className={`text-left px-4 py-3 rounded-lg border-2 transition-all ${
              selected
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <span className="font-mono text-xs font-bold text-primary mr-2">
              {opt.key}
            </span>
            <span className="text-sm">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function OpenTextInput({
  question,
  answer,
  onAnswer,
}: {
  question: OpenTextQuestion;
  answer: Answer | undefined;
  onAnswer: (a: Answer) => void;
}) {
  const value = answer?.type === "open_text" ? answer.text : "";
  return (
    <Textarea
      placeholder="Escreva sua resposta..."
      value={value}
      onChange={(e) => onAnswer({ type: "open_text", text: e.target.value })}
      rows={5}
      className="resize-none"
    />
  );
}

function DiscWordInput({
  question,
  answer,
  onAnswer,
}: {
  question: DiscWordQuestion;
  answer: Answer | undefined;
  onAnswer: (a: Answer) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {question.options.map((opt) => {
        const selected = answer?.type === "disc_word" && answer.factor === opt.factor;
        return (
          <button
            key={opt.word}
            type="button"
            onClick={() => onAnswer({ type: "disc_word", factor: opt.factor })}
            className={`px-4 py-4 sm:py-5 rounded-xl border-2 transition-all text-base font-medium ${
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50 hover:bg-muted/30 text-foreground"
            }`}
          >
            {opt.word}
          </button>
        );
      })}
    </div>
  );
}

function LikertInput({
  question: _question,
  answer,
  onAnswer,
}: {
  question: LikertQuestion;
  answer: Answer | undefined;
  onAnswer: (a: Answer) => void;
}) {
  const current = answer?.type === "likert_5" ? answer.value : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {([1, 2, 3, 4, 5] as const).map((v) => {
          const selected = current === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onAnswer({ type: "likert_5", value: v })}
              className={`py-3 sm:py-4 rounded-lg border-2 transition-all font-bold text-lg ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground px-1">
        <span>{LIKERT_LABELS[1]}</span>
        <span className="hidden sm:inline">{LIKERT_LABELS[3]}</span>
        <span>{LIKERT_LABELS[5]}</span>
      </div>
    </div>
  );
}
