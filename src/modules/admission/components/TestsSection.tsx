import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash,
  CheckCircle,
  Clock,
  Brain,
  CircleNotch as Loader2,
  ArrowRight,
  Eye,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useJourneyTests, type JourneyTest } from "../hooks/use-admission-tests";
import { useAdmissionJourneys } from "../hooks/use-admission-journeys";
import { AssignTestsDialog } from "./AssignTestsDialog";
import { TestResultDialog } from "./TestResultDialog";
import { getTestDefinition } from "../lib/tests";

interface TestsSectionProps {
  journeyId: string;
  journeyStatus: string;
  canManage: boolean;
  /** Recarrega a journey após avançar a etapa. */
  onAdvanced?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
  reviewed: "Avaliado",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  reviewed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

export function TestsSection({
  journeyId,
  journeyStatus,
  canManage,
  onAdvanced,
}: TestsSectionProps) {
  const { journeyTests, isLoading, removeTest } = useJourneyTests(journeyId);
  const { sendTokenEmail, sendTokenWhatsApp } = useAdmissionJourneys();
  const [assignOpen, setAssignOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const [viewing, setViewing] = useState<
    (JourneyTest & { test?: { name?: string } }) | null
  >(null);

  const allCompleted =
    journeyTests.length > 0 &&
    journeyTests.every((jt) => jt.status === "completed" || jt.status === "reviewed");

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      // Marca todos os testes como reviewed
      const { error: e1 } = await (supabase as unknown as {
        from: (n: string) => any;
      })
        .from("admission_journey_tests")
        .update({
          status: "reviewed",
          reviewed_at: new Date().toISOString(),
        })
        .eq("journey_id", journeyId)
        .eq("status", "completed");
      if (e1) throw e1;

      // Avança o status do journey
      const { error: e2 } = await supabase
        .from("admission_journeys")
        .update({ status: "docs_pending" })
        .eq("id", journeyId);
      if (e2) throw e2;

      // Loga evento
      await (supabase as unknown as { from: (n: string) => any })
        .from("admission_events")
        .insert({
          journey_id: journeyId,
          kind: "tests_advanced",
          payload: {},
        });

      // Envia link da etapa 2 por email + WhatsApp (paralelo, falha em 1
      // canal não derruba o outro). Toasts internos das mutations já
      // avisam o resultado de cada canal.
      const results = await Promise.allSettled([
        sendTokenEmail.mutateAsync(journeyId),
        sendTokenWhatsApp.mutateAsync(journeyId),
      ]);
      const sent = results.filter((r) => r.status === "fulfilled").length;
      if (sent === 0) {
        toast.warning(
          "Avançado pra etapa 2 — mas as notificações falharam. Use 'Reenviar link' pra tentar de novo.",
        );
      } else {
        toast.success(
          `Avançado pra etapa 2 ✓ — candidato notificado (${sent}/2 canais).`,
        );
      }
      setConfirmAdvance(false);
      onAdvanced?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao avançar");
    } finally {
      setAdvancing(false);
    }
  };

  // Permite atribuir testes em qualquer status não-terminal (mesmo se
  // a admissão já passou pra docs_pending — ex: RH esqueceu de atribuir
  // antes e quer voltar atrás).
  const canAssign =
    journeyStatus !== "admitted" && journeyStatus !== "cancelled";

  // O botão "Avançar pra etapa 2" só faz sentido quando ainda está na
  // fase de testes.
  const stageActive =
    journeyStatus === "created" ||
    journeyStatus === "tests_pending" ||
    journeyStatus === "tests_in_review";

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Testes (Etapa 1)</CardTitle>
            {journeyTests.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {journeyTests.filter((jt) => jt.status === "completed" || jt.status === "reviewed").length} de{" "}
                {journeyTests.length} concluídos
              </p>
            )}
          </div>
          {canAssign && canManage && (
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Atribuir
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : journeyTests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum teste atribuído ainda. Clique em "Atribuir" pra escolher.
            </p>
          ) : (
            journeyTests.map((jt) => {
              const def = getTestDefinition(jt.test_slug);
              return (
                <div
                  key={jt.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border"
                >
                  <Brain className="w-5 h-5 text-primary mt-0.5 shrink-0" weight="duotone" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {jt.test?.name ?? jt.test_slug}
                      </span>
                      <Badge className={`text-[10px] border-0 ${STATUS_COLORS[jt.status]}`}>
                        {STATUS_LABELS[jt.status]}
                      </Badge>
                      {jt.auto_score !== null && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {jt.auto_score}%
                        </span>
                      )}
                    </div>
                    {jt.completed_at && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" weight="fill" />
                        Concluído em {new Date(jt.completed_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {jt.result_summary && jt.test_slug === "disc" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Perfil: <strong>{(jt.result_summary as { profile?: string }).profile}</strong>
                      </p>
                    )}
                    {def && jt.status === "not_started" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {def.questions.length} perguntas · ~{def.estimatedMinutes} min
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {(jt.status === "completed" || jt.status === "reviewed") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewing(jt)}
                        title="Ver respostas"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Visualizar
                      </Button>
                    )}
                    {canManage && canAssign && jt.status === "not_started" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Remover esse teste da admissão?"))
                            removeTest.mutate(jt.id);
                        }}
                        title="Remover"
                      >
                        <Trash className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
        {allCompleted && stageActive && canManage && (
          <CardContent className="border-t pt-4">
            <Button
              onClick={() => setConfirmAdvance(true)}
              disabled={advancing}
              className="w-full"
            >
              {advancing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Avançar pra etapa 2 (dados + docs)
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Ao avançar, o candidato recebe email e WhatsApp com o novo link
              automaticamente.
            </p>
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={confirmAdvance}
        onOpenChange={(open) => !advancing && setConfirmAdvance(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avançar pra etapa 2?</AlertDialogTitle>
            <AlertDialogDescription>
              O candidato vai receber um novo link por email e WhatsApp pra
              preencher os dados pessoais e enviar os documentos. Os testes
              ficam marcados como avaliados e não podem mais ser alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={advancing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleAdvance();
              }}
              disabled={advancing}
            >
              {advancing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Avançar e notificar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignTestsDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        journeyId={journeyId}
        assignedTestIds={journeyTests.map((jt) => jt.test_id)}
        onAssigned={() => {}}
      />

      <TestResultDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        journeyTest={viewing}
      />
    </>
  );
}
