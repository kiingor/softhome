import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CircleNotch as Loader2,
  Plus,
  MagnifyingGlass as Search,
  Briefcase,
} from "@phosphor-icons/react";
import { useJobOpenings } from "../hooks/use-job-openings";
import { JobOpeningForm } from "../components/JobOpeningForm";
import { JobStatusBadge } from "../components/JobStatusBadge";
import {
  REGIME_LABELS,
  type JobOpening,
  type JobOpeningStatus,
} from "../types";
import type { JobOpeningValues } from "../schemas/recruitment.schema";

export default function VagasPage() {
  const [statusFilter, setStatusFilter] = useState<JobOpeningStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobOpening | null>(null);

  const { jobs, isLoading, createJob, updateJob } = useJobOpenings({
    status: statusFilter,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        (j.description ?? "").toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const openNew = () => {
    setEditingJob(null);
    setIsFormOpen(true);
  };

  const openEdit = (job: JobOpening) => {
    setEditingJob(job);
    setIsFormOpen(true);
  };

  const handleSubmit = async (values: JobOpeningValues) => {
    if (editingJob) {
      await updateJob.mutateAsync({ id: editingJob.id, values });
    } else {
      await createJob.mutateAsync(values);
    }
    setIsFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vagas</h1>
          <p className="text-muted-foreground">
            Cadastre e acompanhe os processos seletivos abertos.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nova vaga
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar vaga pelo título ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as JobOpeningStatus | "all")}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="open">Aberta</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
                <SelectItem value="filled">Preenchida</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {search || statusFilter !== "all"
              ? "Nada com esse filtro."
              : "Tá vazio por aqui."}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {search || statusFilter !== "all"
              ? "Tenta ajustar os filtros."
              : "Cadastra a primeira vaga pra começar a receber candidatos."}
          </p>
          {!search && statusFilter === "all" && (
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" />
              Cadastrar primeira vaga
            </Button>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vaga</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vagas</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((j) => (
                  <TableRow key={j.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{j.title}</span>
                        {j.opened_at && (
                          <span className="text-xs text-muted-foreground">
                            Aberta em{" "}
                            {new Date(j.opened_at).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{REGIME_LABELS[j.regime]}</span>
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {j.vacancies_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/dashboard/vagas/${j.id}`}>Pipeline</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(j)}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <JobOpeningForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        job={editingJob}
        onSubmit={handleSubmit}
        isSubmitting={createJob.isPending || updateJob.isPending}
      />
    </div>
  );
}
