import { Users, Wallet, Gift, Building2, UserCircle, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Gestão de Colaboradores",
    description: "Cadastro completo com CPF, cargo, setor e empresa. Controle de status ativo/inativo.",
  },
  {
    icon: Wallet,
    title: "Controle Financeiro",
    description: "Lançamentos de salários, vales, adicionais e custos por colaborador e competência.",
  },
  {
    icon: Gift,
    title: "Benefícios Flexíveis",
    description: "Cadastre benefícios mensais ou diários e atribua automaticamente aos colaboradores.",
  },
  {
    icon: UserCircle,
    title: "Portal do Colaborador",
    description: "Área exclusiva para o colaborador acessar contracheques, benefícios e extrato.",
  },
  {
    icon: Building2,
    title: "Multi-empresa",
    description: "Gerencie várias empresas e setores em uma única conta com controle centralizado.",
  },
  {
    icon: BarChart3,
    title: "Relatórios e Contabilidade",
    description: "Upload de contracheques em lote, associação automática e exportação de dados.",
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
