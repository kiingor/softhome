import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CircleNotch as Loader2,
  CheckCircle,
  Warning,
  Clock,
  Play,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  getApplicationTestsSession,
  startApplicationTestInSession,
  type ApplicationTestSession,
  type ApplicationTestSessionItem,
} from "../services/application-tests.service";
import { ApplicationTestRunner } from "../components/ApplicationTestRunner";
import { SoftHouseLogo } from "@/components/branding/SoftHouseLogo";
import type { Answers } from "@/modules/admission/lib/tests/types";
import { toast } from "sonner";

export default function AplicarTestePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ApplicationTestSession | null>(null);
  const [activeTest, setActiveTest] = useState<ApplicationTestSessionItem | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getApplicationTestsSession(token);
      if (!data || !data.tests) {
        setError("Link inválido, expirado ou sem testes atribuídos.");
        setSession(null);
      } else {
        setSession(data);
        setError(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const handleStartTest = async (test: ApplicationTestSessionItem) => {
    if (!token) return;
    if (test.status === "completed" || test.status === "reviewed") return;
    try {
      await startApplicationTestInSession(token, test.id);
    } catch (err) {
      toast.error("Não rolou iniciar. " + (err as Error).message);
      return;
    }
    setActiveTest(test);
  };

  const handleTestCompleted = async () => {
    setActiveTest(null);
    await refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Warning className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              Link indisponível
            </h1>
            <p className="text-muted-foreground mb-6">
              {error ?? "Esse link não está mais válido."}
            </p>
            <Button asChild variant="outline">
              <Link to="/">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Renderiza o teste ativo
  if (activeTest) {
    return (
      <div className="min-h-screen gradient-warm py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2">
              <SoftHouseLogo size="md" />
              <span className="text-lg font-extrabold tracking-tight text-foreground">
                SoftHouse
              </span>
            </div>
          </div>

          <Card>
            <CardContent className="p-6">
              <ApplicationTestRunner
                sessionToken={token!}
                testId={activeTest.id}
                testSlug={activeTest.test_slug}
                initialAnswers={activeTest.answers as unknown as Answers}
                onCompleted={handleTestCompleted}
                onCancel={() => setActiveTest(null)}
              />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Powered by SoftHouse — Sistema interno de Gente & Cultura
          </p>
        </div>
      </div>
    );
  }

  // Lista de testes
  const total = session.tests.length;
  const completed = session.tests.filter(
    (t) => t.status === "completed" || t.status === "reviewed",
  ).length;
  const allDone = completed === total && total > 0;

  return (
    <div className="min-h-screen gradient-warm py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <SoftHouseLogo size="md" />
            <span className="text-lg font-extrabold tracking-tight text-foreground">
              SoftHouse
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Olá, {session.candidate_name.split(" ")[0]}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Testes para a vaga <strong>{session.job_title}</strong>
          </p>
        </div>

        {/* Progresso */}
        <Card className="mb-4">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Progresso</p>
              <p className="text-lg font-semibold">
                {completed} de {total} concluído{total === 1 ? "" : "s"}
              </p>
            </div>
            {allDone ? (
              <Badge className="text-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                <CheckCircle className="w-4 h-4 mr-1.5" />
                Tudo enviado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-sm">
                {total - completed} restante{total - completed === 1 ? "" : "s"}
              </Badge>
            )}
          </CardContent>
        </Card>

        {allDone && (
          <Card className="mb-4 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10">
            <CardContent className="p-6 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-foreground mb-1">
                Tudo certo, valeu! 🎉
              </h2>
              <p className="text-sm text-muted-foreground">
                Suas respostas foram registradas. O time de RH vai analisar e
                continuar o processo seletivo com você.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Lista de testes */}
        <div className="space-y-2">
          {session.tests.map((test) => {
            const isDone =
              test.status === "completed" || test.status === "reviewed";
            const isInProgress = test.status === "in_progress";
            return (
              <Card
                key={test.id}
                className={isDone ? "opacity-70" : "card-hover"}
              >
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{test.name}</p>
                      {test.category && (
                        <Badge variant="outline" className="text-xs">
                          {test.category}
                        </Badge>
                      )}
                      {isDone && (
                        <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Concluído
                        </Badge>
                      )}
                      {isInProgress && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          Em andamento
                        </Badge>
                      )}
                    </div>
                    {test.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {test.description}
                      </p>
                    )}
                    {test.time_limit_minutes && !isDone && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Tempo estimado: {test.time_limit_minutes} min
                      </p>
                    )}
                  </div>
                  {!isDone && (
                    <Button
                      onClick={() => handleStartTest(test)}
                      size="sm"
                      variant={isInProgress ? "default" : "outline"}
                    >
                      {isInProgress ? (
                        <>
                          Continuar
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Começar
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!allDone && (
          <p className="text-xs text-muted-foreground text-center mt-6">
            Suas respostas são salvas automaticamente. Você pode fechar e voltar
            depois pelo mesmo link.
          </p>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          Powered by SoftHouse — Sistema interno de Gente & Cultura
        </p>
      </div>
    </div>
  );
}
