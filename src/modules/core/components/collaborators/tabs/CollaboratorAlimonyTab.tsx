import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  CircleNotch as Loader2,
  Scales,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface Props {
  collaboratorId: string;
  companyId: string;
  canEdit: boolean;
}

interface AlimonyOrder {
  id: string;
  beneficiary_name: string;
  beneficiary_cpf: string | null;
  case_number: string | null;
  judgment_date: string | null;
  calculation_type: "fixed" | "percentage_gross" | "percentage_net";
  value: number;
  status: "active" | "suspended" | "ended";
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

const CALC_LABELS: Record<string, string> = {
  fixed: "Valor fixo (R$)",
  percentage_gross: "% sobre bruto",
  percentage_net: "% sobre líquido",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  ended: "Encerrada",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  suspended: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ended: "bg-muted text-muted-foreground",
};

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function CollaboratorAlimonyTab({
  collaboratorId,
  companyId,
  canEdit,
}: Props) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    beneficiary_name: "",
    beneficiary_cpf: "",
    case_number: "",
    judgment_date: "",
    calculation_type: "fixed" as AlimonyOrder["calculation_type"],
    value: "0",
    effective_from: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["collaborator-alimony", collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_alimony_orders")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("status")
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AlimonyOrder[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const numericValue = parseFloat(form.value.replace(",", ".")) || 0;
      const finalValue =
        form.calculation_type === "fixed" ? numericValue : numericValue / 100;
      const { error } = await supabase
        .from("collaborator_alimony_orders")
        .insert({
          collaborator_id: collaboratorId,
          company_id: companyId,
          beneficiary_name: form.beneficiary_name.trim(),
          beneficiary_cpf: form.beneficiary_cpf.replace(/\D/g, "") || null,
          case_number: form.case_number || null,
          judgment_date: form.judgment_date || null,
          calculation_type: form.calculation_type,
          value: finalValue,
          status: "active",
          effective_from: form.effective_from,
          notes: form.notes || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collaborator-alimony", collaboratorId],
      });
      setIsOpen(false);
      setForm({
        beneficiary_name: "",
        beneficiary_cpf: "",
        case_number: "",
        judgment_date: "",
        calculation_type: "fixed",
        value: "0",
        effective_from: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      toast.success("Pensão registrada ✓");
    },
    onError: (err: Error) => toast.error("Não rolou. " + err.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: AlimonyOrder["status"];
    }) => {
      const update: { status: AlimonyOrder["status"]; effective_to?: string } = {
        status,
      };
      if (status === "ended") {
        update.effective_to = new Date().toISOString().slice(0, 10);
      }
      const { error } = await supabase
        .from("collaborator_alimony_orders")
        .update(update)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collaborator-alimony", collaboratorId],
      });
      toast.success("Atualizado ✓");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Ordens judiciais de pensão alimentícia. Acesso restrito.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setIsOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Nova ordem
          </Button>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Scales className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sem ordens registradas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{o.beneficiary_name}</p>
                      <Badge
                        variant="outline"
                        className={`${STATUS_COLORS[o.status]} border-0 text-xs`}
                      >
                        {STATUS_LABELS[o.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {CALC_LABELS[o.calculation_type]} —{" "}
                      <strong>
                        {o.calculation_type === "fixed"
                          ? fmtBRL(o.value)
                          : `${(o.value * 100).toFixed(2)}%`}
                      </strong>
                    </p>
                    {(o.case_number || o.judgment_date) && (
                      <p className="text-xs text-muted-foreground">
                        {o.case_number && `Proc. ${o.case_number}`}
                        {o.case_number && o.judgment_date && " · "}
                        {o.judgment_date &&
                          `Decisão ${new Date(o.judgment_date).toLocaleDateString("pt-BR")}`}
                      </p>
                    )}
                  </div>
                  {canEdit && o.status === "active" && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateStatus.mutate({ id: o.id, status: "suspended" })
                        }
                      >
                        Suspender
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateStatus.mutate({ id: o.id, status: "ended" })
                        }
                        className="text-destructive"
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova ordem de pensão alimentícia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-name">Beneficiário *</Label>
              <Input
                id="al-name"
                value={form.beneficiary_name}
                onChange={(e) =>
                  setForm({ ...form, beneficiary_name: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="al-cpf">CPF do beneficiário</Label>
                <Input
                  id="al-cpf"
                  value={form.beneficiary_cpf}
                  onChange={(e) =>
                    setForm({ ...form, beneficiary_cpf: e.target.value })
                  }
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="al-case">Nº do processo</Label>
                <Input
                  id="al-case"
                  value={form.case_number}
                  onChange={(e) =>
                    setForm({ ...form, case_number: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-calc">Tipo de cálculo *</Label>
              <Select
                value={form.calculation_type}
                onValueChange={(v) =>
                  setForm({ ...form, calculation_type: v as never })
                }
              >
                <SelectTrigger id="al-calc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                  <SelectItem value="percentage_gross">% sobre bruto</SelectItem>
                  <SelectItem value="percentage_net">% sobre líquido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="al-value">
                  {form.calculation_type === "fixed" ? "Valor (R$) *" : "% (0-100) *"}
                </Label>
                <Input
                  id="al-value"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.calculation_type === "fixed" ? "0,00" : "30"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="al-from">Vigência desde *</Label>
                <Input
                  id="al-from"
                  type="date"
                  value={form.effective_from}
                  onChange={(e) =>
                    setForm({ ...form, effective_from: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-judgment">Data da decisão</Label>
              <Input
                id="al-judgment"
                type="date"
                value={form.judgment_date}
                onChange={(e) =>
                  setForm({ ...form, judgment_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-notes">Observações</Label>
              <Textarea
                id="al-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.beneficiary_name.trim()}
            >
              {create.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
