import { useCallback, useEffect, useRef, useState } from "react";
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
import { BrandLogo } from "@/components/branding/BrandLogo";
import type { Answers } from "@/modules/admission/lib/tests/types";
import { toast } from "sonner";

export default function AplicarTestePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ApplicationTestSession | null>(null);
  // Guarda só o ID: o teste em si é derivado de `session` a cada render, senão
  // vira um retrato velho e o autosave grava por cima das respostas já salvas.
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Espelho de `session` pra ler dentro do refresh sem colocá-la nas deps do
  // useCallback (o useEffect abaixo depende de `refresh` — entraria em loop).
  const sessionRef = useRef<ApplicationTestSession | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getApplicationTestsSession(token);
      if (!data || !data.tests) {
        setError("Link inválido, expirado ou sem testes atribuídos.");
        sessionRef.current = null;
        setSession(null);
      } else {
        sessionRef.current = data;
        setSession(data);
        setError(null);
      }
    } catch (err) {
      // Só derruba a tela se ainda não havia sessão (load inicial). Se o
      // candidato já está respondendo, uma oscilação de rede no refetch não
      // pode fazê-lo achar que o link morreu.
      if (sessionRef.current === null) setError((err as Error).message);
      else toast.error("Não deu pra atualizar a lista. Tente de novo.");
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
      // Motivo mais provável: a lista em tela está velha (teste concluído em
      // outra aba). Relê pra corrigir sozinho.
      await refresh();
      return;
    }
    setActiveTestId(test.id);
  };

  const handleTestCompleted = async () => {
    setActiveTestId(null);
    await refresh();
  };

  // Voltar pra lista SEM releitura deixaria o próximo "Começar" abrir o teste
  // com as respostas de quando a página carregou — e o primeiro autosave
  // gravaria esse vazio por cima do que já estava no banco.
  const handleCancelTest = async () => {
    setActiveTestId(null);
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

  // Derivado da sessão recém-lida, nunca de um retrato guardado no estado.
  const activeTest = activeTestId
    ? (session.tests.find((t) => t.id === activeTestId) ?? null)
    : null;

  // Renderiza o teste ativo
  if (activeTest) {
    return (
      <div className="min-h-screen gradient-warm py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2">
              <BrandLogo size="md" />
              <span className="text-lg font-extrabold tracking-tight text-foreground">
                DNA Softcom
              </span>
            </div>
          </div>

          <Card>
            <CardContent className="p-6">
              <ApplicationTestRunner
                // Remonta ao trocar de teste — o runner guarda as respostas em
                // estado local, semeado só na montagem.
                key={activeTest.id}
                sessionToken={token!}
                testId={activeTest.id}
                testSlug={activeTest.test_slug}
                testName={activeTest.name}
                initialAnswers={activeTest.answers as unknown as Answers}
                onCompleted={handleTestCompleted}
                onCancel={handleCancelTest}
              />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Powered by DNA Softcom — Sistema interno de Gente & Cultura
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
            <BrandLogo size="md" />
            <span className="text-lg font-extrabold tracking-tight text-foreground">
              DNA Softcom
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
              <Badge className="text-sm bg-success/10 text-success dark:bg-success/15 dark:text-success border-0">
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
          <Card className="mb-4 border-success/25 dark:border-success/25 bg-success/15 dark:bg-success/15">
            <CardContent className="p-6 text-center">
              <CheckCircle className="w-12 h-12 text-success dark:text-success mx-auto mb-3" />
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
                        <Badge variant="outline" >
                          {test.category}
                        </Badge>
                      )}
                      {isDone && (
                        <Badge className="bg-success/10 text-success dark:bg-success/15 dark:text-success border-0">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Concluído
                        </Badge>
                      )}
                      {isInProgress && (
                        <Badge variant="outline" >
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
          Powered by DNA Softcom — Sistema interno de Gente & Cultura
        </p>
      </div>
    </div>
  );
}
