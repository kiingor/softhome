import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  CircleNotch as Loader2,
  ArrowsClockwise,
  Warning,
  ShieldCheck,
  Flask,
  Buildings,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  usePixEnvStatus,
  usePixEnvSwitch,
  useGatewayConfig,
  type GatewayStatus,
  type EnvChallenge,
  type PixEnv,
} from "../hooks/use-pix-env";
import { PixGatewayConfigForm } from "./PixGatewayConfigForm";
import { CaretDown } from "@phosphor-icons/react";

// ─────────────────────────────────────────────────────────────────────────────
// Painel do ambiente do PIX — troca sandbox↔produção sem SSH.
//
// Ligar PRODUÇÃO é a operação mais séria daqui: liga pagamentos REAIS. Por isso
// passa por um diálogo com aviso forte + código no WhatsApp; o servidor ainda
// prova que o gateway de produção autentica antes de deixar. Voltar pra sandbox
// é a direção segura (um clique confirmado) — como um kill-switch tem que ser.
//
// Os SEGREDOS do Santander não aparecem aqui: o painel só troca a flag. Configurar
// as credenciais é no gateway (SSH), uma vez por ambiente.
// ─────────────────────────────────────────────────────────────────────────────

const secondsUntil = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

function StatusDot({ s }: { s: GatewayStatus }) {
  const tone = !s.configured
    ? "bg-muted-foreground/40"
    : s.healthy
      ? "bg-success"
      : "bg-warning";
  const label = !s.configured ? "não configurado" : s.healthy ? "online" : "sem resposta";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("w-2 h-2 rounded-full", tone)} />
      {label}
    </span>
  );
}

export function PixEnvironmentCard() {
  const status = usePixEnvStatus();
  const config = useGatewayConfig();
  const { challenge, doSwitch } = usePixEnvSwitch();
  const [configOpen, setConfigOpen] = useState<PixEnv | null>(null);

  const [prodOpen, setProdOpen] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [etapa, setEtapa] = useState<"aviso" | "codigo">("aviso");
  const [desafio, setDesafio] = useState<EnvChallenge | null>(null);
  const [codigo, setCodigo] = useState("");
  const [restante, setRestante] = useState(0);

  const active = status.data?.active;

  useEffect(() => {
    if (!prodOpen) {
      setEtapa("aviso");
      setDesafio(null);
      setCodigo("");
    }
  }, [prodOpen]);

  useEffect(() => {
    if (etapa !== "codigo" || !desafio) return;
    setRestante(secondsUntil(desafio.expires_at));
    const id = window.setInterval(() => setRestante(secondsUntil(desafio.expires_at)), 1000);
    return () => window.clearInterval(id);
  }, [etapa, desafio]);

  const enviarCodigo = async () => {
    try {
      const d = await challenge.mutateAsync();
      setDesafio(d);
      setEtapa("codigo");
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra mandar o código.");
    }
  };

  const ligarProducao = async () => {
    try {
      await doSwitch.mutateAsync({
        target: "production",
        challengeId: desafio?.challenge_id,
        code: codigo,
      });
      toast.success("Produção ligada. Os pagamentos agora são reais.");
      setProdOpen(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra ligar produção.");
      setCodigo("");
    }
  };

  const voltarSandbox = async () => {
    try {
      await doSwitch.mutateAsync({ target: "sandbox" });
      toast.success("Voltou pro sandbox. Nenhum pagamento real sai agora.");
      setSandboxOpen(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra voltar pro sandbox.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ArrowsClockwise className="w-5 h-5 text-primary" />
              Ambiente do PIX
            </CardTitle>
            <CardDescription>
              Onde os pagamentos da folha correm. Produção = dinheiro real.
            </CardDescription>
          </div>
          {active && (
            <Badge
              variant={active === "production" ? undefined : "warning"}
              className={cn(
                "shrink-0 gap-1.5",
                active === "production" && "border-transparent bg-destructive/12 text-destructive",
              )}
            >
              {active === "production" ? (
                <Buildings className="w-3.5 h-3.5" weight="fill" />
              ) : (
                <Flask className="w-3.5 h-3.5" weight="fill" />
              )}
              {active === "production" ? "PRODUÇÃO" : "SANDBOX"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {status.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> consultando…
          </div>
        ) : status.isError ? (
          <p className="text-sm text-muted-foreground">
            {(status.error as Error)?.message ?? "Não deu pra consultar o ambiente."}
          </p>
        ) : status.data ? (
          <>
            {/* Status dos dois gateways */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
                  <Flask className="w-3.5 h-3.5" /> Sandbox
                </div>
                <StatusDot s={status.data.sandbox} />
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
                  <Buildings className="w-3.5 h-3.5" /> Produção
                </div>
                <StatusDot s={status.data.production} />
              </div>
            </div>

            {/* Ação */}
            {active === "sandbox" ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground">
                  Ligar produção coloca a folha pra pagar de verdade. Pede um código
                  no seu WhatsApp de aprovação.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={!status.data.production.configured}
                  title={
                    status.data.production.configured
                      ? undefined
                      : "O gateway de produção ainda não está configurado no servidor"
                  }
                  onClick={() => setProdOpen(true)}
                >
                  Ligar produção
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Pagamentos estão em <strong className="text-destructive">produção</strong>.
                  Voltar pro sandbox interrompe os pagamentos reais.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setSandboxOpen(true)}
                >
                  Voltar pro sandbox
                </Button>
              </div>
            )}
          </>
        ) : null}

        {/* Credenciais do gateway, por ambiente. O certificado já está no gateway
            (o mesmo pros dois) — aqui vai o resto. O segredo é cifrado no servidor. */}
        <div className="border-t border-border pt-4 space-y-2">
          <p className="label-eyebrow">Credenciais do gateway</p>
          <p className="text-xs text-muted-foreground -mt-1">
            O certificado já está no gateway (o mesmo pros dois). O client_secret é
            cifrado no servidor — nunca aparece de volta aqui.
          </p>
          {(["sandbox", "production"] as PixEnv[]).map((env) => {
            const cfg = config.data?.[env] ?? null;
            const open = configOpen === env;
            return (
              <div key={env} className="rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                  onClick={() => setConfigOpen(open ? null : env)}
                >
                  <span className="flex items-center gap-2">
                    {env === "production" ? (
                      <Buildings className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Flask className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{env === "production" ? "Produção" : "Sandbox"}</span>
                    <span
                      className={cn(
                        "text-xs",
                        cfg ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {cfg ? "configurado" : "não configurado"}
                    </span>
                  </span>
                  <CaretDown
                    className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")}
                  />
                </button>
                {open && (
                  <div className="border-t border-border p-3">
                    <PixGatewayConfigForm environment={env} initial={cfg} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Diálogo: LIGAR PRODUÇÃO (aviso → código) */}
      <Dialog open={prodOpen} onOpenChange={setProdOpen}>
        <DialogContent className="sm:max-w-[440px]">
          {etapa === "aviso" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Warning className="w-5 h-5 text-destructive" weight="fill" />
                  Ligar pagamentos reais?
                </DialogTitle>
                <DialogDescription>
                  A partir daqui, cada "Pagar" na folha manda PIX de verdade. Vou
                  mandar um código pro seu WhatsApp de aprovação e conferir que o
                  gateway de produção está respondendo antes de ligar.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setProdOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={enviarCodigo}
                  disabled={challenge.isPending}
                >
                  {challenge.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Enviar código
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Digite o código</DialogTitle>
                <DialogDescription>
                  Mandei um código pro seu WhatsApp ●●●● {desafio?.last4}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-4">
                <InputOTP maxLength={6} value={codigo} onChange={setCodigo} autoFocus>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-xs text-muted-foreground">
                  {restante > 0
                    ? `Vale por mais ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}`
                    : "O código expirou. Fecha e começa de novo."}
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setProdOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={ligarProducao}
                  disabled={codigo.length !== 6 || doSwitch.isPending || restante === 0}
                >
                  {doSwitch.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <ShieldCheck className="w-4 h-4 mr-1.5" weight="fill" />
                  Ligar produção
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo: VOLTAR PRO SANDBOX (direção segura) */}
      <Dialog open={sandboxOpen} onOpenChange={setSandboxOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Voltar pro sandbox?</DialogTitle>
            <DialogDescription>
              Os pagamentos param de sair de verdade — voltam a ser simulados. Você
              pode religar produção quando quiser (com código).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSandboxOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={voltarSandbox} disabled={doSwitch.isPending}>
              {doSwitch.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Voltar pro sandbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
