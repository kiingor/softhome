import { Fragment, useMemo, useState } from "react";
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
  CaretRight,
  CaretDown,
  Info,
  ArrowsClockwise as RefreshCw,
} from "@phosphor-icons/react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentsTab } from "../components/PaymentsTab";
import { toast } from "sonner";
import { useDashboard } from "@/contexts/DashboardContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePayrollEntries,
  usePayrollAlerts,
  usePayrollPeriods,
} from "../hooks/use-payroll";
import { NewEntryDialog } from "../components/NewEntryDialog";
import {
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_COLORS,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_COLORS,
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
  const paymentsPermission = usePermissions("folha_pagamentos");
  const canViewPayments = paymentsPermission.canView || paymentsPermission.isAdmin;
  const canManagePayments = canManage && (paymentsPermission.canEdit || paymentsPermission.isAdmin);

  const {
    period,
    entries,
    isLoading,
    createEntry,
    reverseEntry,
    closePeriod,
    reopenPeriod,
  } = usePayrollEntries(id);
  const { recalculateTaxes } = usePayrollPeriods();
  const [confirmRecalc, setConfirmRecalc] = useState(false);

  const { data: alerts = [] } = usePayrollAlerts(id);

  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"close" | "reopen" | null>(
    null
  );
  const [reversingEntry, setReversingEntry] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [expandedCollabs, setExpandedCollabs] = useState<Set<string>>(new Set());

  const toggleCollab = (id: string) => {
    setExpandedCollabs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Tipos de imposto que são absorvidos pelo "Salário base" no display
  // (INSS/IRPF/FGTS aparecem na exportação pro contador, mas na UI ficam
  // somados dentro da linha de salário pra ficar menos confuso).
  const TAX_TYPES = new Set(["inss", "irpf", "fgts"]);

  const groupedByCollab = useMemo(() => {
    type DisplayEntry = (typeof entries)[number] & {
      _adjustedValue?: number;
      _taxesApplied?: { inss?: number; irpf?: number; fgts?: number };
    };
    type Group = {
      id: string;
      name: string;
      entries: DisplayEntry[];
      taxBreakdown: { inss: number; irpf: number; fgts: number };
      net: number;
    };
    const map = new Map<string, Group>();
    for (const e of entries) {
      const collabId = e.collaborator_id ?? "_orphan";
      if (!map.has(collabId)) {
        map.set(collabId, {
          id: collabId,
          name: e.collaborator?.name ?? "(sem nome)",
          entries: [],
          taxBreakdown: { inss: 0, irpf: 0, fgts: 0 },
          net: 0,
        });
      }
      const g = map.get(collabId)!;
      const v = Number(e.value);
      if (TAX_TYPES.has(e.type)) {
        g.taxBreakdown[e.type as "inss" | "irpf" | "fgts"] += v;
        g.net -= v;
      } else {
        g.entries.push(e);
        g.net += isEarning(e.type) ? v : -v;
      }
    }
    // Ajusta valores exibidos:
    // - Salário base absorve INSS + FGTS sempre, e a parte do IRPF que cabe a ele.
    // - Gratificação absorve só a parte do IRPF que cabe a ela (regra do user:
    //   gratificação só desconta IRPF).
    // - IRPF é distribuído proporcionalmente entre salário base + gratificações
    //   pelo valor bruto de cada um.
    for (const g of map.values()) {
      const { inss, irpf, fgts } = g.taxBreakdown;
      const salaryEntry = g.entries.find((e) => e.type === "salario_base");
      const gratEntries = g.entries.filter((e) => e.type === "gratificacao");

      const irpfBase =
        (salaryEntry ? Number(salaryEntry.value) : 0) +
        gratEntries.reduce((s, e) => s + Number(e.value), 0);

      // Aloca IRPF proporcionalmente; resto vai pra última entrada pra fechar contas.
      const targets: Array<{ entry: DisplayEntry; gross: number }> = [];
      if (salaryEntry)
        targets.push({ entry: salaryEntry, gross: Number(salaryEntry.value) });
      for (const e of gratEntries)
        targets.push({ entry: e, gross: Number(e.value) });

      const irpfShares = new Map<string, number>();
      if (irpf > 0 && irpfBase > 0) {
        let allocated = 0;
        targets.forEach((t, i) => {
          const share =
            i === targets.length - 1
              ? irpf - allocated
              : Math.round(((irpf * t.gross) / irpfBase) * 100) / 100;
          allocated += share;
          irpfShares.set(t.entry.id, share);
        });
      }

      // Aplica deduções
      if (salaryEntry) {
        const irpfPart = irpfShares.get(salaryEntry.id) ?? 0;
        const total = inss + fgts + irpfPart;
        if (total > 0) {
          salaryEntry._adjustedValue = Number(salaryEntry.value) - total;
          salaryEntry._taxesApplied = {
            inss: inss || undefined,
            irpf: irpfPart || undefined,
            fgts: fgts || undefined,
          };
        }
      }
      for (const e of gratEntries) {
        const irpfPart = irpfShares.get(e.id) ?? 0;
        if (irpfPart > 0) {
          e._adjustedValue = Number(e.value) - irpfPart;
          e._taxesApplied = { irpf: irpfPart };
        }
      }
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [entries]);

  const allExpanded =
    groupedByCollab.length > 0 &&
    groupedByCollab.every((g) => expandedCollabs.has(g.id));

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedCollabs(new Set());
    } else {
      setExpandedCollabs(new Set(groupedByCollab.map((g) => g.id)));
    }
  };

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
                  onClick={() => setConfirmRecalc(true)}
                  title="Recalcula INSS/IRPF/FGTS pela tabela 2026"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Recalcular encargos
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

      {/* Tabs: Lançamentos (RH) / Pagamentos (Financeiro) */}
      <Tabs defaultValue="lancamentos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          {canViewPayments && (
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          )}
        </TabsList>

        {canViewPayments && (
          <TabsContent value="pagamentos">
            <Card>
              <CardHeader>
                <CardTitle>Pagamentos</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Valores líquidos (com INSS e IRPF já descontados conforme a
                  tabela 2026). Benefícios, FGTS e lançamentos estornados ficam
                  fora. Passa o mouse no ícone <Info className="inline w-3 h-3 mx-0.5 text-amber-600" weight="fill" /> pra ver bruto/desconto/líquido.
                </p>
              </CardHeader>
              <CardContent>
                <PaymentsTab
                  periodId={period.id}
                  entries={entries}
                  canManage={canManagePayments}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="lancamentos">

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
            <>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs text-muted-foreground">
                  {groupedByCollab.length} colaborador
                  {groupedByCollab.length === 1 ? "" : "es"} · {entries.length}{" "}
                  lançamento{entries.length === 1 ? "" : "s"}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="text-xs h-7"
                >
                  {allExpanded ? "Recolher todos" : "Expandir todos"}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedByCollab.map((g) => {
                    const isOpen = expandedCollabs.has(g.id);
                    return (
                      <Fragment key={g.id}>
                        <TableRow
                          className="hover:bg-muted/50 cursor-pointer bg-muted/20"
                          onClick={() => toggleCollab(g.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2 font-medium">
                              {isOpen ? (
                                <CaretDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <CaretRight className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span>{g.name}</span>
                            </div>
                          </TableCell>
                          <TableCell
                            colSpan={2}
                            className="text-xs text-muted-foreground"
                          >
                            {g.entries.length} lançamento
                            {g.entries.length === 1 ? "" : "s"}
                          </TableCell>
                          <TableCell
                            className={`text-right text-sm font-mono font-semibold ${
                              g.net >= 0
                                ? "text-orange-700 dark:text-orange-300"
                                : "text-rose-700 dark:text-rose-300"
                            }`}
                          >
                            {g.net >= 0 ? "+ " : "- "}
                            {formatCurrency(Math.abs(g.net))}
                          </TableCell>
                        </TableRow>
                        {isOpen &&
                          g.entries.map((e) => {
                            const earning = isEarning(e.type);
                            const isAdjusted = e._adjustedValue !== undefined;
                            const value = isAdjusted
                              ? e._adjustedValue!
                              : Number(e.value);
                            const taxes = e._taxesApplied;
                            const deductions: Array<{
                              label: string;
                              value: number;
                            }> = [];
                            if (isAdjusted && taxes) {
                              if (taxes.inss)
                                deductions.push({ label: "INSS", value: taxes.inss });
                              if (taxes.irpf)
                                deductions.push({ label: "IRPF", value: taxes.irpf });
                              if (taxes.fgts)
                                deductions.push({ label: "FGTS", value: taxes.fgts });
                            }
                            return (
                              <TableRow
                                key={e.id}
                                className="hover:bg-muted/30"
                              >
                                <TableCell className="pl-10 text-xs text-muted-foreground">
                                  ↳
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                                      ENTRY_TYPE_COLORS[e.type] ??
                                      "bg-muted text-muted-foreground border-border"
                                    }`}
                                  >
                                    {ENTRY_TYPE_LABELS[e.type] ?? e.type}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-xs">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="truncate">
                                      {e.description ?? "—"}
                                    </span>
                                    {isAdjusted && deductions.length > 0 && (
                                      <HoverCard openDelay={150} closeDelay={100}>
                                        <HoverCardTrigger asChild>
                                          <button
                                            type="button"
                                            className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                                            aria-label="Ver detalhes do líquido"
                                            onClick={(ev) => ev.stopPropagation()}
                                          >
                                            <Info className="w-3.5 h-3.5" weight="fill" />
                                          </button>
                                        </HoverCardTrigger>
                                        <HoverCardContent
                                          align="start"
                                          className="w-64 text-xs"
                                        >
                                          <div className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-2 text-foreground">
                                              <span className="text-muted-foreground">
                                                Bruto
                                              </span>
                                              <span className="font-mono">
                                                {formatCurrency(Number(e.value))}
                                              </span>
                                            </div>
                                            {deductions.map((d) => (
                                              <div
                                                key={d.label}
                                                className="flex items-center justify-between gap-2 text-rose-700 dark:text-rose-300"
                                              >
                                                <span>− {d.label}</span>
                                                <span className="font-mono">
                                                  {formatCurrency(d.value)}
                                                </span>
                                              </div>
                                            ))}
                                            <div className="border-t border-border pt-1.5 flex items-center justify-between gap-2 font-medium">
                                              <span>Líquido</span>
                                              <span className="font-mono text-orange-700 dark:text-orange-300">
                                                {formatCurrency(value)}
                                              </span>
                                            </div>
                                          </div>
                                        </HoverCardContent>
                                      </HoverCard>
                                    )}
                                  </div>
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
                              </TableRow>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      <NewEntryDialog
        open={isNewEntryOpen}
        onOpenChange={setIsNewEntryOpen}
        onSubmit={handleNewEntry}
        isSubmitting={createEntry.isPending}
      />

      {/* Confirmar recalcular encargos */}
      <AlertDialog
        open={confirmRecalc}
        onOpenChange={(o) => !recalculateTaxes.isPending && setConfirmRecalc(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular encargos do período?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga os lançamentos de INSS, IRPF e FGTS desse mês e recria
              usando a tabela oficial 2026 (com base nos dependentes
              cadastrados em cada colaborador). Salário base, gratificações,
              benefícios e descontos manuais ficam intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recalculateTaxes.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (period) {
                  recalculateTaxes.mutate(
                    { reference_month: period.reference_month },
                    { onSuccess: () => setConfirmRecalc(false) },
                  );
                }
              }}
              disabled={recalculateTaxes.isPending}
            >
              {recalculateTaxes.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Recalcular agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
