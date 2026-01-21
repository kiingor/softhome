import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Rocket, Building2, Sparkles } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";
import { PaymentModal } from "@/components/subscription/PaymentModal";
import { PlanId } from "@/lib/planUtils";

const plans = [
  {
    id: "essencial" as PlanId,
    name: "Essencial",
    price: "R$ 49,90",
    period: "/mês",
    description: "Para pequenas empresas",
    icon: Sparkles,
    features: [
      "Até 5 colaboradores",
      "Gestão de benefícios",
      "Controle de férias",
      "Relatórios básicos",
    ],
    highlight: false,
  },
  {
    id: "crescer" as PlanId,
    name: "Crescer",
    price: "R$ 99,90",
    period: "/mês",
    description: "Para empresas em crescimento",
    icon: Rocket,
    features: [
      "Até 10 colaboradores",
      "Tudo do Essencial",
      "Lançamentos financeiros",
      "Múltiplas filiais",
      "Suporte prioritário",
    ],
    highlight: true,
  },
  {
    id: "profissional" as PlanId,
    name: "Profissional",
    price: "R$ 199,90",
    period: "/mês",
    description: "Para médias empresas",
    icon: Crown,
    features: [
      "Até 30 colaboradores",
      "Tudo do Crescer",
      "Integração contabilidade",
      "API de integração",
      "Relatórios avançados",
    ],
    highlight: false,
  },
  {
    id: "empresa_plus" as PlanId,
    name: "Empresa+",
    price: "R$ 399,90",
    period: "/mês",
    description: "Para grandes empresas",
    icon: Building2,
    features: [
      "Até 100 colaboradores",
      "Tudo do Profissional",
      "Gerente de conta dedicado",
      "SLA garantido",
      "Customizações",
    ],
    highlight: false,
  },
];

export const TrialExpiredDialog = () => {
  const { signOut } = useDashboard();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("essencial");

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    window.location.reload();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
        <div className="max-w-6xl w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center shadow-lg mx-auto mb-4">
              <span className="text-primary-foreground font-bold text-2xl">M</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Seu período de teste expirou
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Escolha um plano para continuar utilizando o Meu RH e gerenciar sua equipe de forma eficiente.
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
                    >
                      Assinar Plano
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

      <PaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        planId={selectedPlan}
        onSuccess={handlePaymentSuccess}
      />
    </>
  );
};
