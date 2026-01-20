import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Rocket, Building2, Sparkles } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const plans = [
  {
    id: "essencial",
    name: "Essencial",
    price: "R$ 49,90",
    period: "/mês",
    description: "Para pequenas empresas",
    icon: Sparkles,
    features: [
      "Até 10 colaboradores",
      "Gestão de benefícios",
      "Controle de férias",
      "Relatórios básicos",
    ],
    highlight: false,
  },
  {
    id: "crescer",
    name: "Crescer",
    price: "R$ 99,90",
    period: "/mês",
    description: "Para empresas em crescimento",
    icon: Rocket,
    features: [
      "Até 50 colaboradores",
      "Tudo do Essencial",
      "Lançamentos financeiros",
      "Múltiplas filiais",
      "Suporte prioritário",
    ],
    highlight: true,
  },
  {
    id: "profissional",
    name: "Profissional",
    price: "R$ 199,90",
    period: "/mês",
    description: "Para médias empresas",
    icon: Crown,
    features: [
      "Até 200 colaboradores",
      "Tudo do Crescer",
      "Integração contabilidade",
      "API de integração",
      "Relatórios avançados",
    ],
    highlight: false,
  },
  {
    id: "empresa_plus",
    name: "Empresa+",
    price: "R$ 399,90",
    period: "/mês",
    description: "Para grandes empresas",
    icon: Building2,
    features: [
      "Colaboradores ilimitados",
      "Tudo do Profissional",
      "Gerente de conta dedicado",
      "SLA garantido",
      "Customizações",
    ],
    highlight: false,
  },
];

export const TrialExpiredDialog = () => {
  const { currentCompany, signOut } = useDashboard();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    setIsLoading(planId);
    try {
      // Here we would integrate with Asaas payment
      // For now, just update the company plan and extend trial
      const { error } = await supabase
        .from("companies")
        .update({
          plan_type: planId,
          subscription_status: "active",
          trial_ends_at: null,
        })
        .eq("id", currentCompany?.id);

      if (error) throw error;

      toast.success("Plano selecionado! Redirecionando para pagamento...");
      
      // Reload page to refresh context
      window.location.reload();
    } catch (error) {
      console.error("Error selecting plan:", error);
      toast.error("Erro ao selecionar plano. Tente novamente.");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
      <div className="max-w-6xl w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center shadow-lg mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-2xl">R</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Seu período de teste expirou
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Escolha um plano para continuar utilizando o RH360 e gerenciar sua equipe de forma eficiente.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card 
                key={plan.id} 
                className={`relative transition-all hover:shadow-lg ${
                  plan.highlight 
                    ? "border-primary shadow-md ring-2 ring-primary/20" 
                    : "border-border"
                }`}
              >
                {plan.highlight && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    Mais Popular
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${
                    plan.highlight ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="mb-4">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <ul className="space-y-2 text-sm text-left mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className="w-full" 
                    variant={plan.highlight ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isLoading !== null}
                  >
                    {isLoading === plan.id ? "Processando..." : "Escolher Plano"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <Button variant="ghost" onClick={signOut} className="text-muted-foreground">
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
};
