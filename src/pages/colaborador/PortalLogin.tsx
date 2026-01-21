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
            checkAndRedirect(session.user.id, session.user.email ?? undefined);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkAndRedirect(session.user.id, session.user.email ?? undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const normalizeEmail = (value: string) => value.toLowerCase().trim();

  const tryLinkCollaboratorByEmail = async (userId: string, emailValue: string) => {
    const normalizedEmail = normalizeEmail(emailValue);

    // Prefer exact match, but accept case-insensitive matches as fallback.
    const tryUpdate = async (mode: "eq" | "ilike") => {
      let q = supabase
        .from("collaborators")
        .update({ user_id: userId })
        .is("user_id", null);

      q = mode === "eq" ? q.eq("email", normalizedEmail) : q.ilike("email", normalizedEmail);

      return q.select("id").maybeSingle();
    };

    const { data: linkedEq, error: eqError } = await tryUpdate("eq");
    if (eqError) throw eqError;
    if (linkedEq) return linkedEq;

    const { data: linkedIlike, error: ilikeError } = await tryUpdate("ilike");
    if (ilikeError) throw ilikeError;
    return linkedIlike;
  };

  const checkAndRedirect = async (userId: string, userEmail?: string) => {
    // 1) Already linked?
    const { data: collab } = await supabase
      .from("collaborators")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (collab) {
      navigate("/colaborador");
      return true;
    }

    // 2) Not linked yet -> try linking by email (common when the account already existed)
    if (userEmail) {
      const linked = await tryLinkCollaboratorByEmail(userId, userEmail);
      if (linked) {
        navigate("/colaborador");
        return true;
      }
    }

    return false;
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
      const normalizedEmail = normalizeEmail(email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
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

      const ok = await checkAndRedirect(
        data.user?.id ?? "",
        data.user?.email ?? normalizedEmail
      );

      if (!ok) {
        // Evita loop: mantém o usuário fora do portal até o vínculo existir.
        await supabase.auth.signOut();
        toast({
          title: "Acesso não liberado",
          description:
            "Sua conta foi encontrada, mas ainda não está vinculada a um colaborador. Verifique com o RH.",
          variant: "destructive",
        });
      }
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

    // OBS: não fazemos lookup por email aqui pois a tabela de colaboradores é protegida por RLS.
    // A validação/vínculo acontece no passo seguinte após autenticar o usuário.
    setCollaboratorName("");
    setCollaboratorId("");
    setStep("first-access-password");

    toast({
      title: "Continuar",
      description: "Agora defina sua senha. Se o email não estiver cadastrado pelo RH, avisaremos.",
    });
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
      const normalizedEmail = normalizeEmail(email);

      // Create user in Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/colaborador`,
        },
      });

      if (signUpError) throw signUpError;

      if (!authData.user) {
        throw new Error("Erro ao criar usuário");
      }

      // Ensure we have an authenticated session (some setups may not auto-login on signup)
      await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      // Link user to collaborator by EMAIL (update policy checks auth.jwt email)
      const linked = await tryLinkCollaboratorByEmail(authData.user.id, normalizedEmail);
      if (!linked) {
        await supabase.auth.signOut();
        toast({
          title: "Email não encontrado",
          description:
            "Este email não está cadastrado como colaborador (ou já possui acesso). Verifique com o RH.",
          variant: "destructive",
        });
        return;
      }

      const { data: linkedCollab, error: linkedReadError } = await supabase
        .from("collaborators")
        .select("id, name")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (linkedReadError) throw linkedReadError;

      setCollaboratorName(linkedCollab.name ?? "");
      setCollaboratorId(linkedCollab.id);

      toast({
        title: "Acesso criado com sucesso! 🎉",
        description: "Você já pode acessar o portal do colaborador.",
      });

      navigate("/colaborador");
    } catch (error: any) {
      if (error.message?.includes("User already registered")) {
        // Se o usuário já existe, tentamos entrar com a senha digitada e fazer o vínculo.
        try {
          const normalizedEmail = normalizeEmail(email);
          const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

          if (signInError) {
            toast({
              title: "Email já cadastrado",
              description: "Este email já possui uma conta. Tente fazer login.",
              variant: "destructive",
            });
            setStep("login");
            return;
          }

          const ok = await checkAndRedirect(
            data.user?.id ?? "",
            data.user?.email ?? normalizedEmail
          );

          if (!ok) {
            await supabase.auth.signOut();
            toast({
              title: "Acesso não liberado",
              description:
                "Sua conta existe, mas ainda não está vinculada ao seu cadastro de colaborador. Verifique com o RH.",
              variant: "destructive",
            });
            return;
          }
        } catch {
          toast({
            title: "Email já cadastrado",
            description: "Este email já possui uma conta. Tente fazer login.",
            variant: "destructive",
          });
          setStep("login");
        }
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
              {step === "first-access-password" && (collaboratorName ? `Olá, ${collaboratorName}!` : "Definir senha")}
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