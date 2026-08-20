import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CircleNotch as Loader2, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  useSaveGatewayConfig,
  type GatewayConfigView,
  type PixEnv,
} from "../hooks/use-pix-env";

// ─────────────────────────────────────────────────────────────────────────────
// Formulário das credenciais do Santander de UM ambiente.
//
// O client_secret é o único campo sensível: vai como password e, quando já
// existe segredo salvo, o placeholder deixa claro que digitar de novo é opcional
// (vazio = mantém o atual). O certificado NÃO entra aqui — é arquivo no gateway.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_DEFAULTS: Record<PixEnv, string> = {
  sandbox: "https://trust-sandbox.api.santander.com.br",
  production: "https://trust-open.api.santander.com.br",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function PixGatewayConfigForm({
  environment,
  initial,
}: {
  environment: PixEnv;
  initial: GatewayConfigView | null;
}) {
  const save = useSaveGatewayConfig();
  const [form, setForm] = useState({
    client_id: initial?.client_id ?? "",
    client_secret: "",
    workspace_id: initial?.workspace_id ?? "",
    base_url: initial?.base_url ?? BASE_DEFAULTS[environment],
    debit_branch: initial?.debit_branch ?? "",
    debit_account: initial?.debit_account ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    try {
      await save.mutateAsync({
        environment,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret || undefined,
        workspace_id: form.workspace_id.trim(),
        base_url: form.base_url.trim(),
        debit_branch: form.debit_branch.trim(),
        debit_account: form.debit_account.trim(),
      });
      toast.success(`Credenciais de ${environment} salvas.`);
      set("client_secret", "");
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra salvar.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Client ID">
          <Input
            className="h-9"
            value={form.client_id}
            onChange={(e) => set("client_id", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Client Secret">
          <Input
            className="h-9"
            type="password"
            value={form.client_secret}
            onChange={(e) => set("client_secret", e.target.value)}
            placeholder={initial?.has_secret ? "•••• (deixa em branco pra manter)" : "obrigatório"}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Workspace ID">
          <Input
            className="h-9"
            value={form.workspace_id}
            onChange={(e) => set("workspace_id", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Base URL">
          <Input
            className="h-9"
            value={form.base_url}
            onChange={(e) => set("base_url", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Agência (débito)">
          <Input
            className="h-9 mono"
            value={form.debit_branch}
            onChange={(e) => set("debit_branch", e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Conta (débito)">
          <Input
            className="h-9 mono"
            value={form.debit_account}
            onChange={(e) => set("debit_account", e.target.value)}
            inputMode="numeric"
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FloppyDisk className="w-4 h-4 mr-2" />
          )}
          Salvar {environment}
        </Button>
      </div>
    </div>
  );
}
