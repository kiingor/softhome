import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
            <span className="text-primary-foreground font-bold text-lg">R</span>
          </div>
          <span className="text-xl font-bold text-foreground">RH360</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#recursos" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
            Recursos
          </a>
          <a href="#planos" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
            Planos
          </a>
          <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
            Dúvidas
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Entrar
            </Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">
              Comece grátis
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
