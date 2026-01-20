import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RoleGuard from "@/components/dashboard/RoleGuard";
import { useDashboard } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Bell,
  Shield,
  CreditCard,
  Crown,
  AlertTriangle,
  Check,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { PLANS, getPlanById } from "@/lib/planUtils";

const ConfiguracoesPage = () => {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // Form state for company data
  const [formData, setFormData] = useState({
    company_name: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
  });

  // Fetch company details
  const { data: company, isLoading } = useQuery({
    queryKey: ["company-settings", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", currentCompany.id)
        .single();
      if (error) throw error;
      
      // Initialize form data
      setFormData({
        company_name: data.company_name || "",
        cnpj: data.cnpj || "",
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
      });
      
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Count active collaborators
  const { data: collaboratorCount = 0 } = useQuery({
    queryKey: ["collaborator-count", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return 0;
      const { count, error } = await supabase
        .from("collaborators")
        .select("*", { count: "exact", head: true })
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentCompany?.id,
  });

  // Update company mutation
  const updateCompanyMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentCompany?.id) throw new Error("Empresa não encontrada");
      const { error } = await supabase
        .from("companies")
        .update({
          company_name: data.company_name,
          cnpj: data.cnpj,
          email: data.email,
          phone: data.phone,
          address: data.address,
        })
        .eq("id", currentCompany.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados atualizados com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      setIsEditing(false);
    },
    onError: () => {
      toast.error("Erro ao atualizar dados");
    },
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      if (!currentCompany?.id) throw new Error("Empresa não encontrada");
      
      // Call edge function to cancel on Asaas
      if (company?.asaas_subscription_id) {
        const { error } = await supabase.functions.invoke("asaas", {
          body: {
            action: "cancelSubscription",
            subscriptionId: company.asaas_subscription_id,
          },
        });
        if (error) throw error;
      }

      // Update local status
      const { error: updateError } = await supabase
        .from("companies")
        .update({
          subscription_status: "canceled",
        })
        .eq("id", currentCompany.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Assinatura cancelada");
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
    onError: () => {
      toast.error("Erro ao cancelar assinatura");
    },
  });

  const currentPlanData = company?.plan_type ? getPlanById(company.plan_type) : PLANS.essencial;
  const planLimit = currentPlanData.collaboratorLimit;
  const usagePercent = Math.min((collaboratorCount / planLimit) * 100, 100);

  const handleSave = () => {
    updateCompanyMutation.mutate(formData);
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    return numbers
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .slice(0, 18);
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 10) {
      return numbers
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return numbers
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .slice(0, 15);
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["admin", "rh"]}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["admin", "rh"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie os dados da sua conta e assinatura
          </p>
        </div>

        <Tabs defaultValue="conta" className="space-y-6">
          <TabsList>
            <TabsTrigger value="conta" className="gap-2">
              <Building2 className="w-4 h-4" />
              Dados da Conta
            </TabsTrigger>
            <TabsTrigger value="plano" className="gap-2">
              <CreditCard className="w-4 h-4" />
              Plano e Assinatura
            </TabsTrigger>
            <TabsTrigger value="notificacoes" className="gap-2">
              <Bell className="w-4 h-4" />
              Notificações
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="gap-2">
              <Shield className="w-4 h-4" />
              Segurança
            </TabsTrigger>
          </TabsList>

          {/* Tab: Dados da Conta */}
          <TabsContent value="conta" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    Dados Cadastrais
                  </CardTitle>
                  <CardDescription>
                    Informações da sua empresa
                  </CardDescription>
                </div>
                {!isEditing ? (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Editar
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setFormData({
                          company_name: company?.company_name || "",
                          cnpj: company?.cnpj || "",
                          email: company?.email || "",
                          phone: company?.phone || "",
                          address: company?.address || "",
                        });
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={updateCompanyMutation.isPending}
                    >
                      {updateCompanyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salvar
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Nome da Empresa</Label>
                    <Input
                      id="company_name"
                      value={formData.company_name}
                      onChange={(e) =>
                        setFormData({ ...formData, company_name: e.target.value })
                      }
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input
                      id="cnpj"
                      value={formData.cnpj}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cnpj: formatCNPJ(e.target.value),
                        })
                      }
                      disabled={!isEditing}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          phone: formatPhone(e.target.value),
                        })
                      }
                      disabled={!isEditing}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    disabled={!isEditing}
                    placeholder="Rua, número, bairro, cidade - UF"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Plano e Assinatura */}
          <TabsContent value="plano" className="space-y-6">
            {/* Current Plan Card */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Crown className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Plano {currentPlanData.name}
                        <Badge
                          variant={
                            company?.subscription_status === "active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {company?.subscription_status === "active"
                            ? "Ativo"
                            : company?.subscription_status === "trialing"
                            ? "Em teste"
                            : "Inativo"}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        R$ {currentPlanData.price.toFixed(2).replace(".", ",")}/mês
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Usage */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">
                      Colaboradores ativos
                    </span>
                    <span className="font-medium">
                      {collaboratorCount} / {planLimit}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usagePercent >= 90
                          ? "bg-destructive"
                          : usagePercent >= 70
                          ? "bg-yellow-500"
                          : "bg-primary"
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  {usagePercent >= 90 && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Próximo do limite. Considere fazer upgrade.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Plan Features */}
                <div>
                  <p className="text-sm font-medium mb-2">
                    Recursos do seu plano:
                  </p>
                  <ul className="space-y-1">
                    {currentPlanData.features.map((feature, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground flex items-center gap-2"
                      >
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Available Plans */}
            <Card>
              <CardHeader>
                <CardTitle>Planos Disponíveis</CardTitle>
                <CardDescription>
                  Escolha o melhor plano para sua empresa
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.values(PLANS).map((plan) => {
                    const isCurrentPlan =
                      plan.id === (company?.plan_type || "essencial");
                    return (
                      <div
                        key={plan.id}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          isCurrentPlan
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{plan.name}</h4>
                          {isCurrentPlan && (
                            <Badge variant="secondary" className="text-xs">
                              Atual
                            </Badge>
                          )}
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          R$ {plan.price.toFixed(0)}
                          <span className="text-sm font-normal text-muted-foreground">
                            /mês
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Até {plan.collaboratorLimit} colaboradores
                        </p>
                        {!isCurrentPlan && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-3"
                          >
                            {plan.price > currentPlanData.price
                              ? "Fazer Upgrade"
                              : "Alterar Plano"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Cancel Subscription */}
            <Card className="border-destructive/20">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Zona de Perigo
                </CardTitle>
                <CardDescription>
                  Ações irreversíveis para sua assinatura
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={company?.subscription_status === "canceled"}
                    >
                      Cancelar Assinatura
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar Assinatura?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Você perderá acesso aos recursos premium ao final do
                        período atual. Seus dados serão mantidos por 30 dias
                        após o cancelamento.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelSubscriptionMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {cancelSubscriptionMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Confirmar Cancelamento
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Notificações */}
          <TabsContent value="notificacoes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  Preferências de Notificação
                </CardTitle>
                <CardDescription>
                  Configure como deseja receber atualizações
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="email-notifications">
                      Notificações por e-mail
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receba atualizações importantes por e-mail
                    </p>
                  </div>
                  <Switch id="email-notifications" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="vacation-alerts">Alertas de férias</Label>
                    <p className="text-sm text-muted-foreground">
                      Notificações sobre férias próximas
                    </p>
                  </div>
                  <Switch id="vacation-alerts" defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="doc-expiry">Documentos vencendo</Label>
                    <p className="text-sm text-muted-foreground">
                      Alertas de documentos próximos do vencimento
                    </p>
                  </div>
                  <Switch id="doc-expiry" defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Segurança */}
          <TabsContent value="seguranca">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Configurações de Segurança
                </CardTitle>
                <CardDescription>
                  Proteja sua conta e seus dados
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="two-factor">
                      Autenticação em 2 fatores
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Adicione uma camada extra de segurança
                    </p>
                  </div>
                  <Switch id="two-factor" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="session-timeout">Timeout de sessão</Label>
                    <p className="text-sm text-muted-foreground">
                      Encerrar sessão após inatividade
                    </p>
                  </div>
                  <Switch id="session-timeout" defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
};

export default ConfiguracoesPage;