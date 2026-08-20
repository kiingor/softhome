import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CircleNotch as Loader2,
  FloppyDisk,
  MagnifyingGlass,
  CheckCircle,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useSaveGatewayConfig,
  useDiscoverWorkspaces,
  useCreateWorkspace,
  useDeleteWorkspace,
  type GatewayConfigView,
  type PixEnv,
  type DiscoveredWorkspace,
} from "../hooks/use-pix-env";

// ─────────────────────────────────────────────────────────────────────────────
// Formulário das credenciais do Santander de UM ambiente.
//
// Em vez de digitar workspace/agência/conta no escuro: preenche client_id +
// secret + base URL, clica "Buscar", e ESCOLHE o workspace numa lista — a
// agência/conta preenchem sozinhas (mainDebitAccount) e o que tem PIX ativo fica
// marcado. O certificado NÃO entra aqui (é arquivo no gateway); o client_secret é
// cifrado no servidor.
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
  const discover = useDiscoverWorkspaces();
  const createWs = useCreateWorkspace();
  const deleteWs = useDeleteWorkspace();
  const [workspaces, setWorkspaces] = useState<DiscoveredWorkspace[] | null>(null);
  // Seleção por índice (o sandbox devolve o mesmo workspaceId pros três; casar
  // por id destacaria todos). Só o PIX-ativo é selecionável.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const [form, setForm] = useState({
    client_id: initial?.client_id ?? "",
    client_secret: "",
    workspace_id: initial?.workspace_id ?? "",
    base_url: initial?.base_url ?? BASE_DEFAULTS[environment],
    debit_branch: initial?.debit_branch ?? "",
    debit_account: initial?.debit_account ?? "",
    ws_description: "DNA Softcom",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canDiscover =
    form.client_id.trim() && form.client_secret.trim() && form.base_url.trim();

  const onBuscar = async () => {
    try {
      const list = await discover.mutateAsync({
        environment,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret,
        base_url: form.base_url.trim(),
      });
      setWorkspaces(list);
      setSelectedIdx(null);
      if (list.length === 0) {
        toast.info("Nenhum workspace retornou pra essas credenciais.");
      } else {
        // Auto-seleciona o (primeiro) PIX-ativo — que é o único que paga.
        const activeIdx = list.findIndex((w) => w.pixPaymentsActive);
        if (activeIdx >= 0) {
          pickWorkspace(list[activeIdx], activeIdx);
        } else {
          // Nenhum tem PIX: pré-preenche a agência/conta com a de um workspace
          // existente, pra facilitar criar um workspace de PAYMENTS.
          const acc = list.find((w) => w.mainDebitAccount)?.mainDebitAccount;
          if (acc) {
            setForm((f) => ({
              ...f,
              debit_branch: acc.branch ?? f.debit_branch,
              debit_account: acc.number ?? f.debit_account,
            }));
          }
        }
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra buscar.");
    }
  };

  const pickWorkspace = (w: DiscoveredWorkspace, idx: number) => {
    // Só o PIX-ativo paga — os outros não são selecionáveis.
    if (!w.pixPaymentsActive) return;
    setSelectedIdx(idx);
    setForm((f) => ({
      ...f,
      workspace_id: w.workspaceId ?? f.workspace_id,
      debit_branch: w.mainDebitAccount?.branch ?? f.debit_branch,
      debit_account: w.mainDebitAccount?.number ?? f.debit_account,
    }));
  };

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

  const noneActive =
    !!workspaces && workspaces.length > 0 && !workspaces.some((w) => w.pixPaymentsActive);

  const onCriarWs = async () => {
    try {
      await createWs.mutateAsync({
        environment,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret,
        base_url: form.base_url.trim(),
        branch: form.debit_branch.trim(),
        number: form.debit_account.trim(),
        description: form.ws_description.trim() || undefined,
      });
      toast.success("Workspace de PIX criado. Buscando de novo…");
      await onBuscar();
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra criar o workspace.");
    }
  };

  const onExcluir = async (w: DiscoveredWorkspace) => {
    if (!w.workspaceId) return;
    if (!window.confirm(`Excluir o workspace "${w.description || w.type || w.workspaceId}"?`)) return;
    try {
      await deleteWs.mutateAsync({
        environment,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret,
        base_url: form.base_url.trim(),
        workspace_id: w.workspaceId,
      });
      toast.success("Workspace excluído.");
      await onBuscar();
    } catch (err) {
      toast.error((err as Error).message ?? "Não deu pra excluir.");
    }
  };

  return (
    <div className="space-y-3">
      {/* Credenciais base + buscar */}
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
        <Field label="Base URL">
          <Input
            className="h-9"
            value={form.base_url}
            onChange={(e) => set("base_url", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full gap-1.5"
            disabled={!canDiscover || discover.isPending}
            onClick={onBuscar}
            title={
              initial?.has_secret && !form.client_secret
                ? "Digite o client_secret pra buscar (não guardamos o atual em claro)"
                : undefined
            }
          >
            {discover.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MagnifyingGlass className="w-4 h-4" />
            )}
            Buscar workspaces
          </Button>
        </div>
      </div>

      {/* Lista de workspaces descobertos */}
      {workspaces && workspaces.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Escolhe o workspace (a conta preenche sozinha)
          </Label>
          <div className="space-y-1">
            {workspaces.map((w, i) => {
              const selectable = w.pixPaymentsActive;
              const selected = selectedIdx === i;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-1 rounded-md border transition-colors",
                    selected ? "border-primary/50 bg-primary/5" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => pickWorkspace(w, i)}
                    disabled={!selectable}
                    title={selectable ? undefined : "Esse workspace não tem PIX ativo — não dá pra pagar por ele."}
                    className={cn(
                      "flex-1 min-w-0 text-left px-3 py-2 rounded-l-md transition-colors",
                      selectable && !selected && "hover:bg-muted/40",
                      !selectable && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        {selected && <CheckCircle className="w-4 h-4 text-primary shrink-0" weight="fill" />}
                        <span className="text-sm font-medium truncate">
                          {w.description || w.type || "Workspace"}
                        </span>
                        {w.pixPaymentsActive ? (
                          <Badge variant="success" className="shrink-0">PIX ativo</Badge>
                        ) : (
                          <Badge variant="warning" className="shrink-0">sem PIX</Badge>
                        )}
                      </span>
                      {w.mainDebitAccount && (
                        <span className="mono text-[11px] text-muted-foreground shrink-0">
                          ag {w.mainDebitAccount.branch} · {w.mainDebitAccount.number}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onExcluir(w)}
                    disabled={!w.workspaceId || deleteWs.isPending}
                    title="Excluir este workspace"
                    className="shrink-0 h-8 w-8 mr-1 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nenhum workspace com PIX → oferecer criar um (type PAYMENTS) */}
      {noneActive && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">
            Nenhum workspace tem PIX ativo.
          </p>
          <p className="text-xs text-muted-foreground">
            Cria um workspace de pagamento (type PAYMENTS) com a conta abaixo — é o
            que liga o PIX. Não move dinheiro; é reversível no Santander.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              className="h-8 mono"
              value={form.debit_branch}
              onChange={(e) => set("debit_branch", e.target.value)}
              placeholder="Agência"
              inputMode="numeric"
            />
            <Input
              className="h-8 mono"
              value={form.debit_account}
              onChange={(e) => set("debit_account", e.target.value)}
              placeholder="Conta"
              inputMode="numeric"
            />
          </div>
          <Input
            className="h-8"
            value={form.ws_description}
            onChange={(e) => set("ws_description", e.target.value)}
            placeholder="Nome do workspace (ex.: DNA Softcom)"
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={createWs.isPending || !form.debit_branch.trim() || !form.debit_account.trim()}
            onClick={onCriarWs}
          >
            {createWs.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Criar workspace de PIX
          </Button>
        </div>
      )}

      {/* Campos resolvidos (auto-preenchidos pela escolha, ainda editáveis) */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Workspace ID">
          <Input
            className="h-9 mono text-xs"
            value={form.workspace_id}
            onChange={(e) => set("workspace_id", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Agência">
          <Input
            className="h-9 mono"
            value={form.debit_branch}
            onChange={(e) => set("debit_branch", e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Conta">
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
