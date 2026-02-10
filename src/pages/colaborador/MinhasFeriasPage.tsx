import { useMemo, useState } from "react";
import { usePortal } from "@/contexts/PortalContext";
import { useCollaboratorVacationPeriods, useCollaboratorVacationRequests, useCreateVacationRequest, vacationRequestStatusLabels, vacationRequestStatusColors, vacationPeriodStatusLabels, vacationPeriodStatusColors } from "@/hooks/useVacations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Plus, Loader2, AlertTriangle, Palmtree } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const MinhasFeriasPage = () => {
  const { collaborator, user } = usePortal();
  const { data: periods = [], isLoading: loadingPeriods } = useCollaboratorVacationPeriods(collaborator?.id);
  const { data: requests = [], isLoading: loadingRequests } = useCollaboratorVacationRequests(collaborator?.id);
  const createRequest = useCreateVacationRequest();

  const [requestOpen, setRequestOpen] = useState(false);
  const [periodId, setPeriodId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hasSellDays, setHasSellDays] = useState(false);
  const [sellDays, setSellDays] = useState(0);
  const [notes, setNotes] = useState("");

  const availablePeriods = useMemo(() => periods.filter(p => p.status === "available" || p.status === "partially_used"), [periods]);
  const totalAvailable = useMemo(() => availablePeriods.reduce((acc, p) => acc + p.days_remaining, 0), [availablePeriods]);
  const selectedPeriod = useMemo(() => availablePeriods.find(p => p.id === periodId), [availablePeriods, periodId]);

  const daysCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return Math.max(0, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1);
  }, [startDate, endDate]);

  const maxSellDays = selectedPeriod ? Math.min(10, Math.floor(selectedPeriod.days_remaining / 3)) : 0;

  const handleSubmit = async () => {
    if (!collaborator || !user || !periodId || daysCount < 5) return;
    await createRequest.mutateAsync({
      collaborator_id: collaborator.id,
      company_id: collaborator.company_id,
      vacation_period_id: periodId,
      start_date: startDate,
      end_date: endDate,
      days_count: daysCount,
      sell_days: hasSellDays ? sellDays : 0,
      requested_by: user.id,
      notes: notes || undefined,
    });
    setRequestOpen(false);
    setPeriodId("");
    setStartDate("");
    setEndDate("");
    setHasSellDays(false);
    setSellDays(0);
    setNotes("");
  };

  const isLoading = loadingPeriods || loadingRequests;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minhas Férias</h1>
          <p className="text-muted-foreground">Acompanhe seus períodos e solicite férias</p>
        </div>
        {availablePeriods.length > 0 && (
          <Button variant="hero" onClick={() => setRequestOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Solicitar Férias
          </Button>
        )}
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <Palmtree className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo total disponível</p>
              <p className="text-3xl font-bold text-primary">{totalAvailable} dias</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Periods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Períodos Aquisitivos</CardTitle>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhum período aquisitivo encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-center">Direito</TableHead>
                  <TableHead className="text-center">Gozados</TableHead>
                  <TableHead className="text-center">Saldo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{format(parseISO(p.start_date), "dd/MM/yyyy")} - {format(parseISO(p.end_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-center">{p.days_entitled}</TableCell>
                    <TableCell className="text-center">{p.days_taken + p.days_sold}</TableCell>
                    <TableCell className="text-center font-bold">{p.days_remaining}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={vacationPeriodStatusColors[p.status]}>
                        {vacationPeriodStatusLabels[p.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Requests History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Minhas Solicitações</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhuma solicitação de férias.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="text-center">Dias</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{format(parseISO(r.start_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{format(parseISO(r.end_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-center">{r.days_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={vacationRequestStatusColors[r.status]}>
                        {vacationRequestStatusLabels[r.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Request Modal */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Solicitar Férias</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Período Aquisitivo</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Selecione o período" /></SelectTrigger>
                <SelectContent>
                  {availablePeriods.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {format(parseISO(p.start_date), "dd/MM/yyyy")} a {format(parseISO(p.end_date), "dd/MM/yyyy")} — {p.days_remaining} dias
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                <span className="text-sm text-muted-foreground">Total: </span>
                <span className="font-bold text-primary text-lg">{daysCount} dias</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="sell" checked={hasSellDays} onCheckedChange={c => { setHasSellDays(!!c); if (!c) setSellDays(0); }} />
                <Label htmlFor="sell" className="cursor-pointer">Abono Pecuniário</Label>
              </div>
              {hasSellDays && (
                <Input type="number" min={1} max={maxSellDays} value={sellDays || ""} onChange={e => setSellDays(Number(e.target.value))} placeholder={`Máx. ${maxSellDays} dias`} className="ml-6" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional..." rows={2} />
            </div>

            <Button className="w-full" variant="hero" onClick={handleSubmit} disabled={!periodId || daysCount < 5 || createRequest.isPending}>
              {createRequest.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Solicitar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinhasFeriasPage;
