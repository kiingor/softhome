import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  CircleNotch as Loader2,
  Plus,
  Lock,
  LockOpen,
  Download,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  usePayrollEntries,
  usePayrollAlerts,
} from "../hooks/use-payroll";
import { NewEntryDialog } from "../components/NewEntryDialog";
import {
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_COLORS,
  ENTRY_TYPE_LABELS,
  ALERT_KIND_LABELS,
  ALERT_SEVERITY_COLORS,
  formatPeriodLabel,
  isEarning,
  isDeduction,
} from "../types";
import type { NewEntryValues } from "../schemas/payroll.schema";
import { exportPayrollExcel } from "../services/payroll-export.service";
import { formatCurrency } from "@/lib/formatters";

export default function PeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentCompany, hasAnyRole } = useDashboard();
  const canManage = hasAnyRole(["admin_gc", "gestor_gc"]);

  const {
    period,
    entries,
    isLoading,
    createEntry,
    reverseEntry,
    closePeriod,
    reopenPeriod,
  } = usePayrollEntries(id);

  const { data: alerts = [] } = usePayrollAlerts(id);

  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"close" | "reopen" | null>(
    null
  );
  const [reversingEntry, setReversingEntry] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const stats = useMemo(() => {
    let earnings = 0;
    let deductions = 0;
    const byCollab = new Set<string>();
    for (const e of entries) {
      const v = Number(e.value);
      if (isEarning(e.type)) earnings += v;
      else if (isDeduction(e.type)) deductions += v;
      byCollab.add(e.collaborator_id);
    }
    return {
      total: entries.length,
      earnings,
      deductions,
      net: earnings - deductions,
      collaborators: byCollab.size,
    };
  }, [entries]);

  if (isLoading || !period) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isOpen = period.status === "open";
  const isClosed = period.status === "closed" || period.status === "exported";

  const handleNewEntry = async (values: NewEntryValues) => {
    await createEntry.mutateAsync(values);
    setIsNewEntryOpen(false);
  };

  const handleReverse = async () => {
    if (!reversingEntry) return;
    if (reverseReason.length < 5) {
      toast.error("Conta um pouco mais o motivo (mín 5 caracteres).");
      return;
    }
    await reverseEntry.mutateAsync({
      entryId: reversingEntry,
      values: { reason: reverseReason },
    });
    setReversingEntry(null);
    setReverseReason("");
  };

  const handleExport = () => {
    if (entries.length === 0) {
      toast.error("Nada pra exportar — período sem lançamentos.");
      return;
    }
    try {
      const filesCount = exportPayrollExcel({
        period,
        entries,
        companyName: currentCompany?.company_name ?? "Empresa",
        cnpj: null, // TODO: companies.cnpj quando disponível no context
      });
      toast.success(
        `Pronto ✓ ${filesCount} arquivo${filesCount === 1 ? "" : "s"} baixado${filesCount === 1 ? "" : "s"}.`
      );
    } catch (err) {
      toast.error("Não rolou exportar. Tenta de novo?");
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/dashboard/folha">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Folha
          </Link>
        </Button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {formatPeriodLabel(period.reference_month)}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Badge
                variant="outline"
                className={`font-normal border-0 ${PERIOD_STATUS_COLORS[period.status]}`}
              >
                {PERIOD_STATUS_LABELS[period.status]}
              </Badge>
              {period.closed_at && (
                <span className="text-sm text-muted-foreground">
                  · fechado em{" "}
                  {new Date(period.closed_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExport} disabled={entries.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
            {canManage && isOpen && (
              <>
                <Button onClick={() => setIsNewEntryOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo lançamento
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmAction("close")}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Fechar período
                </Button>
              </>
            )}
            {canManage && isClosed && (
              <Button
                variant="outline"
                onClick={() => setConfirmAction("reopen")}
              >
                <LockOpen className="w-4 h-4 mr-2" />
                Reabrir
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBlock label="Lançamentos" value={String(stats.total)} />
        <StatBlock label="Pessoas" value={String(stats.collaborators)} />
        <StatBlock
          label="Proventos"
          value={formatCurrency(stats.earnings)}
          accent="emerald"
        />
        <StatBlock
          label="Líquido"
          value={formatCurrency(stats.net)}
          accent={stats.net >= 0 ? "emerald" : "rose"}
        />
      </div>

      {/* Alerts pendentes */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Alertas pendentes ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 py-2 text-sm"
                >
                  <Badge
                    variant="outline"
                    className={`font-normal border-0 ${ALERT_SEVERITY_COLORS[a.severity]}`}
                  >
                    {a.severity}
                  </Badge>
                  <span className="text-muted-foreground">
                    {ALERT_KIND_LABELS[a.kind]}
                  </span>
                  <span className="flex-1">
                    {a.collaborator?.name && (
                      <strong className="text-foreground">
                        {a.collaborator.name}
                      </strong>
                    )}{" "}
                    — {a.message}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Lançamentos */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lançamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground mb-2">
                Mês ainda zerado.
              </p>
              {canManage && isOpen && (
                <Button onClick={() => setIsNewEntryOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Lançar primeiro
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const earning = isEarning(e.type);
                  const value = Number(e.value);
                  return (
                    <TableRow key={e.id} className="hover:bg-muted/50">
                      <TableCell>
                        <span className="text-sm text-foreground">
                          {e.collaborator?.name ?? "(sem nome)"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {ENTRY_TYPE_LABELS[e.type] ?? e.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {e.description ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm font-mono ${
                          value < 0
                            ? "text-rose-700 dark:text-rose-300"
                            : earning
                            ? "text-orange-700 dark:text-orange-300"
                            : "text-foreground"
                        }`}
                      >
                        {value < 0 ? "" : earning ? "+ " : "- "}
                        {formatCurrency(Math.abs(value))}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && isClosed && value > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReversingEntry(e.id)}
                            className="text-xs"
                          >
                            Estornar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewEntryDialog
        open={isNewEntryOpen}
        onOpenChange={setIsNewEntryOpen}
        onSubmit={handleNewEntry}
        isSubmitting={createEntry.isPending}
      />

      {/* Confirmar fechar/reabrir */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "close" ? "Fechar período?" : "Reabrir período?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "close"
                ? "Após fechar, lançamentos viram read-only. Pra mudar algo, vai ter que estornar via novo lançamento. É reversível, mas marca data de fechamento."
                : "Período volta a aceitar novos lançamentos e edições. Use só se realmente precisa corrigir antes de exportar pro contador."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction === "close") closePeriod.mutate();
                else if (confirmAction === "reopen") reopenPeriod.mutate();
                setConfirmAction(null);
              }}
            >
              {confirmAction === "close" ? "Fechar" : "Reabrir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Estorno */}
      <AlertDialog
        open={!!reversingEntry}
        onOpenChange={(o) => !o && setReversingEntry(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Cria um lançamento contrário (valor negativo) com referência ao
              original. O lançamento aprovado fica preservado pra auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo do estorno</label>
            <textarea
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
              rows={3}
              placeholder="Por que precisou estornar?"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReverseReason("")}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleReverse}>Estornar</AlertDialogAction>
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
  value: string;
  accent?: "emerald" | "rose";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p
          className={`text-xl font-light mt-1 ${
            accent === "emerald"
              ? "text-orange-700 dark:text-orange-400"
              : accent === "rose"
              ? "text-rose-700 dark:text-rose-400"
              : "text-foreground"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
