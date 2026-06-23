// Componente genérico de aba de sub-recurso do colaborador.
// Renderiza: lista de itens + botão "Novo" + Dialog do form + confirm de delete.
// Cada mutation chama a Edge Function `collaborator-subresource` que sincroniza
// local + remoto (api.softcom.cloud).

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash, ArrowsClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AGENDA_SYNC_DISABLED } from "@/lib/agenda-sync";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TabContentSkeleton } from "@/shared/components/TabContentSkeleton";
import { EmptyState } from "@/shared/components/EmptyState";

export type SubResourceKind =
  | "absenteismos"
  | "afastamentos"
  | "decimo-terceiro"
  | "ferias"
  | "planos"
  | "pdvs";

export interface FieldDef {
  /** nome da coluna no banco local (snake_case) */
  name: string;
  /** label exibida no form */
  label: string;
  /** tipo do input */
  type: "text" | "number" | "date" | "checkbox" | "textarea";
  /** placeholder opcional */
  placeholder?: string;
  /** se obrigatório */
  required?: boolean;
}

export interface SubResourceTabProps<TRow extends { id: string; external_id?: string | null }> {
  /** Tipo do recurso — define qual rota da API legada usar. */
  kind: SubResourceKind;
  /** ID local do colaborador (uuid). */
  collaboratorId: string | null;
  /** Tabela local do Supabase (ex: "collaborator_absences"). */
  table: string;
  /** Coluna pra ordenar a lista. */
  orderBy?: { column: string; ascending?: boolean };
  /** Título singular (ex: "Afastamento") — usado em "Novo X", "Editar X". */
  titleSingular: string;
  /** Ícone do empty state. */
  icon: React.ReactNode;
  /** Empty state copy. */
  emptyTitle: string;
  emptyDescription: string;
  /** Definição dos campos do form. */
  fields: FieldDef[];
  /** Renderer da linha na lista. Retorna title (à esquerda) e meta (à direita). */
  renderRow: (row: TRow) => { title: React.ReactNode; meta?: React.ReactNode };
  /** Pode editar/criar/deletar? Se false, vira read-only. */
  canManage: boolean;
}

export function SubResourceTab<TRow extends { id: string; external_id?: string | null }>(
  props: SubResourceTabProps<TRow>,
) {
  const queryClient = useQueryClient();
  const {
    kind, collaboratorId, table, orderBy, titleSingular, icon,
    emptyTitle, emptyDescription, fields, renderRow, canManage,
  } = props;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TRow | null>(null);
  const [deleting, setDeleting] = useState<TRow | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const queryKey = [`subresource-${kind}`, collaboratorId];

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!collaboratorId) return [] as TRow[];
      let q = supabase.from(table as never).select("*").eq("collaborator_id", collaboratorId);
      if (orderBy) q = q.order(orderBy.column as never, { ascending: orderBy.ascending ?? false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TRow[];
    },
    enabled: !!collaboratorId,
    staleTime: 5 * 60 * 1000,
  });

  const openCreate = () => {
    setEditing(null);
    const empty: Record<string, unknown> = {};
    for (const f of fields) empty[f.name] = f.type === "checkbox" ? false : "";
    setFormData(empty);
    setFormOpen(true);
  };

  const openEdit = (row: TRow) => {
    setEditing(row);
    const prefilled: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (row as unknown as Record<string, unknown>)[f.name];
      prefilled[f.name] = v ?? (f.type === "checkbox" ? false : "");
    }
    setFormData(prefilled);
    setFormOpen(true);
  };

  const mutation = useMutation({
    mutationFn: async (payload: { action: "create" | "update" | "delete"; localId?: string; data?: Record<string, unknown> }) => {
      const body: Record<string, unknown> = {
        action: payload.action,
        kind,
        collaboratorId,
        ...(payload.localId ? { localId: payload.localId } : {}),
        ...(payload.data ? { data: cleanData(payload.data, fields) } : {}),
      };
      const { data, error } = await supabase.functions.invoke("collaborator-subresource", { body });
      if (error) throw error;
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg) throw new Error(errMsg);
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey });
      const msg =
        vars.action === "create" ? `${titleSingular} criado.`
        : vars.action === "update" ? `${titleSingular} atualizado.`
        : `${titleSingular} removido.`;
      toast.success(msg);
      setFormOpen(false);
      setDeleting(null);
      setEditing(null);
    },
    onError: (err) => {
      toast.error(`Erro: ${(err as Error).message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      mutation.mutate({ action: "update", localId: editing.id, data: formData });
    } else {
      mutation.mutate({ action: "create", data: formData });
    }
  };

  if (isLoading) return <TabContentSkeleton />;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Novo {titleSingular.toLowerCase()}
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const { title, meta } = renderRow(row);
            return (
              <div
                key={row.id}
                className="rounded-lg border bg-card px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{title}</div>
                  {meta && <div className="text-[11px] text-muted-foreground mt-0.5">{meta}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {row.external_id && (
                    <span
                      className="text-[10px] text-muted-foreground"
                      title="Vinculado à agenda"
                    >
                      <ArrowsClockwise className="w-3 h-3" />
                    </span>
                  )}
                  {canManage && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-600"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar ${titleSingular.toLowerCase()}` : `Novo ${titleSingular.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              {AGENDA_SYNC_DISABLED
                ? "Salvo aqui no DNA Softcom."
                : "Será sincronizado com a agenda (api.softcom.cloud)."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            {fields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={formData[f.name]}
                onChange={(v) => setFormData((p) => ({ ...p, [f.name]: v }))}
              />
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {titleSingular.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              {AGENDA_SYNC_DISABLED
                ? "Vai remover aqui no DNA Softcom. Não dá pra desfazer."
                : "Vai remover aqui no DNA Softcom e também na agenda. Não dá pra desfazer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && mutation.mutate({ action: "delete", localId: deleting.id })}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FieldInput({
  field, value, onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const common = {
    id: field.name,
    placeholder: field.placeholder,
    required: field.required,
    className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  };
  return (
    <div className="space-y-1">
      <label htmlFor={field.name} className="text-sm font-medium">
        {field.label}{field.required && " *"}
      </label>
      {field.type === "textarea" ? (
        <textarea
          {...common}
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "checkbox" ? (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-muted-foreground">{field.placeholder ?? "Marcar"}</span>
        </label>
      ) : (
        <input
          {...common}
          type={field.type}
          value={field.type === "number" ? (value as number | "") ?? "" : (value as string) ?? ""}
          onChange={(e) =>
            onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
          }
        />
      )}
    </div>
  );
}

function cleanData(data: Record<string, unknown>, fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = data[f.name];
    if (v === "" || v === undefined) out[f.name] = null;
    else out[f.name] = v;
  }
  return out;
}
