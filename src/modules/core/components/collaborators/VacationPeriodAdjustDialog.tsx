import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CircleNotch as Loader2, Sparkle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { vacationPeriodStatusLabels, vacationPeriodStatusColors } from "@/hooks/useVacations";

type VacationPeriod = {
  id: string;
  collaborator_id: string;
  start_date: string;
  end_date: string;
  gozo_start_date: string | null;
  gozo_end_date: string | null;
  data_limite: string | null;
  days_entitled: number;
  days_taken: number;
  days_sold: number;
  days_remaining: number;
  status: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: VacationPeriod | null;
};

// "Situação" simplificada que o RH escolhe. 'pending'/'expired' são travados
// (passam direto pra RPC); 'released' = período ativo, deixa o saldo decidir o
// rótulo real (Disponível / Parcialmente usado / Utilizado).
type Situacao = "pending" | "released" | "expired";

const situacaoFromStatus = (status: string): Situacao => {
  if (status === "pending") return "pending";
  if (status === "expired") return "expired";
  return "released";
};

const toDateInput = (v: string | null): string => (v ? v.slice(0, 10) : "");

export function VacationPeriodAdjustDialog({ open, onOpenChange, period }: Props) {
  const queryClient = useQueryClient();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [gozoStart, setGozoStart] = useState("");
  const [gozoEnd, setGozoEnd] = useState("");
  const [dataLimite, setDataLimite] = useState("");
  const [daysEntitled, setDaysEntitled] = useState(30);
  const [daysTaken, setDaysTaken] = useState(0);
  const [daysSold, setDaysSold] = useState(0);
  const [situacao, setSituacao] = useState<Situacao>("released");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (period) {
      setStartDate(toDateInput(period.start_date));
      setEndDate(toDateInput(period.end_date));
      setGozoStart(toDateInput(period.gozo_start_date));
      setGozoEnd(toDateInput(period.gozo_end_date));
      setDataLimite(toDateInput(period.data_limite));
      setDaysEntitled(period.days_entitled);
      setDaysTaken(period.days_taken);
      setDaysSold(period.days_sold);
      setSituacao(situacaoFromStatus(period.status));
      setNotes("");
    }
  }, [period]);

  const remaining = Math.max(daysEntitled - daysTaken - daysSold, 0);
  const exceeded = daysTaken + daysSold > daysEntitled;
  const gozoIncompleto = !!gozoStart !== !!gozoEnd;
  const gozoInvertido = !!gozoStart && !!gozoEnd && gozoEnd < gozoStart;
  const competenciaInvertida = !!startDate && !!endDate && endDate < startDate;

  // Status final previsto (espelha a normalização da RPC) — só pra mostrar o
  // rótulo certo antes de salvar.
  const previstoStatus =
    situacao === "pending" || situacao === "expired"
      ? situacao
      : remaining <= 0
        ? "used"
        : daysTaken + daysSold > 0
          ? "partially_used"
          : "available";

  const invalid =
    exceeded ||
    gozoIncompleto ||
    gozoInvertido ||
    competenciaInvertida ||
    !startDate ||
    !endDate ||
    daysEntitled <= 0;

  const marcarJaGozado = () => {
    // Tira de "Adquirindo" e zera o saldo (todos os dias do direito como gozados,
    // descontando o que foi vendido). O Período de Gozo o RH preenche à parte,
    // porque competência (janela de 12 meses) ≠ gozo (~30 dias efetivos).
    setSituacao("released");
    setDaysTaken(Math.max(daysEntitled - daysSold, 0));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!period) throw new Error("Período não selecionado");
      const { data, error } = await supabase.rpc("edit_vacation_period_manual", {
        _period_id: period.id,
        _start_date: startDate,
        _end_date: endDate,
        _days_entitled: daysEntitled,
        _days_taken: daysTaken,
        _days_sold: daysSold,
        _status: situacao,
        _gozo_start_date: gozoStart || null,
        _gozo_end_date: gozoEnd || null,
        _data_limite: dataLimite || null,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Período atualizado");
      queryClient.invalidateQueries({ queryKey: ["vacation-periods-collaborator"] });
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Falha ao salvar o período");
    },
  });

  if (!period) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar período aquisitivo</DialogTitle>
          <DialogDescription>
            Ajuste competência, gozo, data limite e saldo. Use pra corrigir
            períodos importados do legado — inclusive marcar férias que já foram
            gozadas mas seguem como “Adquirindo”.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Período de Competência */}
          <div className="space-y-1.5">
            <Label>Período de Competência (aquisitivo)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Início da competência"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Fim da competência"
              />
            </div>
            {competenciaInvertida && (
              <p className="text-xs text-destructive">
                O fim não pode ser antes do início.
              </p>
            )}
          </div>

          {/* Período de Gozo */}
          <div className="space-y-1.5">
            <Label>Período de Gozo (quando as férias foram/serão tiradas)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={gozoStart}
                onChange={(e) => setGozoStart(e.target.value)}
                aria-label="Início do gozo"
              />
              <Input
                type="date"
                value={gozoEnd}
                onChange={(e) => setGozoEnd(e.target.value)}
                aria-label="Fim do gozo"
              />
            </div>
            {gozoIncompleto && (
              <p className="text-xs text-destructive">
                Informe início e fim do gozo (ou deixe os dois vazios).
              </p>
            )}
            {gozoInvertido && (
              <p className="text-xs text-destructive">
                O fim do gozo não pode ser antes do início.
              </p>
            )}
          </div>

          {/* Data Limite */}
          <div className="space-y-1.5">
            <Label htmlFor="data_limite">Data Limite (vencimento concessivo)</Label>
            <Input
              id="data_limite"
              type="date"
              value={dataLimite}
              onChange={(e) => setDataLimite(e.target.value)}
            />
          </div>

          {/* Dias */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="days_entitled">Direito</Label>
              <Input
                id="days_entitled"
                type="number"
                min={1}
                value={daysEntitled}
                onChange={(e) =>
                  setDaysEntitled(Math.max(0, parseInt(e.target.value || "0", 10)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="days_taken">Gozados</Label>
              <Input
                id="days_taken"
                type="number"
                min={0}
                value={daysTaken}
                onChange={(e) =>
                  setDaysTaken(Math.max(0, parseInt(e.target.value || "0", 10)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="days_sold">Vendidos</Label>
              <Input
                id="days_sold"
                type="number"
                min={0}
                value={daysSold}
                onChange={(e) =>
                  setDaysSold(Math.max(0, parseInt(e.target.value || "0", 10)))
                }
              />
            </div>
          </div>

          {/* Situação */}
          <div className="space-y-1.5">
            <Label htmlFor="situacao">Situação</Label>
            <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
              <SelectTrigger id="situacao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Adquirindo (ainda formando direito)</SelectItem>
                <SelectItem value="released">Liberado (o saldo define o rótulo)</SelectItem>
                <SelectItem value="expired">Vencido (direito perdido)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Atalho: já gozou */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={marcarJaGozado}
          >
            <Sparkle className="w-4 h-4 mr-2" />
            Marcar como já gozado (preenche dias e libera)
          </Button>

          {/* Resumo */}
          <div
            className={`rounded-md border p-3 text-sm flex items-center justify-between gap-3 ${
              exceeded ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-muted/50"
            }`}
          >
            {exceeded ? (
              <span>
                Gozados + vendidos excedem o direito de {daysEntitled} dias.
              </span>
            ) : (
              <span>
                Saldo após o ajuste:{" "}
                <strong>{remaining} dia{remaining === 1 ? "" : "s"}</strong>
              </span>
            )}
            <Badge variant="outline" className={vacationPeriodStatusColors[previstoStatus] || ""}>
              {vacationPeriodStatusLabels[previstoStatus] || previstoStatus}
            </Badge>
          </div>

          {/* Observação */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação (opcional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Ex: férias já gozadas conforme planilha legada"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || invalid}>
            {save.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
