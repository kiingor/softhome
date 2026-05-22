// Dialog "Adiantar Férias" — lista vacation_requests aprovadas da company
// e permite mover qualquer uma pra esta folha (mês corrente do período).
//
// Use case típico: férias do colab está pra ser paga na folha de agosto
// (porque o gozo começa em setembro), mas RH quer adiantar pra junho.
// Selecionar aqui → confirma → entries são movidas pra junho.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import {
  CircleNotch as Loader2,
  Calendar,
  MagnifyingGlass,
  ArrowRight,
} from "@phosphor-icons/react";
import { useAdvanceVacationToPeriod } from "@/hooks/useVacations";
import { formatCurrency, formatDateBR, toTitleCase } from "@/lib/formatters";
import type { VacationCalcResult } from "@/lib/payroll/vacationCalc";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Mês corrente do período (1-12). */
  targetMonth: number;
  /** Ano corrente do período. */
  targetYear: number;
}

interface ApprovedVacationRow {
  id: string;
  collaborator_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  sell_days: number | null;
  payroll_month: number | null;
  payroll_year: number | null;
  posted_to_payroll: boolean;
  calculation_snapshot: VacationCalcResult | null;
  collaborator: { name: string; cpf: string } | null;
}

export function VacationAdvanceDialog({
  open,
  onOpenChange,
  companyId,
  targetMonth,
  targetYear,
}: Props) {
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<ApprovedVacationRow | null>(null);
  const advance = useAdvanceVacationToPeriod();

  // Lista todas as approvas da company. Não filtramos por payroll_month
  // pra mostrar todas — o user decide qual adiantar.
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["vacation-requests-approved", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select(`
          id, collaborator_id, start_date, end_date, days_count, sell_days,
          payroll_month, payroll_year, posted_to_payroll, calculation_snapshot,
          collaborator:collaborators(name, cpf)
        `)
        .eq("company_id", companyId)
        .eq("status", "approved")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ApprovedVacationRow[];
    },
    enabled: open && !!companyId,
  });

  const targetLabel = `${String(targetMonth).padStart(2, "0")}/${targetYear}`;

  // Filtro: oculta as que JÁ estão nesta folha (não faz sentido adiantar pra cá)
  // + busca por nome
  const normalized = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = useMemo(() => {
    const q = normalized(search.trim());
    return requests.filter((r) => {
      const alreadyHere =
        r.posted_to_payroll &&
        r.payroll_month === targetMonth &&
        r.payroll_year === targetYear;
      if (alreadyHere) return false;
      if (!q) return true;
      return normalized(r.collaborator?.name ?? "").includes(q);
    });
  }, [requests, search, targetMonth, targetYear]);

  const handleConfirm = async () => {
    if (!confirming) return;
    await advance.mutateAsync({
      requestId: confirming.id,
      targetMonth,
      targetYear,
    });
    setConfirming(null);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Adiantar Férias pra folha {targetLabel}
            </DialogTitle>
            <DialogDescription>
              Selecione uma solicitação aprovada. O lançamento (provento + 1/3
              + grat/boni + INSS/IRRF) será movido pra esta folha — se já
              tinha sido lançado em outro mês, as entries antigas são apagadas
              automaticamente.
            </DialogDescription>
          </DialogHeader>

          {/* Busca */}
          <div className="relative">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar colaborador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {search.trim()
                ? "Nenhum colaborador encontrado com esse nome."
                : requests.length === 0
                  ? "Nenhuma férias aprovada na empresa."
                  : `Todas as férias aprovadas já estão na folha de ${targetLabel}.`}
            </div>
          ) : (
            <div className="border rounded-md divide-y divide-border max-h-[50vh] overflow-y-auto">
              {visible.map((r) => {
                const liquido = r.calculation_snapshot?.liquido ?? 0;
                const origem = r.posted_to_payroll && r.payroll_month && r.payroll_year
                  ? `Folha de ${String(r.payroll_month).padStart(2, "0")}/${r.payroll_year}`
                  : "Não lançada em nenhuma folha ainda";
                return (
                  <div
                    key={r.id}
                    className="px-3 py-2.5 hover:bg-muted/30 transition-colors flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {toTitleCase(r.collaborator?.name) || "(sem nome)"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Gozo: {formatDateBR(r.start_date)} a {formatDateBR(r.end_date)}
                        {" · "}
                        {r.days_count} dias
                        {(r.sell_days ?? 0) > 0 && ` + ${r.sell_days} abono`}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 italic mt-0.5">
                        {origem}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {formatCurrency(liquido)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">líquido</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirming(r)}
                      className="shrink-0"
                    >
                      <ArrowRight className="w-4 h-4 mr-1" />
                      Adiantar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação */}
      <AlertDialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar adiantamento?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  As férias do colaborador <strong>{toTitleCase(confirming?.collaborator?.name)}</strong> serão
                  lançadas na folha de <strong>{targetLabel}</strong>.
                </p>
                {confirming?.posted_to_payroll && confirming.payroll_month && (
                  <p className="text-amber-700 dark:text-amber-400">
                    ⚠️ O lançamento atual em <strong>
                      {String(confirming.payroll_month).padStart(2, "0")}/{confirming.payroll_year}
                    </strong> será apagado e recriado em {targetLabel}.
                  </p>
                )}
                <p className="text-xs text-muted-foreground pt-1">
                  Valor líquido: <strong>{formatCurrency(confirming?.calculation_snapshot?.liquido ?? 0)}</strong>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={advance.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={advance.isPending}>
              {advance.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Movendo...</>
              ) : (
                "Confirmar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
