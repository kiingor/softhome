import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Trash, CircleNotch as Loader2, Users } from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatCPFInput } from "@/lib/validators";

interface Props {
  collaboratorId: string;
  companyId: string;
  canEdit: boolean;
}

interface Dependent {
  id: string;
  name: string;
  birth_date: string | null;
  cpf: string | null;
  kinship: string;
  is_irpf_dependent: boolean;
  is_health_plan_dependent: boolean;
  notes: string | null;
}

const KINSHIP_LABELS: Record<string, string> = {
  filho: "Filho(a)",
  enteado: "Enteado(a)",
  tutelado: "Tutelado(a)",
  conjuge: "Cônjuge",
  companheiro: "Companheiro(a)",
  pai: "Pai",
  mae: "Mãe",
  irmao: "Irmão/Irmã",
  avô: "Avô/Avó",
  neto: "Neto(a)",
  outro: "Outro",
};

export function CollaboratorDependentsTab({
  collaboratorId,
  companyId,
  canEdit,
}: Props) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    birth_date: "",
    cpf: "",
    kinship: "filho",
    is_irpf_dependent: false,
    is_health_plan_dependent: false,
  });

  const { data: dependents = [], isLoading } = useQuery({
    queryKey: ["collaborator-dependents", collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_dependents")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Dependent[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("collaborator_dependents").insert({
        collaborator_id: collaboratorId,
        company_id: companyId,
        name: form.name.trim(),
        birth_date: form.birth_date || null,
        cpf: form.cpf.replace(/\D/g, "") || null,
        kinship: form.kinship as never,
        is_irpf_dependent: form.is_irpf_dependent,
        is_health_plan_dependent: form.is_health_plan_dependent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collaborator-dependents", collaboratorId],
      });
      queryClient.invalidateQueries({ queryKey: ["collaborator", collaboratorId] });
      setIsOpen(false);
      setForm({
        name: "",
        birth_date: "",
        cpf: "",
        kinship: "filho",
        is_irpf_dependent: false,
        is_health_plan_dependent: false,
      });
      toast.success("Dependente adicionado ✓");
    },
    onError: (err: Error) => toast.error("Não rolou. " + err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("collaborator_dependents")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collaborator-dependents", collaboratorId],
      });
      queryClient.invalidateQueries({ queryKey: ["collaborator", collaboratorId] });
      toast.success("Removido ✓");
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
          Dependentes legais e familiares. Quem é dependente para IRPF afeta o
          cálculo da folha automaticamente.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setIsOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      {dependents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sem dependentes cadastrados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dependents.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{d.name}</p>
                    <Badge variant="outline" className="text-xs font-normal">
                      {KINSHIP_LABELS[d.kinship] ?? d.kinship}
                    </Badge>
                    {d.is_irpf_dependent && (
                      <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                        IRPF
                      </Badge>
                    )}
                    {d.is_health_plan_dependent && (
                      <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0">
                        Plano de Saúde
                      </Badge>
                    )}
                  </div>
                  {(d.birth_date || d.cpf) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {d.birth_date &&
                        new Date(d.birth_date).toLocaleDateString("pt-BR")}
                      {d.birth_date && d.cpf && " · "}
                      {d.cpf && <span className="font-mono">{d.cpf}</span>}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove.mutate(d.id)}
                    disabled={remove.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar dependente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dep-name">Nome completo *</Label>
              <Input
                id="dep-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dep-birth">Nascimento</Label>
                <Input
                  id="dep-birth"
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-cpf">CPF</Label>
                <Input
                  id="dep-cpf"
                  value={form.cpf}
                  onChange={(e) =>
                    setForm({ ...form, cpf: formatCPFInput(e.target.value) })
                  }
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-kinship">Parentesco *</Label>
              <Select
                value={form.kinship}
                onValueChange={(v) => setForm({ ...form, kinship: v })}
              >
                <SelectTrigger id="dep-kinship">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KINSHIP_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="dep-irpf" className="text-sm font-medium">
                  Dependente IRPF
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inclui na dedução mensal de IRPF na folha.
                </p>
              </div>
              <Switch
                id="dep-irpf"
                checked={form.is_irpf_dependent}
                onCheckedChange={(v) =>
                  setForm({ ...form, is_irpf_dependent: v })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="dep-plan" className="text-sm font-medium">
                  Plano de Saúde
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marca como dependente no plano de saúde.
                </p>
              </div>
              <Switch
                id="dep-plan"
                checked={form.is_health_plan_dependent}
                onCheckedChange={(v) =>
                  setForm({ ...form, is_health_plan_dependent: v })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.name.trim()}
            >
              {create.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
