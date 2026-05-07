import { useState } from "react";
import { Link } from "react-router-dom";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Confetti,
  ArrowRight,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  useBonusPeriods,
  useOpenBonusPeriod,
} from "../hooks/use-bonus-periods";
import { OpenBonusPeriodDialog } from "../components/OpenBonusPeriodDialog";
import { BONUS_STATUS_LABELS } from "../lib/bonus-types";

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-700",
  pagamento: "bg-amber-100 text-amber-700",
  concluido: "bg-emerald-100 text-emerald-700",
};

export default function Bonus13ListPage() {
  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const { data: periods = [], isLoading } = useBonusPeriods();
  const openMutation = useOpenBonusPeriod();

  const existingYears = periods.map((p) => p.year);

  const handleOpen = async (values: { year: number; notes?: string }) => {
    try {
      const res = await openMutation.mutateAsync(values);
      toast.success(
        `Campanha de ${values.year} aberta — ${res.count} colaborador${res.count === 1 ? "" : "es"} no batch.`,
      );
      setIsOpenDialogOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir campanha");
    }
  };

  return (
    <PermissionGuard module="decimo_terceiro">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Confetti className="w-6 h-6 text-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">13º Salário</h1>
              <p className="text-muted-foreground">
                Campanhas anuais — calcula proporcional, controla parcelas e avisa
                o colaborador.
              </p>
            </div>
          </div>
          <Button onClick={() => setIsOpenDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Abrir campanha
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : periods.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Confetti className="w-8 h-8 text-primary" weight="duotone" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Ainda não tem campanha de 13º por aqui
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Abre a campanha do ano e o sistema lista todos os colaboradores
              ativos com o valor proporcional já calculado.
            </p>
            <Button onClick={() => setIsOpenDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Abrir campanha de {new Date().getFullYear()}
            </Button>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aberto em</TableHead>
                    <TableHead>Pagamento gerado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/50">
                      <TableCell>
                        <span className="font-semibold text-foreground tabular-nums">
                          {p.year}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-normal border-0 ${STATUS_COLORS[p.status] ?? ""}`}
                        >
                          {BONUS_STATUS_LABELS[p.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {new Date(p.opened_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {p.generated_at
                          ? new Date(p.generated_at).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/dashboard/decimo-terceiro/${p.id}`}>
                            Abrir
                            <ArrowRight className="w-4 h-4 ml-1.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <OpenBonusPeriodDialog
          open={isOpenDialogOpen}
          onOpenChange={setIsOpenDialogOpen}
          onSubmit={handleOpen}
          isSubmitting={openMutation.isPending}
          existingYears={existingYears}
        />
      </div>
    </PermissionGuard>
  );
}
