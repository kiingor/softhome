import { useState } from "react";
import { Link } from "react-router-dom";
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
  Calendar,
} from "@phosphor-icons/react";
import { usePayrollPeriods } from "../hooks/use-payroll";
import { OpenPeriodDialog } from "../components/OpenPeriodDialog";
import {
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_COLORS,
  formatPeriodLabel,
} from "../types";
import type { OpenPeriodValues } from "../schemas/payroll.schema";

export default function PeriodosPage() {
  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const { periods, isLoading, openPeriod } = usePayrollPeriods();

  const handleOpen = async (values: OpenPeriodValues) => {
    await openPeriod.mutateAsync(values);
    setIsOpenDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Folha</h1>
          <p className="text-muted-foreground">
            Controle mensal de lançamentos. Não calculamos folha CLT — só
            organizamos pra exportar pro contador.
          </p>
        </div>
        <Button onClick={() => setIsOpenDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Abrir período
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : periods.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Tá vazio por aqui.
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Abre o primeiro período pra começar a controlar a folha.
          </p>
          <Button onClick={() => setIsOpenDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Abrir primeiro período
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês de referência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aberto em</TableHead>
                  <TableHead>Fechado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/50">
                    <TableCell>
                      <span className="font-medium text-foreground">
                        {formatPeriodLabel(p.reference_month)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-normal border-0 ${PERIOD_STATUS_COLORS[p.status]}`}
                      >
                        {PERIOD_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.closed_at
                        ? new Date(p.closed_at).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/dashboard/folha/${p.id}`}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <OpenPeriodDialog
        open={isOpenDialogOpen}
        onOpenChange={setIsOpenDialogOpen}
        onSubmit={handleOpen}
        isSubmitting={openPeriod.isPending}
      />
    </div>
  );
}
