// Empurrãozinho pra ativar o 2º fator: aparece uma vez por sessão pra quem tem
// papel administrativo (admin_gc/diretoria) e ainda não cadastrou fator.
//
// É dispensável de propósito — v1 não tranca o login de quem não ativou, pra não
// arriscar deixar todo admin de fora num dia de rollout. Uma vez ativado, o
// step-up passa a ser exigido (e a RLS já barra os dados sensíveis em AAL1).

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "@phosphor-icons/react";
import { useDashboard } from "@/contexts/DashboardContext";
import { useMfaGate } from "@/hooks/useLoginMfa";
import { MfaEnrollDialog } from "@/components/security/MfaEnrollDialog";

const MFA_ROLES = ["admin_gc", "diretoria"] as const;
const DISMISS_KEY = "mfa-nudge-dismissed";

export function MfaEnrollNudge() {
  const { hasAnyRole } = useDashboard();
  const { data: gate, isLoading } = useMfaGate();
  const [open, setOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const required = hasAnyRole([...MFA_ROLES]);

  useEffect(() => {
    if (isLoading || !gate) return;
    if (!required || gate.hasVerifiedFactor) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    setOpen(true);
  }, [isLoading, gate, required]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="w-6 h-6 text-primary" weight="fill" />
            </div>
            <DialogTitle className="text-center">Proteja sua conta</DialogTitle>
            <DialogDescription className="text-center">
              Seu perfil acessa folha e dados pessoais de colaboradores. Ative a
              verificação em duas etapas: um código no seu WhatsApp a cada login,
              pra que ninguém entre só com a sua senha.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="ghost" onClick={dismiss}>
              Agora não
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                setEnrollOpen(true);
              }}
            >
              Ativar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MfaEnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} />
    </>
  );
}

export default MfaEnrollNudge;
