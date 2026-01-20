import { useState, useEffect } from "react";
import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { UserCog, Plus, Edit, Trash2, Users } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Team {
  id: string;
  name: string;
  description: string | null;
  store_id: string | null;
  company_id: string;
}

interface Store {
  id: string;
  store_name: string;
}

const EquipesPage = () => {
  const { currentCompany } = useDashboard();
  const { toast } = useToast();

  const [teams, setTeams] = useState<Team[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentCompany) {
      loadData();
    }
  }, [currentCompany]);

  const loadData = async () => {
    await Promise.all([loadTeams(), loadStores()]);
  };

  const loadTeams = async () => {
    if (!currentCompany) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("company_id", currentCompany.id)
        .order("name");

      if (error) throw error;
      setTeams(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar equipes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadStores = async () => {
    if (!currentCompany) return;

    try {
      const { data, error } = await supabase
        .from("stores")
        .select("id, store_name")
        .eq("company_id", currentCompany.id)
        .order("store_name");

      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      console.error("Error loading stores:", error);
    }
  };

  const openForm = (team?: Team) => {
    if (team) {
      setEditingTeam(team);
      setName(team.name);
      setDescription(team.description || "");
      setStoreId(team.store_id || "");
    } else {
      setEditingTeam(null);
      setName("");
      setDescription("");
      setStoreId("");
    }
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany || !name.trim()) return;

    setIsSaving(true);
    try {
      const teamData = {
        name: name.trim(),
        description: description.trim() || null,
        store_id: storeId || null,
        company_id: currentCompany.id,
      };

      if (editingTeam) {
        const { error } = await supabase
          .from("teams")
          .update(teamData)
          .eq("id", editingTeam.id);

        if (error) throw error;

        toast({
          title: "Equipe atualizada!",
          description: `${name} foi atualizada com sucesso.`,
        });
      } else {
        const { error } = await supabase.from("teams").insert(teamData);

        if (error) throw error;

        toast({
          title: "Equipe criada!",
          description: `${name} foi criada com sucesso.`,
        });
      }

      setFormOpen(false);
      loadTeams();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (team: Team) => {
    if (!confirm(`Tem certeza que deseja excluir a equipe ${team.name}?`)) return;

    try {
      const { error } = await supabase.from("teams").delete().eq("id", team.id);

      if (error) throw error;

      toast({
        title: "Equipe excluída",
        description: `${team.name} foi removida.`,
      });

      loadTeams();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStoreName = (storeId: string | null) => {
    if (!storeId) return null;
    return stores.find((s) => s.id === storeId)?.store_name;
  };

  return (
    <RoleGuard allowedRoles={["admin", "rh", "gestor"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Equipes</h1>
            <p className="text-muted-foreground">
              Organize colaboradores em equipes
            </p>
          </div>
          <Button variant="hero" onClick={() => openForm()}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Equipe
          </Button>
        </div>

        {isLoading ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <div className="animate-pulse text-muted-foreground">Carregando...</div>
            </CardContent>
          </Card>
        ) : teams.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <UserCog className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Nenhuma equipe cadastrada
              </h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Crie equipes para organizar melhor seus colaboradores.
              </p>
              <Button variant="hero" onClick={() => openForm()}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Equipe
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <Card
                key={team.id}
                className="border border-border hover:shadow-soft transition-shadow"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openForm(team)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(team)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{team.name}</h3>
                  {team.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {team.description}
                    </p>
                  )}
                  {getStoreName(team.store_id) && (
                    <p className="text-xs text-muted-foreground">
                      Loja: {getStoreName(team.store_id)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Form Modal */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTeam ? "Editar Equipe" : "Nova Equipe"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da equipe *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Vendas, Operações, Administrativo"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição opcional da equipe"
                />
              </div>

              {stores.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="store">Loja (opcional)</Label>
                  <Select value={storeId} onValueChange={setStoreId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as lojas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas as lojas</SelectItem>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.store_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="hero" disabled={isSaving}>
                  {isSaving ? "Salvando..." : editingTeam ? "Salvar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
};

export default EquipesPage;
