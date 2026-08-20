import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Eye, EyeSlash as EyeOff } from "@phosphor-icons/react";
import { BrandLogo } from "@/components/branding/BrandLogo";
import {
  clearSessionClocks,
  consumeSessionEnded,
  SESSION_END_MESSAGES,
} from "@/lib/security/session-policy";
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Sessão derrubada por inatividade/tempo máximo deixa uma marca — avisamos
  // aqui pro usuário não achar que o sistema simplesmente o expulsou.
  useEffect(() => {
    const reason = consumeSessionEnded();
    if (reason) {
      toast({
        title: "Sessão encerrada",
        description: SESSION_END_MESSAGES[reason],
      });
    }
  }, [toast]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          navigate("/dashboard");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      toast({
        title: "Erro de validação",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            title: "Credenciais inválidas",
            description: "Email ou senha incorretos. Tente novamente.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      // Relógios de sessão zerados: a nova sessão não pode herdar a
      // inatividade acumulada pela anterior.
      clearSessionClocks();

      toast({
        title: "Login realizado! 🎉",
        description: "Bem-vindo de volta ao DNA Softcom!",
      });

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Erro ao fazer login",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Grid de 2 colunas do handoff: arte à esquerda, formulário à direita.
    // Abaixo de lg a arte some e o formulário ocupa a tela inteira.
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* ---------- arte ---------- */}
      <aside className="relative hidden flex-col justify-between overflow-hidden gradient-hero p-12 lg:flex">
        {/* textura discreta: pontos que somem nas bordas, sem competir com o texto */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse at 30% 30%, #000 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 30%, #000 30%, transparent 75%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-base font-extrabold leading-none text-primary-foreground">D</span>
          </div>
          <div>
            <p className="text-[15px] font-extrabold leading-tight text-white">DNA Softcom</p>
            <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/45">
              Gente &amp; Cultura
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h2 className="text-[40px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white">
            Todo mundo da Softcom,
            <br />
            <span className="text-primary">num lugar só.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/55">
            Admissão, jornada, folha e recrutamento sem planilha no meio do caminho.
          </p>
        </div>

        <p className="mono relative text-[10px] uppercase tracking-[0.14em] text-white/30">
          Softcom Tecnologia · Sistema interno
        </p>
      </aside>

      {/* ---------- formulário ---------- */}
      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[400px]">
          {/* marca compacta, só quando a arte não está visível */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo size="md" />
            <p className="text-[15px] font-extrabold text-foreground">DNA Softcom</p>
          </div>

          <p className="label-eyebrow">Acesso</p>
          <h1 className="page-title mt-1">Entrar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use o e-mail corporativo da Softcom.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="voce@softcomtecnologia.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link
                  to="/esqueci-senha"
                  className="text-[13px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-8 text-[13px] text-muted-foreground">
            É colaborador?{" "}
            <Link to="/portal/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Acesse o portal
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
