import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import defaultHeroImage from "@/assets/hero-illustration.png";
const Hero = () => {
  // Começa vazio para não mostrar a imagem antiga/padrão e trocar bruscamente
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 👉 MESMA LÓGICA DO HEADER
  const scrollToSection = (href: string) => {
    const targetId = href.replace("#", "");
    const element = document.getElementById(targetId);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    async function loadHeroImage() {
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", "hero_image_url")
          .single();

        const url = data?.setting_value ? data.setting_value : defaultHeroImage;

        setHeroImage(url);
        setImageLoaded(false);
      } catch (error) {
        setHeroImage(defaultHeroImage);
        setImageLoaded(false);
      }
    }

    loadHeroImage();
  }, []);

  return (
    <section className="pt-32 pb-20 gradient-warm overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse-soft" />
              Novo: Gestão de férias automática
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground leading-tight mb-6">
              RH descomplicado, <span className="text-gradient">pessoas felizes</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Gerencie folha de pagamento, férias, benefícios e toda a jornada do colaborador em um só lugar. Simples
              assim.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/signup">
                <Button variant="hero" size="xl" className="w-full sm:w-auto">
                  Comece agora grátis
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Button variant="outline" size="xl" className="w-full sm:w-auto">
                <Play className="w-5 h-5" />
                Ver Planos
              </Button>
            </div>

            <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                3 dias grátis
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Sem cartão de crédito
              </div>
            </div>
          </div>

          <div className="relative animate-float">
            <div className="absolute -inset-4 gradient-hero rounded-3xl opacity-20 blur-3xl" />

            {/* Skeleton para evitar troca brusca de imagem */}
            {(!heroImage || !imageLoaded) && (
              <div className="relative w-full rounded-2xl shadow-card bg-muted animate-pulse aspect-[4/3]" />
            )}

            {heroImage && (
              <img
                src={heroImage}
                alt="Sistema de RH Meu RH - Dashboard de gestão de pessoas, folha de pagamento, férias e benefícios para empresas"
                title="Meu RH - Sistema de Gestão de RH em Nuvem"
                className={`relative w-full rounded-2xl shadow-card transition-opacity duration-300 ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                loading="eager"
                decoding="async"
                onLoad={() => setImageLoaded(true)}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
