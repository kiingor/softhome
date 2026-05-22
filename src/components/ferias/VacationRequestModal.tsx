import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { useCreateVacationRequest, useCollaboratorVacationPeriods, VacationPeriod, vacationPeriodStatusLabels } from "@/hooks/useVacations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CircleNotch as Loader2, Calendar, Warning as AlertTriangle, Info } from "@phosphor-icons/react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sendWhatsAppNotification } from "@/lib/whatsappNotifications";
import { calcVacation } from "@/lib/payroll/vacationCalc";
import { formatCurrency, formatDateBR } from "@/lib/formatters";
import { calcVacationPaymentDate } from "@/lib/payroll/vacationCalc";

interface VacationRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedCollaboratorId?: string;
}

const VacationRequestModal = ({ open, onOpenChange, preSelectedCollaboratorId }: VacationRequestModalProps) => {
  const { currentCompany, user } = useDashboard();
  const createRequest = useCreateVacationRequest();

  const [collaboratorId, setCollaboratorId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hasSellDays, setHasSellDays] = useState(false);
  const [sellDays, setSellDays] = useState(0);
  const [gratifications, setGratifications] = useState(0);
  const [bonifications, setBonifications] = useState(0);
  const [notes, setNotes] = useState("");

  // Fetch collaborators — inclui current_salary e dependents_count
  // pra alimentar o cálculo de férias.
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-active-with-salary", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name, position, admission_date, current_salary, dependents_count, regime")
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id && open,
  });

  const selectedCollab = useMemo(
    () => collaborators.find((c) => c.id === collaboratorId) ?? null,
    [collaborators, collaboratorId],
  );

  // Auto-puxa gratificação/bonificação do colab — pega o MÊS MAIS RECENTE
  // com lançamentos desses tipos (excluindo as que vieram de outras férias)
  // e soma cada tipo.
  const { data: latestExtras = null } = useQuery({
    queryKey: ["collab-latest-extras-for-vacation", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return null;
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("type, value, month, year, external_id")
        .eq("collaborator_id", collaboratorId)
        .in("type", ["gratificacao", "bonificacao"])
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) return null;

      // Exclui entries criadas POR outras vacation_requests (external_id 'ferias-*')
      // — essas são adicionais de outro recibo, não a renda mensal do colab.
      const recurring = data.filter((r) => {
        const ext = (r as { external_id: string | null }).external_id;
        return !(typeof ext === "string" && ext.startsWith("ferias-"));
      });
      if (recurring.length === 0) return null;

      const top = recurring[0] as { year: number; month: number };
      const latestMonthRows = recurring.filter(
        (r) => (r as { year: number }).year === top.year && (r as { month: number }).month === top.month,
      );
      let grat = 0;
      let boni = 0;
      for (const r of latestMonthRows) {
        const v = Number((r as { value: number }).value);
        if ((r as { type: string }).type === "gratificacao") grat += v;
        else if ((r as { type: string }).type === "bonificacao") boni += v;
      }
      return {
        month: top.month,
        year: top.year,
        gratifications: Math.round(grat * 100) / 100,
        bonifications: Math.round(boni * 100) / 100,
      };
    },
    enabled: !!collaboratorId && open,
    // Sempre busca fresco quando o modal abre — evita cache stale servindo
    // null quando o user adicionou grat/boni na folha entre uma abertura e outra.
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Quando o auto-load termina, popula os inputs (só na 1ª vez por colab).
  // Ref pra controlar: se user já editou os campos, não sobrescreve.
  const [extrasAutoLoaded, setExtrasAutoLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!latestExtras || !collaboratorId) return;
    if (extrasAutoLoaded === collaboratorId) return; // já carregou pra esse colab
    setGratifications(latestExtras.gratifications);
    setBonifications(latestExtras.bonifications);
    setExtrasAutoLoaded(collaboratorId);
  }, [latestExtras, collaboratorId, extrasAutoLoaded]);

  // Fetch periods for selected collaborator
  const { data: periods = [], isLoading: loadingPeriods } = useCollaboratorVacationPeriods(collaboratorId || undefined);

  const availablePeriods = useMemo(() => {
    return periods.filter(p => p.status === "available" || p.status === "partially_used" || p.status === "pending");
  }, [periods]);

  const selectedPeriod = useMemo(() => {
    return availablePeriods.find(p => p.id === periodId);
  }, [availablePeriods, periodId]);

  const daysCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const diff = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  const maxSellDays = useMemo(() => {
    if (!selectedPeriod) return 0;
    return Math.min(10, Math.floor(selectedPeriod.days_remaining / 3));
  }, [selectedPeriod]);

  // Cálculo de férias ao vivo — atualiza com mudança em qualquer input relevante.
  const vacationCalc = useMemo(() => {
    if (!selectedCollab) return null;
    const salary = Number(selectedCollab.current_salary ?? 0);
    if (!(salary > 0)) return null;
    if (!startDate || !endDate) return null;
    if (daysCount <= 0) return null;
    return calcVacation({
      salary,
      daysTaken: daysCount,
      daysSold: hasSellDays ? sellDays : 0,
      dependents: Number(selectedCollab.dependents_count ?? 0),
      gratifications,
      bonifications,
    });
  }, [selectedCollab, startDate, endDate, daysCount, hasSellDays, sellDays, gratifications, bonifications]);

  const paymentDate = useMemo(
    () => (startDate ? calcVacationPaymentDate(startDate) : null),
    [startDate],
  );

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!collaboratorId) errors.push("Selecione um colaborador");
    if (!periodId) errors.push("Selecione um período aquisitivo");
    if (!startDate || !endDate) errors.push("Informe as datas de início e fim");
    if (daysCount < 5) errors.push("O período mínimo é de 5 dias corridos");
    if (selectedPeriod && daysCount + (hasSellDays ? sellDays : 0) > selectedPeriod.days_remaining) {
      errors.push(`Saldo insuficiente. Disponível: ${selectedPeriod.days_remaining} dias`);
    }
    if (hasSellDays && sellDays > maxSellDays) {
      errors.push(`Máximo de ${maxSellDays} dias de abono pecuniário`);
    }
    if (hasSellDays && sellDays <= 0) {
      errors.push("Informe a quantidade de dias do abono");
    }
    return errors;
  }, [collaboratorId, periodId, startDate, endDate, daysCount, selectedPeriod, hasSellDays, sellDays, maxSellDays]);

  // Reset form
  useEffect(() => {
    if (open) {
      setCollaboratorId(preSelectedCollaboratorId || "");
      setPeriodId("");
      setStartDate("");
      setEndDate("");
      setHasSellDays(false);
      setSellDays(0);
      setGratifications(0);
      setBonifications(0);
      setNotes("");
      setExtrasAutoLoaded(null);
    }
  }, [open, preSelectedCollaboratorId]);

  // Auto-select first available period
  useEffect(() => {
    if (availablePeriods.length > 0 && !periodId) {
      setPeriodId(availablePeriods[0].id);
    }
  }, [availablePeriods, periodId]);

  const handleSubmit = async () => {
    if (validationErrors.length > 0 || !currentCompany || !user) return;

    await createRequest.mutateAsync({
      collaborator_id: collaboratorId,
      company_id: currentCompany.id,
      vacation_period_id: periodId,
      start_date: startDate,
      end_date: endDate,
      days_count: daysCount,
      sell_days: hasSellDays ? sellDays : 0,
      gratifications,
      bonifications,
      requested_by: user.id,
      notes: notes || undefined,
    });

    // Send WhatsApp notification
    sendWhatsAppNotification(currentCompany.id, collaboratorId, "vacation_starting", {
      data_inicio: startDate,
      data_fim: endDate,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Nova Solicitação de Férias
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Collaborator Select */}
          <div className="space-y-2">
            <Label>Colaborador</Label>
            <Select value={collaboratorId} onValueChange={(v) => { setCollaboratorId(v); setPeriodId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o colaborador" />
              </SelectTrigger>
              <SelectContent>
                {collaborators.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.position ? `- ${c.position}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vacation Period Select */}
          {collaboratorId && (
            <div className="space-y-2">
              <Label>Período Aquisitivo</Label>
              {loadingPeriods ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando períodos...
                </div>
              ) : availablePeriods.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                  <AlertTriangle className="w-4 h-4" />
                  Nenhum período aquisitivo disponível. Verifique a data de admissão.
                </div>
              ) : (
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o período" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePeriods.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {format(parseISO(p.start_date), "dd/MM/yyyy")} a {format(parseISO(p.end_date), "dd/MM/yyyy")} — Saldo: {p.days_remaining} dias
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedPeriod && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dias de direito:</span>
                    <span className="font-medium">{selectedPeriod.days_entitled}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Já gozados:</span>
                    <span className="font-medium">{selectedPeriod.days_taken}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vendidos (abono):</span>
                    <span className="font-medium">{selectedPeriod.days_sold}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground font-medium">Saldo disponível:</span>
                    <span className="font-bold text-primary">{selectedPeriod.days_remaining} dias</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {daysCount > 0 && (
            <div className="bg-primary/5 rounded-lg p-3 text-center">
              <span className="text-sm text-muted-foreground">Total de dias: </span>
              <span className="font-bold text-primary text-lg">{daysCount}</span>
              {hasSellDays && sellDays > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  ({daysCount} gozo + {sellDays} abono)
                </span>
              )}
            </div>
          )}

          {/* Cálculo financeiro ao vivo */}
          {vacationCalc && (
            <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">Cálculo das férias</h4>
                <HoverCard openDelay={150}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
                      aria-label="Como o cálculo é feito"
                    >
                      <Info className="w-4 h-4" weight="fill" />
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent align="end" className="w-80 text-xs space-y-1.5">
                    <p className="font-medium">Como calculamos</p>
                    <p>• <strong>Férias</strong> = salário × (dias gozados ÷ 30)</p>
                    <p>• <strong>1/3</strong> = férias ÷ 3 (constitucional)</p>
                    <p>• <strong>Abono</strong> (vendido) = mesma fórmula, mas <strong>isento</strong> de INSS/IRRF</p>
                    <p>• <strong>INSS</strong> = tabela 2026 sobre férias + 1/3 (dias gozados)</p>
                    <p>• <strong>IRRF</strong> = tabela 2026 sobre (base − INSS), sem redutor</p>
                    <p>• <strong>Líquido</strong> = bruto − INSS − IRRF</p>
                  </HoverCardContent>
                </HoverCard>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Salário base: <strong className="text-foreground font-mono">{formatCurrency(vacationCalc.salary)}</strong>
                  </span>
                  {vacationCalc.gratifications > 0 && (
                    <span>
                      Gratificação: <strong className="text-foreground font-mono">{formatCurrency(vacationCalc.gratifications)}</strong>
                    </span>
                  )}
                  {vacationCalc.gratifications > 0 && (
                    <span>
                      Rem. base: <strong className="text-foreground font-mono">{formatCurrency(vacationCalc.remuneracao_base)}</strong>
                    </span>
                  )}
                  <span>
                    Dependentes: <strong className="text-foreground">{vacationCalc.dependents}</strong>
                  </span>
                  {paymentDate && (
                    <span>
                      Pagamento (D-2): <strong className="text-foreground">{formatDateBR(paymentDate.toISOString().slice(0, 10))}</strong>
                    </span>
                  )}
                </div>
                {latestExtras && (latestExtras.gratifications > 0 || latestExtras.bonifications > 0) && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Gratificação e bonificação puxadas da folha de {String(latestExtras.month).padStart(2, "0")}/{latestExtras.year}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Proventos */}
                <div className="rounded border bg-emerald-50/40 dark:bg-emerald-950/10 p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Proventos
                  </p>
                  <Row
                    label={`Férias (${vacationCalc.daysTaken} dias)`}
                    value={formatCurrency(vacationCalc.valor_ferias)}
                  />
                  {vacationCalc.gratificacao_valor > 0 && (
                    <Row
                      label="Gratificação s/ Férias"
                      sub="proporcional aos dias gozados"
                      value={formatCurrency(vacationCalc.gratificacao_valor)}
                    />
                  )}
                  <Row
                    label="1/3 sobre férias"
                    value={formatCurrency(vacationCalc.um_terco_ferias)}
                  />
                  {vacationCalc.daysSold > 0 && (
                    <>
                      <Row
                        label={`Abono (${vacationCalc.daysSold} dias)`}
                        value={formatCurrency(vacationCalc.valor_abono)}
                        muted
                      />
                      <Row
                        label="1/3 sobre abono"
                        value={formatCurrency(vacationCalc.um_terco_abono)}
                        muted
                      />
                    </>
                  )}
                  {vacationCalc.valor_bonificacao > 0 && (
                    <Row
                      label="Bonificação (livre)"
                      sub="sem 1/3, sem tributar"
                      value={formatCurrency(vacationCalc.valor_bonificacao)}
                    />
                  )}
                  <div className="border-t border-emerald-200 dark:border-emerald-900/40 pt-1.5 mt-1.5">
                    <Row
                      label="Bruto"
                      value={formatCurrency(vacationCalc.bruto)}
                      bold
                    />
                  </div>
                </div>

                {/* Descontos + Líquido */}
                <div className="rounded border bg-rose-50/40 dark:bg-rose-950/10 p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                    Descontos
                  </p>
                  <Row
                    label="INSS"
                    sub={`base R$ ${vacationCalc.base_inss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                    value={formatCurrency(vacationCalc.inss)}
                  />
                  <Row
                    label="IRRF"
                    sub={`base R$ ${vacationCalc.base_irrf.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                    value={formatCurrency(vacationCalc.irrf)}
                  />
                  <div className="border-t border-rose-200 dark:border-rose-900/40 pt-1.5 mt-1.5">
                    <Row
                      label="Líquido"
                      value={formatCurrency(vacationCalc.liquido)}
                      bold
                      className="text-emerald-700 dark:text-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {vacationCalc.daysSold > 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  Abono pecuniário (dias vendidos) é <strong>isento de INSS e IR</strong> conforme art. 144 CLT + IN RFB 1500/2014.
                </p>
              )}
            </div>
          )}

          {selectedCollab && !vacationCalc && daysCount > 0 && !Number(selectedCollab.current_salary ?? 0) && (
            <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-3 text-xs text-yellow-800 dark:text-yellow-200">
              ⚠️ Colaborador sem salário cadastrado. O cálculo das férias só aparece quando o salário base estiver preenchido no cadastro.
            </div>
          )}

          {/* Abono Pecuniário */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sell-days"
                checked={hasSellDays}
                onCheckedChange={(checked) => {
                  setHasSellDays(!!checked);
                  if (!checked) setSellDays(0);
                }}
              />
              <Label htmlFor="sell-days" className="cursor-pointer">
                Abono Pecuniário (vender dias)
              </Label>
            </div>
            {hasSellDays && (
              <div className="space-y-1 pl-6">
                <Input
                  type="number"
                  min={1}
                  max={maxSellDays}
                  value={sellDays || ""}
                  onChange={e => setSellDays(Number(e.target.value))}
                  placeholder={`Máx. ${maxSellDays} dias`}
                />
                <p className="text-xs text-muted-foreground">
                  O colaborador pode vender até 1/3 das férias (máx. {maxSellDays} dias)
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observações opcionais..."
              rows={2}
            />
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && startDate && endDate && (
            <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
              {validationErrors.map((error, i) => (
                <p key={i} className="text-sm text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {error}
                </p>
              ))}
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full"
            variant="hero"
            onClick={handleSubmit}
            disabled={validationErrors.length > 0 || createRequest.isPending}
          >
            {createRequest.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</>
            ) : (
              "Criar Solicitação"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Linha do breakdown — label esquerda, valor mono à direita, sub opcional embaixo do label.
function Row({
  label,
  value,
  sub,
  muted,
  bold,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className={`${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : "text-foreground"} truncate`}>
          {label}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
      <span className={`font-mono shrink-0 ${bold ? "font-semibold" : ""} ${className ?? ""}`}>
        {value}
      </span>
    </div>
  );
}

export default VacationRequestModal;
