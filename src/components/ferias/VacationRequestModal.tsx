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
import { CircleNotch as Loader2, Calendar, Warning as AlertTriangle } from "@phosphor-icons/react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sendWhatsAppNotification } from "@/lib/whatsappNotifications";

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
  const [notes, setNotes] = useState("");

  // Fetch collaborators
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-active", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name, position, admission_date")
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id && open,
  });

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
      setNotes("");
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
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
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

export default VacationRequestModal;
