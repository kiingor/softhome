import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Starter",
    price: "99",
    description: "Para pequenas empresas começando sua jornada digital",
    collaborators: "Até 20 colaboradores",
    features: [
      "Cadastro de colaboradores",
      "Controle de férias",
      "Documentos básicos",
      "Suporte por email",
    ],
    popular: false,
  },
  {
    name: "Profissional",
    price: "249",
    description: "Para empresas em crescimento que precisam de mais recursos",
    collaborators: "Até 100 colaboradores",
    features: [
      "Tudo do Starter",
      "Folha de pagamento",
      "Assinatura digital",
      "Relatórios avançados",
      "Integração contábil",
      "Suporte prioritário",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Sob consulta",
    description: "Para grandes empresas com necessidades específicas",
    collaborators: "Colaboradores ilimitados",
    features: [
      "Tudo do Profissional",
      "API completa",
      "SSO / SAML",
      "Customizações",
      "Gerente de conta dedicado",
      "SLA garantido",
    ],
    popular: false,
  },
];

const Plans = () => {
  return (
    <section id="planos" className="py-24 gradient-warm">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Planos que crescem{" "}
            <span className="text-gradient">com sua empresa</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Preços justos baseados no número de colaboradores. Sem surpresas, sem taxas escondidas.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <div 
              key={index}
              className={`relative p-8 rounded-2xl bg-card border-2 transition-all duration-300 ${
                plan.popular 
                  ? "border-primary shadow-card scale-105" 
                  : "border-border hover:border-primary/30 hover:shadow-soft"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 rounded-full gradient-hero text-primary-foreground text-sm font-semibold shadow-soft">
                    Mais popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-foreground mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  {plan.price !== "Sob consulta" && (
                    <span className="text-sm text-muted-foreground">R$</span>
                  )}
                  <span className="text-4xl font-extrabold text-foreground">{plan.price}</span>
                  {plan.price !== "Sob consulta" && (
                    <span className="text-muted-foreground">/mês</span>
                  )}
                </div>
                <p className="text-sm text-primary font-medium mt-2">{plan.collaborators}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-foreground">
                    <Check className="w-5 h-5 text-accent flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link to="/signup">
                <Button 
                  variant={plan.popular ? "hero" : "outline"} 
                  size="lg" 
                  className="w-full"
                >
                  {plan.price === "Sob consulta" ? "Falar com vendas" : "Começar agora"}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Plans;
