import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Users,
  Eye,
} from "@phosphor-icons/react";
import { useCandidates } from "../hooks/use-candidates";
import { NewCandidateForm } from "../components/NewCandidateForm";
import type { CandidateManualValues } from "../schemas/recruitment.schema";
import { formatCPF } from "@/lib/validators";

export default function CandidatosPage() {
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "active"
  );
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { candidates, isLoading, createCandidate } = useCandidates({
    isActive: activeFilter === "all" ? "all" : activeFilter === "active",
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.trim().toLowerCase();
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.cpf ?? "").includes(q)
    );
  }, [candidates, search]);

  const handleSubmit = async (values: CandidateManualValues) => {
    await createCandidate.mutateAsync(values);
    setIsFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Banco de Talentos</h1>
          <p className="text-muted-foreground">
            Currículos e candidatos guardados pra futuras vagas.
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Cadastrar candidato
        </Button>
      </div>

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
              value={activeFilter}
              onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Pediram saída</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
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
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {search ? "Nada com esse filtro." : "Tá vazio por aqui."}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {search
              ? "Tenta ajustar a busca."
              : "Cadastra um candidato manualmente, ou espera o primeiro se inscrever pelo formulário público (em breve)."}
          </p>
          {!search && (
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Cadastrar primeiro candidato
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
                  <TableHead>CPF</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">CV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {c.name}
                          {!c.is_active && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-xs font-normal"
                            >
                              Pediu saída
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {c.cpf ? formatCPF(c.cpf) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.source ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.cv_url ? (
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={c.cv_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Ver CV
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sem CV
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <NewCandidateForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleSubmit}
        isSubmitting={createCandidate.isPending}
      />
    </div>
  );
}
