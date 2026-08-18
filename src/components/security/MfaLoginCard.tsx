// Card da aba Segurança: verificação em duas etapas no LOGIN (fator telefone
// nativo do GoTrue). Distinto do 2FA de pagamento — este protege a ENTRADA no
// sistema e é o que arma a exigência de AAL2 na RLS dos dados sensíveis.

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  Warning,
  DeviceMobile,
  Lock,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useDashboard } from "@/contexts/DashboardContext";
import { useMfaGate, unenrollFactor, useInvalidateMfaGate } from "@/hooks/useLoginMfa";
import { MfaEnrollDialog } from "@/components/security/MfaEnrollDialog";

/** Papéis para quem o 2º fator de login é esperado. */
const MFA_ROLES = ["admin_gc", "diretoria"] as const;

export function MfaLoginCard() {
  const { hasAnyRole } = useDashboard();
  const { data: gate, isLoading } = useMfaGate();
  const invalidateGate = useInvalidateMfaGate();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const required = hasAnyRole([...MFA_ROLES]);
  const active = !!gate?.hasVerifiedFactor;

  const handleRemove = async () => {
    if (!gate?.verifiedPhone) return;
    setRemoving(true);
    try {
      await unenrollFactor(gate.verifiedPhone.id);
      invalidateGate();
      toast.success("Verificação em duas etapas removida.");
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "";
      if (/aal2|assurance|insufficient/i.test(msg)) {
        toast.error("Pra remover, entre de novo e confirme o 2º fator primeiro.");
      } else {
        toast.error(msg || "Não deu pra remover agora.");
      }
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" weight="fill" />
              Verificação em duas etapas (login)
            </CardTitle>
            <CardDescription className="mt-1">
              Um código no seu WhatsApp toda vez que você entra. Protege a conta
              mesmo se a senha vazar.
            </CardDescription>
          </div>
          {!isLoading &&
            (active ? (
              <Badge className="shrink-0 bg-primary/10 text-primary hover:bg-primary/10">
                Ativa
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">
                Inativa
              </Badge>
            ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : active ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <DeviceMobile className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>
                Ativa no celular do final{" "}
                <span className="font-medium">
                  {gate?.verifiedPhone?.phoneLast4 ?? "••••"}
                </span>
                .
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleRemove} disabled={removing}>
              {removing ? "Removendo..." : "Remover 2º fator"}
            </Button>
          </>
        ) : (
          <>
            {required && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-foreground">
                <Warning className="w-4 h-4 mt-0.5 shrink-0 text-warning" weight="fill" />
                <span>
                  Seu perfil tem acesso a dados sensíveis (folha, PII). Ative a
                  verificação em duas etapas pra proteger essa entrada.
                </span>
              </div>
            )}
            <Button onClick={() => setEnrollOpen(true)}>
              <Lock className="w-4 h-4 mr-2" />
              Ativar agora
            </Button>
          </>
        )}
      </CardContent>

      <MfaEnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} />
    </Card>
  );
}

export default MfaLoginCard;
