import { Users, Calendar, DollarSign, FileText, Shield, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Gestão de Colaboradores",
    description: "Cadastro completo, documentos, histórico e toda informação em um só lugar.",
  },
  {
    icon: Calendar,
    title: "Férias e Ausências",
    description: "Controle automático de férias, licenças e faltas com aprovações simplificadas.",
  },
  {
    icon: DollarSign,
    title: "Folha de Pagamento",
    description: "Cálculos automáticos, integração contábil e holerites digitais.",
  },
  {
    icon: FileText,
    title: "Contratos e Docs",
    description: "Geração automática de contratos, termos e documentos com assinatura digital.",
  },
  {
    icon: Shield,
    title: "Segurança e LGPD",
    description: "Dados criptografados, controle de acesso e conformidade total com a LGPD.",
  },
  {
    icon: BarChart3,
    title: "Relatórios Inteligentes",
    description: "Dashboards em tempo real, métricas de RH e insights para decisões estratégicas.",
  },
];

const Features = () => {
  return (
    <section id="recursos" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Tudo que seu RH precisa,{" "}
            <span className="text-gradient">num só sistema</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Automatize processos, reduza erros e libere tempo para o que realmente importa: cuidar das pessoas.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="group p-8 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-card transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
