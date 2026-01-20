import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const MeusBeneficiosPage = () => {
  const { user } = useDashboard();

  // Fetch collaborator linked to current user
  const { data: collaborator } = useQuery({
    queryKey: ["my-collaborator", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name")
        .eq("user_id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch benefits assigned to the collaborator
  const { data: myBenefits = [], isLoading } = useQuery({
    queryKey: ["my-benefits", collaborator?.id],
    queryFn: async () => {
      if (!collaborator?.id) return [];
      const { data, error } = await supabase
        .from("benefits_assignments")
        .select(`
          *,
          benefit:benefits(id, name, description)
        `)
        .eq("collaborator_id", collaborator.id)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!collaborator?.id,
  });

  if (!collaborator) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meus Benefícios</h1>
          <p className="text-muted-foreground">Visualize seus benefícios</p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Info className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Perfil não vinculado
            </h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Seu usuário ainda não está vinculado a um cadastro de colaborador.
              Entre em contato com o RH.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meus Benefícios</h1>
        <p className="text-muted-foreground">
          Confira os benefícios atribuídos a você
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Carregando...
        </div>
      ) : myBenefits.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Gift className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Nenhum benefício atribuído
            </h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Você ainda não possui benefícios cadastrados. Entre em contato com o RH
              para mais informações.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {myBenefits.map((item: any) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">
                    {item.benefit?.name}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.benefit?.description && (
                  <p className="text-sm text-muted-foreground">
                    {item.benefit.description}
                  </p>
                )}
                {item.observation && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">Observação:</span>{" "}
                      {item.observation}
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant="secondary">Ativo</Badge>
                  <span className="text-xs text-muted-foreground">
                    Desde{" "}
                    {format(new Date(item.assigned_at), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MeusBeneficiosPage;
