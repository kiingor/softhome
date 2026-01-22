import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.object({
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

const AceitarConvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const email = searchParams.get("email") || "";
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [inviteData, setInviteData] = useState<{
    id: string;
    full_name: string | null;
    company_id: string;
    company_name?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateInvite = async () => {
      if (!email) {
        setError("Link de convite inválido. Email não encontrado.");
        setIsValidating(false);
        return;
      }

      try {
        // Check if invite exists and is pending
        const { data: invite, error: inviteError } = await supabase
          .from("company_users")
          .select(`
            id,
            full_name,
            company_id,
            accepted_at,
            companies:company_id (company_name)
          `)
          .eq("email", email.toLowerCase())
          .is("accepted_at", null)
          .single();

        if (inviteError || !invite) {
          setError("Convite não encontrado ou já foi aceito. Entre em contato com o administrador.");
          setIsValidating(false);
          return;
        }

        setInviteData({
          id: invite.id,
          full_name: invite.full_name,
          company_id: invite.company_id,
          company_name: (invite.companies as any)?.company_name,
        });
      } catch (err) {
        setError("Erro ao validar convite. Tente novamente mais tarde.");
      } finally {
        setIsValidating(false);
      }
    };

    validateInvite();
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
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

    if (!inviteData) {
      toast({
        title: "Erro",
        description: "Dados do convite não encontrados.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // 1. Create user account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (signUpError) {
        // Check if user already exists
        if (signUpError.message.includes("already registered")) {
          toast({
            title: "Email já cadastrado",
            description: "Este email já possui uma conta. Faça login normalmente.",
            variant: "destructive",
          });
          navigate("/login");
          return;
        }
        throw signUpError;
      }

      if (!authData.user) {
        throw new Error("Erro ao criar conta");
      }

      // 2. Update company_users to mark as accepted
      const { error: updateError } = await supabase
        .from("company_users")
        .update({
          user_id: authData.user.id,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", inviteData.id);

      if (updateError) {
        console.error("Error updating company_users:", updateError);
      }

      // 3. Create profile for the user
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          user_id: authData.user.id,
          full_name: inviteData.full_name,
          company_id: inviteData.company_id,
        });

      if (profileError) {
        console.error("Error creating profile:", profileError);
      }

      // 4. Add rh role to the user
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          role: "rh",
        });

      if (roleError) {
        console.error("Error adding role:", roleError);
      }

      toast({
        title: "Conta criada com sucesso!",
        description: "Você será redirecionado para o painel.",
      });

      // Navigate to dashboard
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Error accepting invite:", error);
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Ocorreu um erro. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">
          Validando convite...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Convite Inválido</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link to="/login">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Ir para Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Bem-vindo ao RH360!</CardTitle>
          <CardDescription>
            Você foi convidado para{" "}
            <span className="font-semibold text-foreground">
              {inviteData?.company_name || "a empresa"}
            </span>
            . Defina sua senha para acessar o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="bg-muted"
              />
            </div>

            {inviteData?.full_name && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  type="text"
                  value={inviteData.full_name}
                  disabled
                  className="bg-muted"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Criando conta..." : "Criar Conta e Acessar"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Já possui uma conta?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Fazer login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AceitarConvite;
