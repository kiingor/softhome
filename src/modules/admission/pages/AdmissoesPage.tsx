import { useMemo, useState } from "react";
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
  UserPlus,
} from "@phosphor-icons/react";
import { useAdmissionJourneys } from "../hooks/use-admission-journeys";
import { NewAdmissionForm } from "../components/NewAdmissionForm";
import { AdmissionStatusBadge } from "../components/AdmissionStatusBadge";
import {
  REGIME_LABELS,
  type AdmissionJourneyStatus,
  type CollaboratorRegime,
} from "../types";
import type { NewAdmissionValues } from "../schemas/admission.schema";

export default function AdmissoesPage() {
  const [statusFilter, setStatusFilter] = useState<AdmissionJourneyStatus | "all">(
    "all"
  );
  const [regimeFilter, setRegimeFilter] = useState<CollaboratorRegime | "all">("all");
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { journeys, isLoading, createJourney } = useAdmissionJourneys({
    status: statusFilter,
    regime: regimeFilter,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return journeys;
    const q = search.trim().toLowerCase();
    return journeys.filter(
      (j) =>
        j.candidate_name.toLowerCase().includes(q) ||
        (j.candidate_email ?? "").toLowerCase().includes(q) ||
        (j.candidate_cpf ?? "").includes(q)
    );
  }, [journeys, search]);

  const handleSubmit = async (values: NewAdmissionValues) => {
    await createJourney.mutateAsync(values);
    setIsFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admissões</h1>
          <p className="text-muted-foreground">
            Acompanhe os processos de contratação em andamento.
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova admissão
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar pelo nome, email ou CPF..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as AdmissionJourneyStatus | "all")}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="docs_pending">Aguardando docs</SelectItem>
                <SelectItem value="docs_in_review">Em revisão</SelectItem>
                <SelectItem value="docs_needs_adjustment">Pedindo ajuste</SelectItem>
                <SelectItem value="docs_approved">Docs aprovados</SelectItem>
                <SelectItem value="exam_scheduled">Exame agendado</SelectItem>
                <SelectItem value="exam_done">Exame feito</SelectItem>
                <SelectItem value="contract_signed">Contrato assinado</SelectItem>
                <SelectItem value="admitted">Admitido</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={regimeFilter}
              onValueChange={(v) => setRegimeFilter(v as CollaboratorRegime | "all")}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos regimes</SelectItem>
                <SelectItem value="clt">CLT</SelectItem>
                <SelectItem value="pj">PJ</SelectItem>
                <SelectItem value="estagiario">Estagiário</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {search || statusFilter !== "all" || regimeFilter !== "all"
              ? "Nada com esse filtro."
              : "Tá vazio por aqui."}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {search || statusFilter !== "all" || regimeFilter !== "all"
              ? "Tenta ajustar os filtros."
              : "Bora cadastrar a primeira admissão pra começar?"}
          </p>
          {!search && statusFilter === "all" && regimeFilter === "all" && (
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Cadastrar primeira admissão
            </Button>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((j) => (
                  <TableRow key={j.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {j.candidate_name}
                        </span>
                        {j.candidate_email && (
                          <span className="text-xs text-muted-foreground">
                            {j.candidate_email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{REGIME_LABELS[j.regime]}</span>
                    </TableCell>
                    <TableCell>
                      <AdmissionStatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(j.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/dashboard/admissoes/${j.id}`}>Ver</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <NewAdmissionForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleSubmit}
        isSubmitting={createJourney.isPending}
      />
    </div>
  );
}
