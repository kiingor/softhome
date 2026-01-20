import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Building2, Users, Calendar, FileText } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
        // Fetch company data
        setTimeout(() => {
          fetchCompanyData(session.user.id);
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchCompanyData = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (profile?.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("company_name")
          .eq("id", profile.company_id)
          .maybeSingle();

        if (company) {
          setCompanyName(company.company_name);
        }
      }
    } catch (error) {
      console.error("Error fetching company:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  const quickActions = [
    { icon: Users, label: "Colaboradores", description: "Gerencie sua equipe", color: "bg-primary/10 text-primary" },
    { icon: Calendar, label: "Férias", description: "Controle de ausências", color: "bg-accent/10 text-accent" },
    { icon: FileText, label: "Documentos", description: "Contratos e termos", color: "bg-secondary text-secondary-foreground" },
    { icon: Building2, label: "Empresa", description: "Configurações", color: "bg-muted text-muted-foreground" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
              <span className="text-primary-foreground font-bold text-lg">R</span>
            </div>
            <div>
              <span className="font-bold text-foreground">RH360</span>
              {companyName && (
                <p className="text-xs text-muted-foreground">{companyName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Olá! 👋
          </h1>
          <p className="text-muted-foreground">
            Bem-vindo ao seu painel de gestão de RH.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {quickActions.map((action, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-card transition-all cursor-pointer"
            >
              <div className={`w-12 h-12 rounded-xl ${action.color} flex items-center justify-center mb-4`}>
                <action.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-foreground mb-1">{action.label}</h3>
              <p className="text-sm text-muted-foreground">{action.description}</p>
            </div>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Comece adicionando colaboradores
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Cadastre sua equipe para começar a usar todos os recursos do RH360.
          </p>
          <Button variant="hero" size="lg">
            Adicionar primeiro colaborador
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
