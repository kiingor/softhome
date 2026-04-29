import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Pencil,
  CircleNotch as Loader2,
} from "@phosphor-icons/react";
import {
  useJobOpening,
  useJobApplications,
  useJobOpenings,
  useStartAdmissionFromApplication,
} from "../hooks/use-job-openings";
import { JobOpeningForm } from "../components/JobOpeningForm";
import { JobStatusBadge } from "../components/JobStatusBadge";
import { PipelineColumn } from "../components/PipelineColumn";
import {
  ACTIVE_STAGES,
  REGIME_LABELS,
  STAGE_LABELS,
  type ApplicationStage,
  type CandidateApplicationWithCandidate,
} from "../types";
import type { JobOpeningValues } from "../schemas/recruitment.schema";

export default function VagaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useJobOpening(id);
  const { applications, isLoading: appsLoading, moveStage } = useJobApplications(id);
  const { updateJob } = useJobOpenings();
  const startAdmission = useStartAdmissionFromApplication();

  const [editOpen, setEditOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<ApplicationStage, CandidateApplicationWithCandidate[]>();
    for (const stage of ACTIVE_STAGES) map.set(stage, []);
    for (const app of applications) {
      const list = map.get(app.stage) ?? [];
      list.push(app);
      map.set(app.stage, list);
    }
    return map;
  }, [applications]);

  const rejectedAndWithdrawn = applications.filter(
    (a) => a.stage === "rejected" || a.stage === "withdrawn"
  );

  const handleEditSubmit = async (values: JobOpeningValues) => {
    if (!job) return;
    await updateJob.mutateAsync({ id: job.id, values });
    setEditOpen(false);
  };

  const handleStartAdmission = async (app: CandidateApplicationWithCandidate) => {
    if (!app.candidate || !job) return;
    const journey = await startAdmission.mutateAsync({
      applicationId: app.id,
      candidateName: app.candidate.name,
      candidateEmail: app.candidate.email ?? "",
      candidateCpf: null, // CPF não vem no select de candidate; preenche depois
      regime: job.regime,
      positionId: job.position_id,
    });
    if (journey?.id) {
      navigate(`/dashboard/admissoes/${journey.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Vaga não encontrada.</p>
        <Button asChild variant="outline">
          <Link to="/dashboard/vagas">Voltar pra lista</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/dashboard/vagas">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Vagas
          </Link>
        </Button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{job.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <JobStatusBadge status={job.status} />
              <span className="text-sm text-muted-foreground">
                {REGIME_LABELS[job.regime]}
              </span>
              <span className="text-sm text-muted-foreground">
                · {job.vacancies_count}{" "}
                {job.vacancies_count === 1 ? "vaga" : "vagas"}
              </span>
              {job.opened_at && (
                <span className="text-sm text-muted-foreground">
                  · aberta em {new Date(job.opened_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Editar vaga
          </Button>
        </div>
      </div>

      {/* Descrição + requisitos colapsável */}
      {(job.description || job.requirements) && (
        <Card>
          <CardContent className="p-5 space-y-3">
            {job.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Descrição
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {job.description}
                </p>
              </div>
            )}
            {job.requirements && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Requisitos
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {job.requirements}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Pipeline</h2>
          <Badge variant="secondary" className="font-normal">
            {applications.length}{" "}
            {applications.length === 1 ? "candidato" : "candidatos"}
          </Badge>
        </div>

        {appsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : applications.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Ainda não chegou ninguém. Bora divulgar a vaga?
            </p>
            <p className="text-xs text-muted-foreground">
              {job.status === "draft"
                ? "Mude o status pra 'Aberta' antes de compartilhar."
                : "Compartilha o link da vaga ou cadastra candidatos manualmente em Banco de Talentos."}
            </p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {ACTIVE_STAGES.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                applications={grouped.get(stage) ?? []}
                onMoveStage={(applicationId, newStage) =>
                  moveStage.mutate({ applicationId, stage: newStage })
                }
                onStartAdmission={
                  stage === "accepted" ? handleStartAdmission : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Rejeitados / desistentes (collapsible group) */}
      {rejectedAndWithdrawn.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Encerrados ({rejectedAndWithdrawn.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {rejectedAndWithdrawn.map((app) => (
                <li
                  key={app.id}
                  className="flex items-center justify-between gap-3 text-sm py-2 border-b border-border last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground">
                      {app.candidate?.name ?? "(sem nome)"}
                    </span>
                    {app.rejected_reason && (
                      <span className="text-muted-foreground ml-2">
                        — {app.rejected_reason}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {STAGE_LABELS[app.stage]}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <JobOpeningForm
        open={editOpen}
        onOpenChange={setEditOpen}
        job={job}
        onSubmit={handleEditSubmit}
        isSubmitting={updateJob.isPending}
      />
    </div>
  );
}
