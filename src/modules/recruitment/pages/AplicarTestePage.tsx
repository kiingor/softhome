import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CircleNotch as Loader2,
  CheckCircle,
  Warning,
  ListChecks,
} from "@phosphor-icons/react";
import {
  getApplicationTestByToken,
  startPublicApplicationTest,
  type PublicApplicationTest,
} from "../services/application-tests.service";
import { ApplicationTestRunner } from "../components/ApplicationTestRunner";
import { SoftHouseLogo } from "@/components/branding/SoftHouseLogo";
import { getTestDefinition } from "@/modules/admission/lib/tests";
import type { Answers } from "@/modules/admission/lib/tests/types";

export default function AplicarTestePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [test, setTest] = useState<PublicApplicationTest | null>(null);
  const [completed, setCompleted] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const t = await getApplicationTestByToken(token);
        if (!t) {
          setError("Link inválido ou expirado.");
        } else {
          setTest(t);
          if (t.status === "in_progress") setStarted(true);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleStart = async () => {
    if (!token) return;
    try {
      await startPublicApplicationTest(token);
      setStarted(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Warning className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              Teste indisponível
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

  if (completed) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-orange-700 dark:text-orange-300" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              Teste concluído! 🎉
            </h1>
            <p className="text-muted-foreground">
              Suas respostas foram registradas. O time de RH vai analisar e
              continuar o processo seletivo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const def = getTestDefinition(test.test_slug);

  if (!started) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 mb-2">
                <SoftHouseLogo size="md" />
                <span className="text-lg font-extrabold tracking-tight text-foreground">
                  SoftHouse
                </span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Olá, {test.candidate_name.split(" ")[0]}!
              </h1>
              <p className="text-muted-foreground">
                {def?.name ? `Teste: ${def.name}` : "Teste do processo seletivo"}
              </p>
            </div>

            {def?.description && (
              <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground">
                {def.description}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ListChecks className="w-4 h-4" />
                {def?.questions.length ?? 0} perguntas
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Reserve um tempinho sem distrações pra responder. Não tem certo ou
                errado em perguntas comportamentais — responde do jeito mais
                honesto possível.
              </p>
              <p>
                Suas respostas são salvas automaticamente conforme você avança.
              </p>
            </div>

            <Button size="lg" className="w-full" onClick={handleStart}>
              Começar teste
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              token={token!}
              testSlug={test.test_slug}
              initialAnswers={test.answers as unknown as Answers}
              onCompleted={() => setCompleted(true)}
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
