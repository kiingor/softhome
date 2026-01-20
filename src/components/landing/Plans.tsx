import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { PLANS, PlanId } from "@/lib/planUtils";

const planOrder: PlanId[] = ['essencial', 'crescer', 'profissional', 'empresa_plus'];

const planColors: Record<string, { bg: string; border: string; badge: string }> = {
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    badge: 'bg-emerald-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-500',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-950/20',
    border: 'border-violet-200 dark:border-violet-800',
    badge: 'bg-violet-500',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-500',
  },
};

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

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {planOrder.map((planId) => {
            const plan = PLANS[planId];
            const colors = planColors[plan.color];
            
            return (
              <div 
                key={planId}
                className={`relative p-6 rounded-2xl bg-card border-2 transition-all duration-300 flex flex-col ${
                  plan.popular 
                    ? "border-primary shadow-card scale-[1.02] lg:scale-105" 
                    : `${colors.border} hover:border-primary/30 hover:shadow-soft`
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1.5 rounded-full gradient-hero text-primary-foreground text-sm font-semibold shadow-soft flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      Mais popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium text-white mb-3 ${colors.badge}`}>
                    Até {plan.collaboratorLimit} colaboradores
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4 min-h-[40px]">{plan.description}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <span className="text-4xl font-extrabold text-foreground">{plan.priceDisplay}</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-grow">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-foreground">
                      <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link to={`/signup?plan=${planId}`} className="mt-auto">
                  <Button 
                    variant={plan.popular ? "hero" : "outline"} 
                    size="lg" 
                    className="w-full"
                  >
                    Começar com este plano
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground">
            Precisa de mais de 100 colaboradores?{" "}
            <a href="mailto:comercial@rh360.com.br" className="text-primary font-semibold hover:underline">
              Fale com nosso time comercial
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Plans;