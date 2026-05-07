import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CircleNotch as Loader2,
  CheckCircle,
  Play,
  Brain,
  Trophy,
  Clock,
  Lightbulb,
  Heart,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  getPublicTests,
  startPublicTest,
  type PublicJourneyTest,
  type PublicJourneyInfo,
} from "../services/public-tests.service";
import { TestRunner } from "./TestRunner";
import { fireConfetti } from "@/components/portal/celebrations/CelebrationToast";

interface TestStageViewProps {
  token: string;
  /** Disparado quando o RH avançar pra etapa 2 (UI deve recarregar). */
  onAdvancedToStage2?: () => void;
}

export function TestStageView({ token, onAdvancedToStage2 }: TestStageViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journey, setJourney] = useState<PublicJourneyInfo | null>(null);
  const [tests, setTests] = useState<PublicJourneyTest[]>([]);
  const [running, setRunning] = useState<PublicJourneyTest | null>(null);
  const [justFinished, setJustFinished] = useState<PublicJourneyTest | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      const r = await getPublicTests(token);
      setJourney(r.journey);
      setTests(r.tests);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar testes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Quando o status do journey mudar de tests_in_review pra docs_pending,
  // o componente pai deve trocar pra etapa 2.
  useEffect(() => {
    if (journey?.status === "docs_pending") onAdvancedToStage2?.();
  }, [journey?.status, onAdvancedToStage2]);

  const startTest = async (jt: PublicJourneyTest) => {
    try {
      if (jt.status === "not_started") {
        await startPublicTest(token, jt.id);
      }
      setRunning(jt);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar");
    }
  };

  const handleCompleted = () => {
    if (running) {
      setJustFinished(running);
      fireConfetti();
    }
    setRunning(null);
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-12 text-sm text-rose-600">{error}</div>
    );
  }

  // Tela de execução
  if (running) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          {running.test.name}
        </h2>
        <TestRunner
          token={token}
          journeyTest={running}
          onCompleted={handleCompleted}
          onCancel={() => {
            setRunning(null);
            refresh();
          }}
        />
      </div>
    );
  }

  // Celebração
  if (justFinished) {
    return (
      <CelebrationCard
        testName={justFinished.test.name}
        onContinue={() => {
          setJustFinished(null);
        }}
      />
    );
  }

  const completedCount = tests.filter(
    (t) => t.status === "completed" || t.status === "reviewed",
  ).length;
  const allDone = tests.length > 0 && completedCount === tests.length;

  // Lista de testes
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Olá{journey?.candidate_name ? `, ${firstName(journey.candidate_name)}` : ""}! 👋
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Antes de pedir seus dados, vamos fazer alguns testes pra te conhecer
          melhor. São {tests.length} testes — pode pausar e voltar quando quiser.
        </p>
      </div>

      {/* Progresso geral */}
      {tests.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {completedCount} de {tests.length} testes concluídos
              </span>
              <span className="text-muted-foreground tabular-nums">
                {Math.round((completedCount / tests.length) * 100)}%
              </span>
            </div>
            <Progress value={(completedCount / tests.length) * 100} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Aguardando análise */}
      {allDone && (
        <Card className="border-2 border-primary bg-primary/5">
          <CardContent className="p-6 sm:p-8 text-center space-y-3">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-bold text-foreground">
              Tudo certo, {firstName(journey?.candidate_name ?? "")}!
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Você concluiu todos os testes. Agora a equipe vai analisar suas
              respostas. Quando for liberado pra próxima etapa, você recebe um
              novo link por email/WhatsApp. Pode fechar essa página tranquilo.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista de testes */}
      <div className="space-y-3">
        {tests.map((t) => (
          <TestCard key={t.id} test={t} onStart={() => startTest(t)} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test card
// ─────────────────────────────────────────────────────────────────────────────

function TestCard({
  test,
  onStart,
}: {
  test: PublicJourneyTest;
  onStart: () => void;
}) {
  const isCompleted = test.status === "completed" || test.status === "reviewed";
  const isInProgress = test.status === "in_progress";
  const Icon = categoryIcon(test.test.category);

  return (
    <Card className={isCompleted ? "border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10" : ""}>
      <CardContent className="p-4 flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
          }`}
        >
          {isCompleted ? (
            <CheckCircle className="w-5 h-5" weight="fill" />
          ) : (
            <Icon className="w-5 h-5" weight="duotone" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{test.test.name}</h3>
            {isCompleted && (
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                Concluído
              </Badge>
            )}
            {isInProgress && (
              <Badge variant="secondary" className="text-[10px]">
                Em andamento
              </Badge>
            )}
          </div>
          {test.test.description && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              {test.test.description}
            </p>
          )}
          {test.test.time_limit_minutes && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ~{test.test.time_limit_minutes} min
            </p>
          )}
        </div>
        {!isCompleted && (
          <Button onClick={onStart} className="shrink-0">
            <Play className="w-4 h-4 mr-2" weight="fill" />
            {isInProgress ? "Continuar" : "Iniciar"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Celebration card (após finalizar 1 teste)
// ─────────────────────────────────────────────────────────────────────────────

function CelebrationCard({
  testName,
  onContinue,
}: {
  testName: string;
  onContinue: () => void;
}) {
  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/10 overflow-hidden">
      <CardContent className="p-8 sm:p-12 text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
        {/* Hero: troféu com halo animado */}
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-primary/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Trophy
              className="w-14 h-14 text-primary drop-shadow-sm"
              weight="duotone"
            />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            Mandou bem!
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-sm mx-auto">
            Você concluiu <span className="font-semibold text-foreground">{testName}</span>.
          </p>
        </div>

        <Button
          onClick={onContinue}
          size="lg"
          className="min-w-[180px] shadow-md"
        >
          Continuar
        </Button>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function firstName(full: string): string {
  return full.split(/\s+/)[0] ?? "";
}

function categoryIcon(category: string | null) {
  switch (category) {
    case "aptidao":
      return Lightbulb;
    case "comportamental":
      return Heart;
    case "personalidade":
      return Brain;
    default:
      return Brain;
  }
}
