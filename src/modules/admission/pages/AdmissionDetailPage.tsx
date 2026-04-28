import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  ArrowLeft,
  Copy,
  ArrowsClockwise as RefreshCw,
  CircleNotch as Loader2,
  Trophy,
  XCircle,
} from "@phosphor-icons/react";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  useAdmissionJourney,
  useAdmissionJourneys,
  buildCandidateFormUrl,
} from "../hooks/use-admission-journeys";
import { useAdmissionDocuments } from "../hooks/use-admission-documents";
import { AdmissionStatusBadge } from "../components/AdmissionStatusBadge";
import { DocumentList } from "../components/DocumentList";
import { AdmissionTimeline } from "../components/AdmissionTimeline";
import { REGIME_LABELS, type AdmissionJourneyStatus } from "../types";

export default function AdmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasAnyRole } = useDashboard();
  const canManage = hasAnyRole(["admin_gc", "gestor_gc"]);

  const { data: journey, isLoading } = useAdmissionJourney(id);
  const { documents } = useAdmissionDocuments(id);
  const { updateStatus, regenerateToken } = useAdmissionJourneys();

  const [confirmAction, setConfirmAction] = useState<
    "cancel" | "admit" | null
  >(null);

  const docsStats = useMemo(() => {
    const total = documents.length;
    const approved = documents.filter((d) => d.status === "approved").length;
    const pending = documents.filter(
      (d) => d.status === "pending" || d.status === "submitted"
    ).length;
    const needsAdjustment = documents.filter(
      (d) => d.status === "needs_adjustment"
    ).length;
    return { total, approved, pending, needsAdjustment };
  }, [documents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Admissão não encontrada.</p>
        <Button asChild variant="outline">
          <Link to="/dashboard/admissoes">Voltar pra lista</Link>
        </Button>
      </div>
    );
  }

  const candidateUrl = buildCandidateFormUrl(journey.access_token);
  const tokenExpired =
    journey.token_expires_at && new Date(journey.token_expires_at) < new Date();

  const handleCopy = () => {
    navigator.clipboard
      .writeText(candidateUrl)
      .then(() => toast.success("Link copiado ✓"))
      .catch(() => toast.error("Não rolou copiar."));
  };

  const handleStatusChange = (status: AdmissionJourneyStatus, message?: string) => {
    updateStatus.mutate({ id: journey.id, status, message });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/dashboard/admissoes">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Admissões
          </Link>
        </Button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {journey.candidate_name}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <AdmissionStatusBadge status={journey.status} />
              <span className="text-sm text-muted-foreground">
                {REGIME_LABELS[journey.regime]}
              </span>
              {journey.candidate_email && (
                <span className="text-sm text-muted-foreground">
                  · {journey.candidate_email}
                </span>
              )}
            </div>
          </div>

          {/* Ações de status */}
          {canManage && journey.status !== "admitted" && journey.status !== "cancelled" && (
            <div className="flex flex-wrap gap-2">
              {docsStats.approved === docsStats.total && docsStats.total > 0 && (
                <Button
                  onClick={() => setConfirmAction("admit")}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Admitir
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setConfirmAction("cancel")}
                className="text-destructive hover:text-destructive"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancelar admissão
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Link público pro candidato */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link pro candidato preencher</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 min-w-[280px] text-xs bg-muted px-3 py-2 rounded font-mono break-all">
              {candidateUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-2" />
              Copiar
            </Button>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => regenerateToken.mutate(journey.id)}
                disabled={regenerateToken.isPending}
              >
                {regenerateToken.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Regenerar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {tokenExpired ? (
              <span className="text-destructive">
                Link expirado em{" "}
                {new Date(journey.token_expires_at!).toLocaleDateString("pt-BR")}.
                Regenera pra reativar.
              </span>
            ) : journey.token_expires_at ? (
              <>
                Válido até{" "}
                {new Date(journey.token_expires_at).toLocaleDateString("pt-BR")}.
              </>
            ) : (
              "Sem expiração."
            )}
          </p>
          {/* TODO: Sessão futura — botão "Enviar por email" usando Resend */}
        </CardContent>
      </Card>

      {/* Stats docs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBlock label="Total" value={docsStats.total} />
        <StatBlock label="Aprovados" value={docsStats.approved} accent="emerald" />
        <StatBlock label="Pendentes" value={docsStats.pending} />
        <StatBlock
          label="Precisam ajuste"
          value={docsStats.needsAdjustment}
          accent="orange"
        />
      </div>

      {/* Documentos */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentList journeyId={journey.id} canManage={canManage} />
        </CardContent>
      </Card>

      {/* Notas internas */}
      {journey.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações internas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {journey.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <AdmissionTimeline journeyId={journey.id} canAddNote={canManage} />
        </CardContent>
      </Card>

      {/* Confirma ações destrutivas */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "cancel"
                ? "Cancelar admissão?"
                : "Confirmar admissão?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "cancel"
                ? "O processo será encerrado. Documentos enviados ficam preservados, mas o candidato não consegue mais acessar o link."
                : `${journey.candidate_name} será admitido. Essa ação registra o evento e atualiza o status. Após admitir, o RH ainda precisa cadastrar o colaborador no sistema (passo manual nesta versão).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction === "cancel") {
                  handleStatusChange("cancelled", "Admissão cancelada");
                  navigate("/dashboard/admissoes");
                } else if (confirmAction === "admit") {
                  handleStatusChange("admitted", `${journey.candidate_name} admitido`);
                }
                setConfirmAction(null);
              }}
              className={
                confirmAction === "cancel"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }
            >
              {confirmAction === "cancel" ? "Cancelar admissão" : "Admitir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "orange";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p
          className={`text-2xl font-light mt-1 ${
            accent === "emerald"
              ? "text-emerald-700 dark:text-emerald-400"
              : accent === "orange"
              ? "text-orange-700 dark:text-orange-400"
              : "text-foreground"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
