import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Pencil,
  CircleNotch as Loader2,
  LinkSimple,
  ListChecks,
  Trash,
  DotsThreeVertical,
} from "@phosphor-icons/react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  useJobOpening,
  useJobApplications,
  useJobOpenings,
  useCreateJourneyFromApplication,
} from "../hooks/use-job-openings";
import { JobOpeningForm } from "../components/JobOpeningForm";
import { JobStatusBadge } from "../components/JobStatusBadge";
import { DroppablePipelineColumn } from "../components/DroppablePipelineColumn";
import { ApplicationCard } from "../components/ApplicationCard";
import { PipelineStagesDialog } from "../components/PipelineStagesDialog";
import {
  DEFAULT_STAGES,
  REGIME_LABELS,
  STAGE_LABELS,
  TERMINAL_STAGES,
  type ApplicationStage,
  type CandidateApplicationWithCandidate,
} from "../types";
import type { JobOpeningValues } from "../schemas/recruitment.schema";
import { NewAdmissionForm } from "@/modules/admission/components/NewAdmissionForm";
import { useAdmissionJourneys } from "@/modules/admission/hooks/use-admission-journeys";
import type { NewAdmissionValues } from "@/modules/admission/schemas/admission.schema";
import { useNavigate } from "react-router-dom";

export default function VagaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useJobOpening(id);
  const { applications, isLoading: appsLoading, moveStage } = useJobApplications(id);
  const { updateJob, updateJobStages, deleteJob } = useJobOpenings();
  const linkApplication = useCreateJourneyFromApplication();
  const { createJourney } = useAdmissionJourneys();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [stagesDialogOpen, setStagesDialogOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [admissionFormOpen, setAdmissionFormOpen] = useState(false);
  const [pendingApp, setPendingApp] = useState<
    CandidateApplicationWithCandidate | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Etapas do pipeline da vaga (com fallback caso job ainda esteja carregando)
  const pipelineStages: ApplicationStage[] =
    (job as { pipeline_stages?: string[] } | undefined)?.pipeline_stages ??
    DEFAULT_STAGES;

  const lastStage = pipelineStages[pipelineStages.length - 1];

  const grouped = useMemo(() => {
    const map = new Map<ApplicationStage, CandidateApplicationWithCandidate[]>();
    for (const stage of pipelineStages) map.set(stage, []);
    for (const app of applications) {
      if (TERMINAL_STAGES.includes(app.stage) && app.stage !== "accepted")
        continue;
      if (!map.has(app.stage)) map.set(app.stage, []);
      map.get(app.stage)!.push(app);
    }
    return map;
  }, [applications, pipelineStages]);

  const rejectedAndWithdrawn = applications.filter(
    (a) => a.stage === "rejected" || a.stage === "withdrawn",
  );

  const draggedApp = activeDragId
    ? applications.find((a) => a.id === activeDragId)
    : null;

  const handleEditSubmit = async (values: JobOpeningValues) => {
    if (!job) return;
    await updateJob.mutateAsync({ id: job.id, values });
    setEditOpen(false);
  };

  const handleSaveStages = async (stages: string[]) => {
    if (!job) return;
    await updateJobStages.mutateAsync({ id: job.id, stages });
    setStagesDialogOpen(false);
  };

  const handleStartAdmission = (app: CandidateApplicationWithCandidate) => {
    if (!app.candidate || !job) return;
    setPendingApp(app);
    setAdmissionFormOpen(true);
  };

  const handleAdmissionSubmit = async (values: NewAdmissionValues) => {
    const journey = await createJourney.mutateAsync(values);
    if (pendingApp) {
      // Vincula admissão à application e marca aplicação como 'accepted'
      try {
        await linkApplication.mutateAsync({
          journeyId: journey.id,
          applicationId: pendingApp.id,
        });
      } catch {
        // toast já é dado pelo hook
      }
    }
    setAdmissionFormOpen(false);
    setPendingApp(null);
    if (journey?.id) navigate(`/dashboard/admissoes/${journey.id}`);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    if (!e.over) return;
    const overId = String(e.over.id);
    if (!overId.startsWith("stage:")) return;
    const newStage = overId.slice("stage:".length);
    const fromStage = e.active.data.current?.fromStage;
    if (fromStage === newStage) return;
    const applicationId = String(e.active.id);
    moveStage.mutate({ applicationId, stage: newStage });
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
          <div className="flex items-center gap-2">
            {job.status === "open" && (
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    .writeText(`${window.location.origin}/aplicar/${job.id}`)
                    .then(() => toast.success("Link de candidatura copiado ✓"))
                    .catch(() => toast.error("Não rolou copiar."));
                }}
              >
                <LinkSimple className="w-4 h-4 mr-2" />
                Copiar URL
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar vaga
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title="Mais ações">
                  <DotsThreeVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setStagesDialogOpen(true)}>
                  <ListChecks className="w-4 h-4 mr-2" />
                  Editar pipeline
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash className="w-4 h-4 mr-2" />
                  Excluir vaga
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

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

      {/* Link público de candidatura */}
      {job.status === "open" && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <LinkSimple className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Link público de candidatura
              </span>
            </div>
            <code className="flex-1 min-w-0 text-xs bg-muted/50 px-3 py-2 rounded font-mono truncate select-all">
              {`${window.location.origin}/aplicar/${job.id}`}
            </code>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    .writeText(`${window.location.origin}/aplicar/${job.id}`)
                    .then(() => toast.success("Link copiado ✓"))
                    .catch(() => toast.error("Não rolou copiar."));
                }}
              >
                Copiar
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a
                  href={`/aplicar/${job.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Pipeline</h2>
            <Badge variant="secondary" className="font-normal">
              {applications.length}{" "}
              {applications.length === 1 ? "candidato" : "candidatos"}
            </Badge>
          </div>
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
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 overflow-x-auto pb-2">
              {pipelineStages.map((stage) => (
                <DroppablePipelineColumn
                  key={stage}
                  stage={stage}
                  applications={grouped.get(stage) ?? []}
                  onMoveStage={(applicationId, newStage) =>
                    moveStage.mutate({ applicationId, stage: newStage })
                  }
                  onStartAdmission={
                    stage === lastStage ? handleStartAdmission : undefined
                  }
                />
              ))}
            </div>
            <DragOverlay>
              {draggedApp && (
                <div className="opacity-90 rotate-1 scale-105 shadow-lg">
                  <ApplicationCard
                    application={draggedApp}
                    onMoveStage={() => {}}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

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

      <PipelineStagesDialog
        open={stagesDialogOpen}
        onOpenChange={setStagesDialogOpen}
        initialStages={pipelineStages}
        onSave={handleSaveStages}
        isSaving={updateJobStages.isPending}
      />

      <NewAdmissionForm
        open={admissionFormOpen}
        onOpenChange={(o) => {
          setAdmissionFormOpen(o);
          if (!o) setPendingApp(null);
        }}
        onSubmit={handleAdmissionSubmit}
        isSubmitting={createJourney.isPending}
        initialValues={
          pendingApp && job
            ? {
                candidate_name: pendingApp.candidate?.name ?? "",
                candidate_email: pendingApp.candidate?.email ?? "",
                candidate_phone: pendingApp.candidate?.phone ?? "",
                regime: job.regime,
                position_id: job.position_id ?? "",
              }
            : undefined
        }
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vaga?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove a vaga "{job.title}" e todas as candidaturas
              vinculadas a ela. As admissões já criadas dessa vaga não são
              apagadas, mas perdem o vínculo. Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteJob.mutateAsync(job.id);
                navigate("/dashboard/vagas");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
