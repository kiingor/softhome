import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
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
  CreditCard,
  Crown,
  AlertTriangle,
  Check,
  Loader2,
  Save,
  Users,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { PLANS, getPlanById, PlanId } from "@/lib/planUtils";
import { UsersAccessTab } from "@/components/dashboard/UsersAccessTab";
import { useIsCompanyAdmin } from "@/hooks/usePermissions";
import { PaymentModal } from "@/components/subscription/PaymentModal";
import { differenceInDays } from "date-fns";

const ConfiguracoesPage = () => {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const { isAdmin } = useIsCompanyAdmin();
  const [searchParams] = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<PlanId>("essencial");
  const [activeTab, setActiveTab] = useState("conta");

  // Handle tab from URL params
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["conta", "usuarios", "plano"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

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

  // Calculate trial info
  const trialDaysRemaining = company?.trial_ends_at 
    ? Math.max(0, differenceInDays(new Date(company.trial_ends_at), new Date()))
    : 0;
  const isTrial = company?.subscription_status !== 'active' && company?.trial_ends_at && trialDaysRemaining >= 0;

  const currentPlanData = company?.plan_type ? getPlanById(company.plan_type) : PLANS.essencial;
  const planLimit = currentPlanData.collaboratorLimit;
  const usagePercent = Math.min((collaboratorCount / planLimit) * 100, 100);

  const handleSubscribe = (planId: PlanId) => {
    setSelectedPlanForPayment(planId);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    window.location.reload();
  };

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
      <PermissionGuard module="configuracoes">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="configuracoes">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie os dados da sua conta e assinatura
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="conta" className="gap-2">
              <Building2 className="w-4 h-4" />
              Dados da Conta
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="usuarios" className="gap-2">
                <Users className="w-4 h-4" />
                Usuários e Acessos
              </TabsTrigger>
            )}
            <TabsTrigger value="plano" className="gap-2">
              <CreditCard className="w-4 h-4" />
              Plano e Assinatura
              {isTrial && (
                <Badge variant="outline" className="ml-1 text-xs border-primary/50 text-primary">
                  Trial
                </Badge>
              )}
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

          {/* Tab: Usuários e Acessos */}
          {isAdmin && (
            <TabsContent value="usuarios">
              <UsersAccessTab />
            </TabsContent>
          )}

          {/* Tab: Plano e Assinatura */}
          <TabsContent value="plano" className="space-y-6">
            {/* Current Plan Card */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
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
                            : isTrial
                            ? "Trial"
                            : "Inativo"}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        R$ {currentPlanData.price.toFixed(2).replace(".", ",")}/mês
                      </CardDescription>
                    </div>
                  </div>
                  
                  {/* Subscribe Button for Trial Users */}
                  {isTrial && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>{trialDaysRemaining} dia{trialDaysRemaining !== 1 ? 's' : ''} restantes</span>
                      </div>
                      <Button onClick={() => handleSubscribe(company?.plan_type as PlanId || "essencial")}>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Assinar Plano
                      </Button>
                    </div>
                  )}
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
                            onClick={() => handleSubscribe(plan.id as PlanId)}
                          >
                            {isTrial
                              ? "Assinar"
                              : plan.price > currentPlanData.price
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

        </Tabs>

        {/* Payment Modal */}
        <PaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          planId={selectedPlanForPayment}
          onSuccess={handlePaymentSuccess}
        />
      </div>
    </PermissionGuard>
  );
};

export default ConfiguracoesPage;