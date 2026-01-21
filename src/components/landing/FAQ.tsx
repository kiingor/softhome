import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Meus dados estão seguros no Meu RH?",
    answer: "Absolutamente. Utilizamos criptografia de ponta a ponta, servidores em território nacional e seguimos rigorosamente todas as diretrizes da LGPD. Realizamos backups diários e auditorias de segurança regulares.",
  },
  {
    question: "Como funciona a integração com a contabilidade?",
    answer: "O Meu RH exporta automaticamente os dados de folha de pagamento em formatos compatíveis com os principais sistemas contábeis do mercado (Domínio, Alterdata, Fortes, etc). Também oferecemos API para integrações personalizadas.",
  },
  {
    question: "Posso migrar os dados do meu sistema atual?",
    answer: "Sim! Nossa equipe de onboarding auxilia na migração completa dos dados. Importamos planilhas Excel, CSV ou conectamos diretamente com outros sistemas. O processo leva em média 3 a 5 dias úteis.",
  },
  {
    question: "Como funcionam os planos por número de colaboradores?",
    answer: "Cada plano tem um limite de colaboradores ativos. Quando sua empresa cresce, basta fazer upgrade. Não cobramos por usuários (gestores de RH), apenas por colaboradores cadastrados.",
  },
  {
    question: "Existe contrato de fidelidade?",
    answer: "Não. Nossos planos são mensais e você pode cancelar a qualquer momento. Também oferecemos planos anuais com desconto de 20% para quem preferir.",
  },
  {
    question: "Vocês oferecem suporte para implementação?",
    answer: "Sim! Todos os planos incluem suporte para configuração inicial. Planos Profissional e Enterprise contam com treinamento personalizado para sua equipe.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Perguntas{" "}
            <span className="text-gradient">frequentes</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Tire suas dúvidas sobre o Meu RH. Não encontrou o que procura? Fale com nosso time.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="border border-border rounded-xl px-6 data-[state=open]:border-primary/30 data-[state=open]:shadow-soft transition-all"
              >
                <AccordionTrigger className="text-left font-semibold text-foreground hover:text-primary py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
