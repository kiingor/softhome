import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DayPicker } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarBlank,
  CircleNotch as Loader2,
  Pencil,
  Plus,
  Trash,
  ArrowsClockwise as Sync,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStoreHolidays, type StoreHoliday, type HolidayType } from "@/modules/payroll/hooks/use-store-holidays";

// Apply locale for ptBR weekday/month labels
const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  national: "Nacional",
  state: "Estadual",
  municipal: "Municipal",
  manual: "Manual",
};

const HOLIDAY_TYPE_VARIANTS: Record<HolidayType, "default" | "secondary" | "outline" | "destructive"> = {
  national: "default",
  state: "secondary",
  municipal: "secondary",
  manual: "outline",
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface HolidayFormState {
  id?: string;
  date: string;          // YYYY-MM-DD
  name: string;
  type: HolidayType;
}

const emptyForm: HolidayFormState = {
  date: "",
  name: "",
  type: "manual",
};

export default function CalendarioFeriadosPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<HolidayFormState>(emptyForm);
  const [deletingHoliday, setDeletingHoliday] = useState<StoreHoliday | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Store info pra mostrar nome
  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from("stores")
        .select("id, store_name, cnpj, address, company_id")
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });

  const { holidays, holidayMap, isLoading, refetch } = useStoreHolidays(storeId, year);

  // Set de Date com feriados, pra modifier do day-picker
  const holidayDateObjects = useMemo(
    () => holidays.map((h) => parseLocalDate(h.date)),
    [holidays],
  );

  const yearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  }, [today]);

  const handleSync = async () => {
    if (!storeId) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("holidays-sync", {
        body: { storeId, year },
      });
      if (error) throw error;
      const errPayload = (data as { error?: string } | null)?.error;
      if (errPayload) throw new Error(errPayload);
      const result = data as {
        upserted: number;
        skippedManual: number;
        fetched: number;
      };
      toast.success(
        `${result.upserted} feriado(s) sincronizados${
          result.skippedManual ? ` · ${result.skippedManual} manual(is) preservado(s)` : ""
        }`,
      );
      refetch();
      queryClient.invalidateQueries({ queryKey: ["store-holidays", storeId, year] });
    } catch (err) {
      toast.error("Falha ao sincronizar: " + (err as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (values: HolidayFormState) => {
      if (!storeId || !store) throw new Error("Empresa não encontrada");
      const payload = {
        store_id: storeId,
        company_id: store.company_id,
        date: values.date,
        name: values.name.trim(),
        type: values.type,
        source: values.id ? undefined : null,
      };
      if (values.id) {
        const { error } = await supabase
          .from("store_holidays")
          .update({
            date: payload.date,
            name: payload.name,
            type: payload.type,
          })
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("store_holidays")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Feriado atualizado." : "Feriado adicionado.");
      queryClient.invalidateQueries({ queryKey: ["store-holidays", storeId, year] });
      refetch();
      setFormOpen(false);
      setForm(emptyForm);
    },
    onError: (err: Error) => {
      toast.error("Falha: " + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("store_holidays")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feriado removido.");
      queryClient.invalidateQueries({ queryKey: ["store-holidays", storeId, year] });
      refetch();
      setDeletingHoliday(null);
    },
    onError: (err: Error) => {
      toast.error("Falha: " + err.message);
    },
  });

  const openEdit = (h: StoreHoliday) => {
    setForm({
      id: h.id,
      date: h.date,
      name: h.name,
      type: h.type,
    });
    setFormOpen(true);
  };

  const openCreate = () => {
    setForm({
      ...emptyForm,
      date: `${year}-01-01`,
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.date || !form.name.trim()) {
      toast.error("Data e nome são obrigatórios.");
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <div className="space-y-6 page-content">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/empresas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <CalendarBlank className="h-6 w-6 text-primary" />
              Feriados — {store?.store_name ?? "..."}
            </h1>
            <p className="text-sm text-muted-foreground">
              Calendário de feriados que afetam o cálculo de benefícios diários.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sync className="w-4 h-4 mr-2" />
            )}
            Sincronizar nacionais
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Year grid */}
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 12 }, (_, i) => i).map((monthIdx) => (
                  <div
                    key={monthIdx}
                    className="border rounded-lg p-2 bg-muted/20"
                  >
                    <h3 className="text-sm font-semibold text-center mb-2">
                      {MONTHS[monthIdx]}
                    </h3>
                    <DayPicker
                      mode="single"
                      month={new Date(year, monthIdx, 1)}
                      locale={ptBR}
                      modifiers={{ holiday: holidayDateObjects }}
                      modifiersClassNames={{
                        holiday: "bg-primary/15 text-primary font-semibold rounded-md",
                      }}
                      onDayClick={(date) => {
                        const iso = formatLocalDate(date);
                        const existing = holidayMap[iso];
                        if (existing) {
                          openEdit(existing);
                        } else {
                          setForm({
                            id: undefined,
                            date: iso,
                            name: "",
                            type: "manual",
                          });
                          setFormOpen(true);
                        }
                      }}
                      disableNavigation
                      classNames={{
                        caption: "hidden",
                        months: "",
                        month: "",
                        table: "w-full text-xs",
                        head_row: "flex",
                        head_cell:
                          "text-muted-foreground w-7 h-7 text-[0.65rem] flex items-center justify-center font-normal",
                        row: "flex w-full mt-1",
                        cell: "h-7 w-7 text-center p-0 relative",
                        day: "h-7 w-7 p-0 text-xs hover:bg-accent rounded-md cursor-pointer",
                        day_outside: "text-muted-foreground/30",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar — list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {holidays.length} feriado(s) em {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {holidays.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                Nenhum feriado cadastrado.
                <br />
                Sincroniza os nacionais ou adiciona manualmente.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {holidays.map((h) => (
                  <div
                    key={h.id}
                    className="p-2 rounded-lg border bg-background hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatBR(h.date)}
                          </span>
                          <Badge
                            variant={HOLIDAY_TYPE_VARIANTS[h.type]}
                            className="text-[0.65rem] h-4 px-1.5"
                          >
                            {HOLIDAY_TYPE_LABELS[h.type]}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">{h.name}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(h)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeletingHoliday(h)}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog: criar/editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar feriado" : "Adicionar feriado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Data</Label>
              <Input
                id="holiday-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Nome</Label>
              <Input
                id="holiday-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Aniversário da cidade"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((p) => ({ ...p, type: v as HolidayType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="national">Nacional</SelectItem>
                  <SelectItem value="state">Estadual</SelectItem>
                  <SelectItem value="municipal">Municipal</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Feriados marcados como <strong>Manual</strong> não são sobrescritos pela sincronização.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {form.id ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: confirmar exclusão */}
      <AlertDialog
        open={!!deletingHoliday}
        onOpenChange={(open) => !open && setDeletingHoliday(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover feriado?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingHoliday && (
                <>
                  <strong>{deletingHoliday.name}</strong> ({formatBR(deletingHoliday.date)}) será removido.
                  Cálculos de benefícios diários voltarão a contar este dia normalmente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deletingHoliday && deleteMutation.mutate(deletingHoliday.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Local-date helpers (evitam UTC drift do Date constructor)
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
