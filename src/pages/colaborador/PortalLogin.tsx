import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Eye, EyeOff, ArrowLeft, UserPlus, LogIn, Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const passwordSchema = z.object({
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não conferem",
  path: ["confirmPassword"],
});

type FlowStep = "choice" | "login" | "first-access-email" | "first-access-password";

const PortalLogin = () => {
  const [step, setStep] = useState<FlowStep>("choice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [collaboratorName, setCollaboratorName] = useState("");
  const [collaboratorId, setCollaboratorId] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          // Check if user has collaborator role
          setTimeout(() => {
            checkAndRedirect(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkAndRedirect(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkAndRedirect = async (userId: string) => {
    const { data: collab } = await supabase
      .from("collaborators")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (collab) {
      navigate("/colaborador");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
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

      toast({
        title: "Login realizado! 🎉",
        description: "Bem-vindo ao Portal do Colaborador!",
      });

      navigate("/colaborador");
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

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !z.string().email().safeParse(email).success) {
      toast({
        title: "Email inválido",
        description: "Por favor, insira um email válido.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Check if email exists in collaborators table (case-insensitive)
      const { data: collab, error } = await supabase
        .from("collaborators")
        .select("id, name, user_id, email")
        .ilike("email", email.trim())
        .maybeSingle();

      if (error) throw error;

      if (!collab) {
        toast({
          title: "Email não encontrado",
          description: "Este email não está cadastrado como colaborador. Verifique com o RH da sua empresa.",
          variant: "destructive",
        });
        return;
      }

      if (collab.user_id) {
        toast({
          title: "Acesso já configurado",
          description: "Este email já possui um acesso. Use a opção de login.",
          variant: "destructive",
        });
        setStep("login");
        return;
      }

      // Email found and no user linked yet
      setCollaboratorName(collab.name);
      setCollaboratorId(collab.id);
      setStep("first-access-password");
      
      toast({
        title: `Olá, ${collab.name}!`,
        description: "Agora defina sua senha de acesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao verificar email",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = passwordSchema.safeParse({ password, confirmPassword });
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
      // Create user in Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/colaborador`,
        },
      });

      if (signUpError) throw signUpError;

      if (!authData.user) {
        throw new Error("Erro ao criar usuário");
      }

      // Link user to collaborator - the trigger will automatically add the "colaborador" role
      const { error: updateError } = await supabase
        .from("collaborators")
        .update({ user_id: authData.user.id })
        .eq("id", collaboratorId);

      if (updateError) throw updateError;

      toast({
        title: "Acesso criado com sucesso! 🎉",
        description: "Você já pode acessar o portal do colaborador.",
      });

      // Auto login
      await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      navigate("/colaborador");
    } catch (error: any) {
      if (error.message?.includes("User already registered")) {
        toast({
          title: "Email já cadastrado",
          description: "Este email já possui uma conta. Tente fazer login.",
          variant: "destructive",
        });
        setStep("login");
      } else {
        toast({
          title: "Erro ao criar acesso",
          description: error.message || "Tente novamente mais tarde.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetFlow = () => {
    setStep("choice");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setCollaboratorName("");
    setCollaboratorId("");
  };

  return (
    <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao início
        </Link>

        <div className="bg-card rounded-2xl shadow-card p-8 border border-border">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
                <span className="text-primary-foreground font-bold text-xl">M</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {step === "choice" && "Portal do Colaborador"}
              {step === "login" && "Entrar"}
              {step === "first-access-email" && "Primeiro Acesso"}
              {step === "first-access-password" && `Olá, ${collaboratorName}!`}
            </h1>
            <p className="text-muted-foreground mt-2">
              {step === "choice" && "Acesse sua área exclusiva"}
              {step === "login" && "Entre com suas credenciais"}
              {step === "first-access-email" && "Digite o email cadastrado pelo RH"}
              {step === "first-access-password" && "Defina sua senha de acesso"}
            </p>
          </div>

          {/* Choice Step */}
          {step === "choice" && (
            <div className="space-y-4">
              <Button
                variant="hero"
                size="lg"
                className="w-full"
                onClick={() => setStep("login")}
              >
                <LogIn className="w-5 h-5 mr-2" />
                Já tenho acesso
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => setStep("first-access-email")}
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Primeiro Acesso
              </Button>
            </div>
          )}

          {/* Login Step */}
          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                variant="hero" 
                size="lg" 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={resetFlow}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </form>
          )}

          {/* First Access - Email Step */}
          {step === "first-access-email" && (
            <form onSubmit={handleCheckEmail} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email cadastrado</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
                <p className="text-xs text-muted-foreground">
                  Use o mesmo email que o RH cadastrou para você
                </p>
              </div>

              <Button 
                type="submit" 
                variant="hero" 
                size="lg" 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  "Continuar"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={resetFlow}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </form>
          )}

          {/* First Access - Password Step */}
          {step === "first-access-password" && (
            <form onSubmit={handleCreateAccess} className="space-y-5">
              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                Criando acesso para: <strong className="text-foreground">{email}</strong>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Digite a senha novamente"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                variant="hero" 
                size="lg" 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando acesso...
                  </>
                ) : (
                  "Criar Meu Acesso"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={resetFlow}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao início
              </Button>
            </form>
          )}

          {step === "choice" && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              É administrador?{" "}
              <Link to="/login" className="text-primary font-semibold hover:underline">
                Acesse aqui
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalLogin;