// Aba Segurança das Configurações — onde quem paga cadastra o PRÓPRIO celular
// de confirmação de pagamento.
//
// A aba só aparece pra quem executa pagamento (ver ConfiguracoesPage): quem não
// paga não tem o que fazer aqui, e esconder reduz a superfície de engenharia
// social ("me ajuda a cadastrar meu número aí no seu login").
//
// REGRA DURA DE TELA: nunca mostramos o telefone inteiro. Só `phone_last4`,
// que vem do banco como coluna gerada. Nem o código de verificação aparece —
// ele existe só no WhatsApp do dono do aparelho.

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DeviceMobile,
  ShieldCheck,
  Warning,
  Clock,
  Lock,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  derivePayment2faState,
  usePayment2faDevice,
  type Payment2faDevice,
  type Payment2faState,
} from "@/hooks/usePayment2fa";
import { Payment2faEnrollDialog } from "@/components/dashboard/Payment2faEnrollDialog";

/** "(••) ••••-1234" — a máscara mostra o formato sem entregar o número. */
function maskedPhone(last4: string | null | undefined): string {
  return `(••) ••••-${last4 ?? "••••"}`;
}

function formatMoment(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR });
}

export function SecurityTab() {
  const { data: device, isLoading } = usePayment2faDevice();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Relógio próprio: os estados "bloqueado" e "em janela de espera" viram
  // "ativo" só pela passagem do tempo, sem nenhuma mudança no banco. Sem esse
  // tick, a pessoa esperaria a hora passar olhando pra uma tela que continua
  // dizendo que falta esperar. 30s é fino o bastante pra não parecer travado.
  const [now, setNow] = useState(() => Date.now());

  const state: Payment2faState = derivePayment2faState(device, now);

  useEffect(() => {
    if (state !== "locked" && state !== "waiting") return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [state]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-9 w-44" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" weight="fill" />
            Celular de confirmação de pagamento
          </CardTitle>
          <CardDescription>
            Antes de qualquer pagamento sair, mandamos um código pra esse celular.
            É o que garante que só você libera dinheiro com o seu login.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {state === "none" && <NoDeviceState />}
          {state === "pending" && <PendingState device={device!} />}
          {state === "active" && <ActiveState device={device!} />}
          {state === "waiting" && <WaitingState device={device!} />}
          {state === "locked" && <LockedState device={device!} />}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setDialogOpen(true)}>
              <DeviceMobile className="w-4 h-4 mr-2" />
              {state === "none"
                ? "Cadastrar celular"
                : state === "pending"
                  ? "Continuar cadastro"
                  : "Trocar celular"}
            </Button>
            {state !== "none" && state !== "pending" && (
              <p className="text-xs text-muted-foreground">
                Trocar de aparelho começa uma janela de 1 hora antes do novo valer.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            1. Você informa o seu celular e a sua senha atual — a senha entra aqui
            porque trocar esse número é o que desprotege o pagamento.
          </p>
          <p>
            2. O WhatsApp da empresa manda um código de 6 dígitos pro seu número.
            Ele vale 10 minutos e tem 3 tentativas.
          </p>
          <p>
            3. Confirmado o código, o aparelho passa a ser o seu segundo fator.
            Guardamos só o final do número — o resto fica protegido no cadastro.
          </p>
          <p className="pt-1">
            Recebeu um código que você não pediu? Não use e avisa o admin: alguém
            pode estar tentando entrar na sua conta.
          </p>
        </CardContent>
      </Card>

      <Payment2faEnrollDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isReplacement={state === "active" || state === "waiting" || state === "locked"}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocos de estado
// ─────────────────────────────────────────────────────────────────────────────

function NoDeviceState() {
  return (
    <div className="rounded-lg border border-dashed p-4 flex items-start gap-3">
      <DeviceMobile className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">Nenhum celular cadastrado</p>
          <Badge variant="neutral">Sem aparelho</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Enquanto não tiver um aparelho confirmado, você não consegue realizar
          pagamentos. Leva um minuto pra resolver.
        </p>
      </div>
    </div>
  );
}

function PendingState({ device }: { device: Payment2faDevice }) {
  return (
    <div className="rounded-lg bg-warning/10 p-4 flex items-start gap-3">
      <Warning className="w-5 h-5 text-warning mt-0.5 shrink-0" weight="fill" />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{maskedPhone(device.phone_last4)}</p>
          <Badge variant="warning">Cadastro pendente</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          O código foi enviado mas ninguém confirmou. Recomeça o cadastro pra
          receber um código novo — o aparelho só vale depois da confirmação.
        </p>
      </div>
    </div>
  );
}

function ActiveState({ device }: { device: Payment2faDevice }) {
  return (
    <div className="rounded-lg bg-success/10 p-4 flex items-start gap-3">
      <CheckCircle className="w-5 h-5 text-success mt-0.5 shrink-0" weight="fill" />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{maskedPhone(device.phone_last4)}</p>
          <Badge variant="success">Ativo</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {device.verified_at
            ? `Confirmado em ${formatMoment(device.verified_at)}. `
            : ""}
          Todo pagamento vai pedir um código nesse aparelho.
        </p>
      </div>
    </div>
  );
}

function WaitingState({ device }: { device: Payment2faDevice }) {
  return (
    <div className="rounded-lg bg-warning/10 p-4 flex items-start gap-3">
      <Clock className="w-5 h-5 text-warning mt-0.5 shrink-0" weight="fill" />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{maskedPhone(device.phone_last4)}</p>
          <Badge variant="warning">Liberando</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Celular confirmado, mas ele só autoriza pagamento a partir de{" "}
          {formatMoment(device.active_from)}. É a janela de segurança da troca de
          aparelho — se essa troca não foi você, fala com o admin agora.
        </p>
      </div>
    </div>
  );
}

function LockedState({ device }: { device: Payment2faDevice }) {
  return (
    <div className="rounded-lg bg-destructive/10 p-4 flex items-start gap-3">
      <Lock className="w-5 h-5 text-destructive mt-0.5 shrink-0" weight="fill" />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{maskedPhone(device.phone_last4)}</p>
          <Badge variant="destructive">Bloqueado</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Códigos errados demais em sequência. O aparelho volta a valer em{" "}
          {formatMoment(device.locked_until)}. Se não foi você tentando, avisa o
          admin.
        </p>
      </div>
    </div>
  );
}

export default SecurityTab;
