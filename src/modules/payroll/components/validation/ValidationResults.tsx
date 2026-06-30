import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CaretRight,
  CaretDown,
  Check,
  Prohibit,
  ArrowCounterClockwise,
  MagnifyingGlass,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react";
import { formatCurrency } from "@/lib/formatters";
import {
  usePayrollValidationItems,
  useResolveValidationItem,
} from "../../hooks/use-payroll-validation";
import type {
  PayrollValidation,
  PayrollValidationItem,
} from "../../services/validation/payroll-validation.service";

interface Props {
  validation: PayrollValidation;
  companyId?: string;
  referenceMonth?: string;
  canManage: boolean;
}

const COUNT_GROUPS = new Set(["dependentes_ir", "dependentes_sf"]);
const fmtVal = (group: string, v: number | null) =>
  v == null ? "—" : COUNT_GROUPS.has(group) ? String(v) : formatCurrency(v);

const SEVERITY_BADGE: Record<string, { label: string; cls: string }> = {
  divergence: { label: "Divergência", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  missing_system: { label: "Sem correspondência na folha", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  missing_pdf: { label: "Sem correspondência no PDF", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  info: { label: "Info", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  corrected: { label: "Corrigido", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  ignored: { label: "Ignorado", cls: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

export function ValidationResults({ validation, companyId, referenceMonth, canManage }: Props) {
  const { data: items = [], isLoading } = usePayrollValidationItems(validation.id);
  const { single, bulk } = useResolveValidationItem(validation.id, companyId, referenceMonth);

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolveDialog, setResolveDialog] = useState<{
    status: "corrected" | "ignored" | "pending";
    itemIds: string[];
    isBulk: boolean;
  } | null>(null);
  const [notes, setNotes] = useState("");

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Contagem de grupos pro <Select> de filtro.
  const groupOptions = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const it of items) {
      const cur = m.get(it.check_group) ?? { label: it.check_label, n: 0 };
      cur.n += 1;
      m.set(it.check_group, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [items]);

  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return items.filter((it) => {
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (severityFilter !== "all" && it.severity !== severityFilter) return false;
      if (groupFilter !== "all" && it.check_group !== groupFilter) return false;
      if (q && !norm(it.collaborator_name).includes(q)) return false;
      return true;
    });
  }, [items, statusFilter, severityFilter, groupFilter, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, PayrollValidationItem[]>();
    for (const it of filtered) {
      if (!m.has(it.collaborator_name)) m.set(it.collaborator_name, []);
      m.get(it.collaborator_name)!.push(it);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const pct =
    validation.items_total === 0
      ? 100
      : Math.round((validation.items_resolved / validation.items_total) * 100);

  const filteredIds = filtered.map((i) => i.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  const openResolve = (status: "corrected" | "ignored" | "pending", itemIds: string[], isBulk: boolean) => {
    setNotes("");
    setResolveDialog({ status, itemIds, isBulk });
  };
  const confirmResolve = () => {
    if (!resolveDialog) return;
    const { status, itemIds, isBulk } = resolveDialog;
    if (isBulk) {
      bulk.mutate(
        { itemIds, status, notes },
        { onSuccess: () => setSelected(new Set()) },
      );
    } else {
      single.mutate({ itemId: itemIds[0], status, notes });
    }
    setResolveDialog(null);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Progresso da validação</p>
            <p className="text-xs text-muted-foreground">
              {validation.items_resolved} de {validation.items_total} resolvidos ·{" "}
              {validation.collaborators_matched}/{validation.collaborators_total} colaboradores casados
            </p>
          </div>
          <span className="text-2xl font-bold tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} />
        {validation.items_total === 0 && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            Nenhuma divergência — folha bate com a contabilidade. 🎉
          </p>
        )}
      </div>

      {validation.items_total > 0 && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="corrected">Corrigidos</SelectItem>
                <SelectItem value="ignored">Ignorados</SelectItem>
                <SelectItem value="all">Todos os status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[190px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="divergence">Divergência de valor</SelectItem>
                <SelectItem value="missing_system">Sem correspondência na folha</SelectItem>
                <SelectItem value="missing_pdf">Sem correspondência no PDF</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os campos</SelectItem>
                {groupOptions.map(([g, info]) => (
                  <SelectItem key={g} value={g}>
                    {info.label} ({info.n})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar colaborador…"
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* Barra de seleção / ações em massa */}
          {canManage && (
            <div className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={(c) =>
                  setSelected(c ? new Set(filteredIds) : new Set())
                }
              />
              <span className="text-muted-foreground">
                {selected.size > 0
                  ? `${selected.size} selecionado(s)`
                  : `Selecionar ${filteredIds.length} visível(is)`}
              </span>
              {selected.size > 0 && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openResolve("corrected", [...selected], true)}>
                    <Check className="w-4 h-4 mr-1.5" /> Corrigido
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openResolve("ignored", [...selected], true)}>
                    <Prohibit className="w-4 h-4 mr-1.5" /> Ignorar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Lista agrupada por colaborador */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum item com esses filtros.
            </p>
          ) : (
            <div className="space-y-2">
              {grouped.map(([name, its]) => {
                const isCollapsed = collapsed.has(name);
                return (
                  <div key={name} className="rounded-lg border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          next.has(name) ? next.delete(name) : next.add(name);
                          return next;
                        })
                      }
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/40 text-left"
                    >
                      {isCollapsed ? <CaretRight className="w-4 h-4" /> : <CaretDown className="w-4 h-4" />}
                      <span className="font-medium text-sm flex-1 truncate">{name}</span>
                      <Badge variant="secondary" className="text-xs">{its.length}</Badge>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y border-t">
                        {its.map((it) => (
                          <ItemRow
                            key={it.id}
                            item={it}
                            canManage={canManage}
                            selected={selected.has(it.id)}
                            onToggle={() => toggle(it.id)}
                            onResolve={(status) => openResolve(status, [it.id], false)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Dialog de resolução (obs) */}
      <Dialog open={!!resolveDialog} onOpenChange={(o) => !o && setResolveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resolveDialog?.status === "corrected" && "Marcar como corrigido"}
              {resolveDialog?.status === "ignored" && "Ignorar divergência"}
              {resolveDialog?.status === "pending" && "Reabrir item"}
              {resolveDialog?.isBulk ? ` (${resolveDialog.itemIds.length} itens)` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Observação (opcional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: ajustado o plano de saúde no cadastro; recalculei a folha."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancelar</Button>
            <Button onClick={confirmResolve} disabled={single.isPending || bulk.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemRow({
  item,
  canManage,
  selected,
  onToggle,
  onResolve,
}: {
  item: PayrollValidationItem;
  canManage: boolean;
  selected: boolean;
  onToggle: () => void;
  onResolve: (status: "corrected" | "ignored" | "pending") => void;
}) {
  const sev = SEVERITY_BADGE[item.severity];
  const st = STATUS_BADGE[item.status];
  const hasValues = item.expected_value != null || item.actual_value != null;
  const isResolved = item.status !== "pending";

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 text-sm">
      {canManage && (
        <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{item.check_label}</span>
          <Badge className={`text-[10px] ${sev.cls}`}>{sev.label}</Badge>
          {isResolved && <Badge className={`text-[10px] ${st.cls}`}>{st.label}</Badge>}
        </div>
        {hasValues && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
            <span>Contabilidade: <b className="text-foreground">{fmtVal(item.check_group, item.expected_value)}</b></span>
            <span>Folha: <b className="text-foreground">{fmtVal(item.check_group, item.actual_value)}</b></span>
            {item.diff != null && item.diff !== 0 && (
              <span className={`inline-flex items-center gap-1 font-medium ${item.direction === "a_mais" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                {item.direction === "a_mais" ? <TrendUp className="w-3.5 h-3.5" /> : <TrendDown className="w-3.5 h-3.5" />}
                {COUNT_GROUPS.has(item.check_group)
                  ? `${Math.abs(item.diff)} ${item.direction === "a_mais" ? "a mais" : "a menos"}`
                  : `${formatCurrency(Math.abs(item.diff))} ${item.direction === "a_mais" ? "a mais" : "a menos"}`}
              </span>
            )}
          </div>
        )}
        {item.notes && (
          <p className="mt-1 text-xs italic text-muted-foreground">“{item.notes}”</p>
        )}
      </div>
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          {item.status !== "corrected" && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Corrigido" onClick={() => onResolve("corrected")}>
              <Check className="w-4 h-4" />
            </Button>
          )}
          {item.status !== "ignored" && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Ignorar" onClick={() => onResolve("ignored")}>
              <Prohibit className="w-4 h-4" />
            </Button>
          )}
          {isResolved && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Reabrir" onClick={() => onResolve("pending")}>
              <ArrowCounterClockwise className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
