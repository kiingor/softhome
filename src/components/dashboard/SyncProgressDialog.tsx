// Modal de progresso pra syncs longas (sync-collaborators etc.).
//
// Padrão "fire-and-poll":
//   • Caller dispara a edge function que devolve { jobId }
//   • Abre este modal com o jobId
//   • Modal polla sync_jobs WHERE id=jobId a cada 1.2s
//   • Mostra barra de progresso, etapa atual, contadores, erros, lista final
//   • User pode fechar o modal sem cancelar o job — reabrir mostra estado atual
//
// Quando status=completed/failed/cancelled, polling para. Pode mostrar
// resumo final e botão Fechar.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CircleNotch as Loader2,
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { clearSyncJobId } from "@/lib/sync-job-storage";

export type SyncJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SyncJobRow {
  id: string;
  company_id: string;
  resource: string;
  status: SyncJobStatus;
  current_step: string | null;
  total: number;
  processed: number;
  inserted: number;
  updated: number;
  deactivated: number;
  errors: Array<{ external_id?: string; name?: string; error: string; kind?: string }>;
  options: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
  /** Chamado quando o job termina (completed/failed/cancelled). */
  onFinished?: (job: SyncJobRow) => void;
}

export function SyncProgressDialog({ open, onOpenChange, jobId, onFinished }: Props) {
  const queryClient = useQueryClient();
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["sync-job", jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data, error } = await supabase
        .from("sync_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SyncJobRow | null;
    },
    enabled: !!jobId && open,
    // Polla enquanto job tá rodando. Para quando terminar.
    refetchInterval: (query) => {
      const j = query.state.data as SyncJobRow | null | undefined;
      if (!j) return 1200;
      return j.status === "running" || j.status === "pending" ? 1200 : false;
    },
    refetchIntervalInBackground: true,
  });

  const isTerminal =
    job?.status === "completed" || job?.status === "failed" || job?.status === "cancelled";

  // Dispara onFinished uma vez quando entra em estado terminal
  useEffect(() => {
    if (job && isTerminal) {
      onFinished?.(job);
      // Limpa o jobId persistido — sync acabou, próximo "Sincronizar" começa nova
      clearSyncJobId(job.company_id, job.resource);
      // Refresh queries que dependem dos dados sincronizados
      if (job.resource === "collaborators") {
        queryClient.invalidateQueries({ queryKey: ["collaborators"] });
        queryClient.invalidateQueries({ queryKey: ["collaborators-for-payroll"] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminal, job?.id]);

  const percent = useMemo(() => {
    if (!job || job.total === 0) return 0;
    if (job.status === "completed") return 100;
    return Math.min(100, Math.round((job.processed / job.total) * 100));
  }, [job?.total, job?.processed, job?.status]);

  const renderStatus = () => {
    if (!job) return null;
    if (job.status === "completed") {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
          <CheckCircle className="w-3 h-3 mr-1" weight="fill" /> Concluído
        </Badge>
      );
    }
    if (job.status === "failed") {
      return (
        <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-0">
          <XCircle className="w-3 h-3 mr-1" weight="fill" /> Falhou
        </Badge>
      );
    }
    if (job.status === "cancelled") {
      return (
        <Badge variant="secondary">
          <Warning className="w-3 h-3 mr-1" weight="fill" /> Cancelado
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Em andamento
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && isTerminal && onOpenChange(o)}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => !isTerminal && e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <ArrowsClockwise className={cn("w-5 h-5", !isTerminal && "animate-spin text-primary")} />
              Sincronizando colaboradores
            </DialogTitle>
            {renderStatus()}
          </div>
          <DialogDescription>
            {job?.current_step ?? (isLoading ? "Carregando..." : "Aguardando início...")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barra de progresso */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">
                {job?.processed ?? 0} / {job?.total ?? 0}
              </span>
              <span className="font-mono">{percent}%</span>
            </div>
            <Progress value={percent} className="h-2" />
          </div>

          {/* Contadores */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Inseridos" value={job?.inserted ?? 0} color="emerald" />
            <Stat label="Atualizados" value={job?.updated ?? 0} color="blue" />
            <Stat label="Desativados" value={job?.deactivated ?? 0} color="amber" />
          </div>

          {/* Resumo opcional do result final */}
          {isTerminal && job?.result && (
            <FinalSummary result={job.result} />
          )}

          {/* Erros */}
          {(job?.errors?.length ?? 0) > 0 && (
            <div className="rounded border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <button
                type="button"
                onClick={() => setErrorsExpanded(!errorsExpanded)}
                className="flex items-center justify-between w-full text-sm font-medium text-amber-800 dark:text-amber-200"
              >
                <span className="flex items-center gap-1.5">
                  {errorsExpanded ? <CaretDown className="w-3.5 h-3.5" /> : <CaretRight className="w-3.5 h-3.5" />}
                  {job!.errors.length} erro{job!.errors.length === 1 ? "" : "s"}
                </span>
              </button>
              {errorsExpanded && (
                <ul className="mt-2 space-y-1 max-h-40 overflow-auto text-xs text-amber-900 dark:text-amber-100">
                  {job!.errors.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="font-mono shrink-0 text-amber-700 dark:text-amber-300">
                        {e.external_id ?? "—"}
                      </span>
                      <span className="truncate">
                        {e.name ? `${e.name}: ` : ""}{e.error}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Erro fatal */}
          {job?.status === "failed" && job.error_message && (
            <div className="rounded border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-sm text-rose-800 dark:text-rose-200">
              <strong>Falha fatal:</strong> {job.error_message}
            </div>
          )}

          {/* Dica quando está rodando */}
          {!isTerminal && (
            <p className="text-xs text-muted-foreground italic">
              Você pode fechar este modal sem parar a sincronização — ela continua
              no servidor. Pra ver o progresso de novo, clique em Sincronizar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant={isTerminal ? "default" : "outline"}
            onClick={() => onOpenChange(false)}
          >
            {isTerminal ? "Fechar" : "Fechar (continua em segundo plano)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: "emerald" | "blue" | "amber" | "rose" }) {
  const colorMap = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    blue: "text-blue-700 dark:text-blue-300",
    amber: "text-amber-700 dark:text-amber-300",
    rose: "text-rose-700 dark:text-rose-300",
  };
  return (
    <div className="rounded border bg-card p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className={cn("text-lg font-bold font-mono mt-0.5", colorMap[color])}>
        {value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function FinalSummary({ result }: { result: Record<string, unknown> }) {
  const financials = result.financials as { processed?: number; errors?: number } | null | undefined;
  const details = result.details as { processed?: number; errors?: number } | null | undefined;
  return (
    <div className="rounded border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs space-y-1">
      <p className="font-medium text-emerald-800 dark:text-emerald-200">Resumo final</p>
      <p className="text-emerald-900 dark:text-emerald-100">
        {String(result.fetched ?? 0)} colaboradores buscados da agenda.
      </p>
      {financials && (
        <p className="text-emerald-900 dark:text-emerald-100">
          Financeiros aplicados em {financials.processed ?? 0} colab{financials.processed === 1 ? "" : "s"}
          {financials.errors ? ` (${financials.errors} com erro)` : ""}.
        </p>
      )}
      {details && (
        <p className="text-emerald-900 dark:text-emerald-100">
          Detalhes sincronizados em {details.processed ?? 0} colab{details.processed === 1 ? "" : "s"}
          {details.errors ? ` (${details.errors} com erro)` : ""}.
        </p>
      )}
    </div>
  );
}
