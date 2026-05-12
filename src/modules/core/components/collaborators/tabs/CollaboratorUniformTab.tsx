import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  CircleNotch as Loader2,
  TShirt,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface Props {
  collaboratorId: string;
  companyId: string;
  canEdit: boolean;
}

interface UniformSize {
  id: string;
  shirt_size: string | null;
  pants_size: string | null;
  jacket_size: string | null;
  shoe_size: string | null;
  measured_at: string;
  notes: string | null;
}

export function CollaboratorUniformTab({
  collaboratorId,
  companyId,
  canEdit,
}: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    shirt_size: "",
    pants_size: "",
    jacket_size: "",
    shoe_size: "",
    notes: "",
  });

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["collaborator-uniform-sizes", collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_uniform_sizes")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("measured_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UniformSize[];
    },
  });

  const current = history[0] ?? null;

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("collaborator_uniform_sizes")
        .insert({
          collaborator_id: collaboratorId,
          company_id: companyId,
          shirt_size: form.shirt_size || null,
          pants_size: form.pants_size || null,
          jacket_size: form.jacket_size || null,
          shoe_size: form.shoe_size || null,
          notes: form.notes || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collaborator-uniform-sizes", collaboratorId],
      });
      setShowForm(false);
      setForm({
        shirt_size: "",
        pants_size: "",
        jacket_size: "",
        shoe_size: "",
        notes: "",
      });
      toast.success("Tamanhos registrados ✓");
    },
    onError: (err: Error) => toast.error("Não rolou. " + err.message),
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
          Tamanhos atuais. Cada nova medição preserva o histórico.
        </p>
        {canEdit && !showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Nova medição
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="shirt">Camisa</Label>
                <Input
                  id="shirt"
                  value={form.shirt_size}
                  onChange={(e) => setForm({ ...form, shirt_size: e.target.value })}
                  placeholder="PP, P, M, G, GG, XGG..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pants">Calça</Label>
                <Input
                  id="pants"
                  value={form.pants_size}
                  onChange={(e) => setForm({ ...form, pants_size: e.target.value })}
                  placeholder="38, 40, 42..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jacket">Jaqueta</Label>
                <Input
                  id="jacket"
                  value={form.jacket_size}
                  onChange={(e) => setForm({ ...form, jacket_size: e.target.value })}
                  placeholder="P, M, G..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shoe">Calçado</Label>
                <Input
                  id="shoe"
                  value={form.shoe_size}
                  onChange={(e) => setForm({ ...form, shoe_size: e.target.value })}
                  placeholder="38, 40, 42..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uniform-notes">Observações</Label>
              <Textarea
                id="uniform-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Detalhes, ajustes especiais..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!current && !showForm ? (
        <div className="text-center py-12 text-muted-foreground">
          <TShirt className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma medição registrada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((u, idx) => (
            <Card key={u.id} className={idx === 0 ? "border-primary/50" : ""}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {idx === 0 ? "Atual · " : ""}
                    {new Date(u.measured_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Camisa:</span>{" "}
                    <strong>{u.shirt_size ?? "—"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Calça:</span>{" "}
                    <strong>{u.pants_size ?? "—"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Jaqueta:</span>{" "}
                    <strong>{u.jacket_size ?? "—"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Calçado:</span>{" "}
                    <strong>{u.shoe_size ?? "—"}</strong>
                  </div>
                </div>
                {u.notes && (
                  <p className="text-xs text-muted-foreground italic">{u.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
