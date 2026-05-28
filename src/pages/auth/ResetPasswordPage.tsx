import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeSlash as EyeOff,
  Warning,
} from "@phosphor-icons/react";
import { BrandLogo } from "@/components/branding/BrandLogo";

const passwordSchema = z
  .object({
    password: z.string().min(6, "Tá curto demais. Pelo menos 6 caracteres."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não tão batendo.",
    path: ["confirm"],
  });

type Status = "waiting" | "ready" | "invalid";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<Status>("waiting");
  const { toast } = useToast();
  const navigate = useNavigate();

  // Supabase dispara PASSWORD_RECOVERY após o user clicar no link do email.
  // Antes disso a página fica em estado "waiting" — depois "ready" ou
  // (se não chegou evento + sem sessão em ~2s) "invalid".
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
          setStatus("ready");
        }
      },
    );

    // Se já tem sessão (user clicou e voltou pra cá), libera direto
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus("ready");
    });

    // Timeout: se em 3s nada veio, considera link inválido
    const timer = setTimeout(() => {
      setStatus((s) => (s === "waiting" ? "invalid" : s));
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = passwordSchema.safeParse({ password, confirm });
    if (!validation.success) {
      toast({
        title: "Confere os campos",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast({
        title: "Senha atualizada ✓",
        description: "Já te levo pro dashboard.",
      });

      // Pequeno delay pra UX (toast fica visível)
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err) {
      console.error("reset-password:", err);
      toast({
        title: "Não rolou",
        description:
          (err as Error)?.message ?? "Tenta de novo ou pede um novo link.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-card p-8 border border-border">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <BrandLogo size="lg" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {status === "invalid" ? "Link inválido" : "Criar nova senha"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {status === "invalid"
                ? "Esse link já expirou ou não tá mais válido."
                : status === "waiting"
                  ? "Validando o link..."
                  : "Quase lá. Escolhe a nova senha pra acessar o DNA Softcom."}
            </p>
          </div>

          {status === "invalid" ? (
            <div className="space-y-5">
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4 flex gap-3">
                <div className="w-9 h-9 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                  <Warning className="w-5 h-5" weight="fill" />
                </div>
                <div className="text-sm text-muted-foreground">
                  Links de redefinição expiram em 1 hora. Pede um novo na tela
                  de login.
                </div>
              </div>
              <Button asChild variant="hero" size="lg" className="w-full">
                <Link to="/esqueci-senha">Pedir novo link</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to="/login" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Voltar pro login
                </Link>
              </Button>
            </div>
          ) : status === "waiting" ? (
            <div className="space-y-3 py-6">
              <div className="h-12 bg-muted rounded animate-pulse" />
              <div className="h-12 bg-muted rounded animate-pulse" />
              <div className="h-12 bg-muted rounded animate-pulse" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Pelo menos 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
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
                <Label htmlFor="confirm">Confirmar nova senha</Label>
                <Input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digita de novo"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="h-12"
                />
                {confirm && password !== confirm && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <Warning className="w-3 h-3" weight="fill" />
                    As senhas não tão batendo.
                  </p>
                )}
                {confirm && password === confirm && password.length >= 6 && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" weight="fill" />
                    Beleza, senhas conferem.
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={
                  isLoading ||
                  password.length < 6 ||
                  password !== confirm
                }
              >
                {isLoading ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
