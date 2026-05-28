import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { ArrowLeft, CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { BrandLogo } from "@/components/branding/BrandLogo";

const emailSchema = z.object({
  email: z.string().email("Esse email tá com algo errado."),
});

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = emailSchema.safeParse({ email });
    if (!validation.success) {
      toast({
        title: "Email inválido",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // O `redirectTo` aponta pra página de reset. Supabase devolve o usuário
      // com sessão temporária + evento PASSWORD_RECOVERY no client.
      const redirectTo = `${window.location.origin}/redefinir-senha`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      // Mostramos sucesso mesmo se der erro de "email não encontrado" — não
      // vazar quais emails estão cadastrados. Logamos só pro console.
      if (error) {
        console.warn("resetPasswordForEmail:", error.message);
      }

      setSent(true);
    } catch (err) {
      console.error("forgot-password:", err);
      // Mesmo em erro de rede, exibe sucesso genérico (privacidade).
      setSent(true);
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
              {sent ? "Email a caminho" : "Esqueceu a senha?"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {sent
                ? "Se esse email tá cadastrado, você vai receber um link em alguns segundos."
                : "Sem stress. Coloca seu email que mandamos um link pra você criar uma nova."}
            </p>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" weight="fill" />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-foreground mb-1">
                    Confere sua caixa de entrada
                  </p>
                  <p className="text-muted-foreground">
                    O link expira em 1 hora. Não veio? Dá uma olhada no spam ou{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setSent(false);
                        setEmail("");
                      }}
                    >
                      tente outro email
                    </button>
                    .
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link to="/login" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Voltar pro login
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <EnvelopeSimple className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="h-12 pl-11"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "Enviando..." : "Enviar link"}
              </Button>

              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to="/login" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Voltar pro login
                </Link>
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
