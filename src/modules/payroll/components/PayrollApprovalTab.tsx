import { useMemo, useState, Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CaretDown,
  CaretRight,
  ChatCircleText,
  MagnifyingGlass,
  Warning,
  CheckCircle,
  Trash,
  X as XIcon,
} from "@phosphor-icons/react";
import { formatCurrency } from "@/lib/formatters";
import { StatBlock } from "./StatBlock";
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_COLORS,
  isEarning,
  isEmployerCost,
  type PayrollEntryWithCollaborator,
  type PayrollPeriodStatus,
} from "../types";
import {
  buildApprovalSummary,
  sumApprovalTotals,
} from "../lib/buildApprovalSummary";
import {
  usePeriodNotes,
  useCreatePeriodNote,
  useResolvePeriodNote,
  useDeletePeriodNote,
  usePeriodApprovals,
  type PayrollPeriodNote,
} from "../hooks/use-payroll-approval";

interface PayrollApprovalTabProps {
  periodId: string;
  entries: PayrollEntryWithCollaborator[];
  status: PayrollPeriodStatus;
  /** Quem pode escrever observação (RH e diretoria). */
  canComment: boolean;
}

// Caixa de observação — usada tanto no colaborador quanto na folha inteira.
function NoteBox({
  periodId,
  collaboratorId,
  notes,
  canComment,
  compact,
}: {
  periodId: string;
  collaboratorId: string | null;
  notes: PayrollPeriodNote[];
  canComment: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const create = useCreatePeriodNote(periodId);
  const resolve = useResolvePeriodNote(periodId);
  const remove = useDeletePeriodNote(periodId);

  const submit = async () => {
    await create.mutateAsync({ collaboratorId, body: draft });
    setDraft("");
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {notes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhuma observação {collaboratorId ? "nessa pessoa" : "na folha"} ainda.
        </p>
      )}
      {notes.map((n) => (
        <div
          key={n.id}
          className={`rounded-lg border p-2.5 text-xs ${
            n.is_resolved ? "opacity-60" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <Badge
              variant="outline"
              className={`text-[10px] h-4 px-1.5 ${
                n.author_stage === "diretoria"
                  ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                  : "border-blue-300 text-blue-700 dark:text-blue-300"
              }`}
            >
              {n.author_stage === "diretoria" ? "Diretoria" : "RH"}
            </Badge>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(n.created_at).toLocaleDateString("pt-BR")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                title={n.is_resolved ? "Reabrir" : "Marcar como tratada"}
                onClick={() =>
                  resolve.mutate({ noteId: n.id, resolved: !n.is_resolved })
                }
              >
                {n.is_resolved ? (
                  <XIcon className="w-3 h-3" />
                ) : (
                  <CheckCircle className="w-3 h-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                title="Remover"
                onClick={() => remove.mutate(n.id)}
              >
                <Trash className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
          {n.is_resolved && (
            <p className="text-[10px] text-muted-foreground mt-1">✓ Tratada</p>
          )}
        </div>
      ))}

      {canComment && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              collaboratorId
                ? "O que precisa ser conferido nessa pessoa?"
                : "Observação sobre a folha inteira…"
            }
            rows={compact ? 2 : 3}
            className="text-xs"
          />
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={draft.trim().length < 3 || create.isPending}
            onClick={submit}
          >
            Registrar observação
          </Button>
        </div>
      )}
    </div>
  );
}

export function PayrollApprovalTab({
  periodId,
  entries,
  status,
  canComment,
}: PayrollApprovalTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const { data: notes = [] } = usePeriodNotes(periodId);
  const { data: approvals = [] } = usePeriodApprovals(periodId);

  const summary = useMemo(() => buildApprovalSummary(entries), [entries]);
  const totals = useMemo(() => sumApprovalTotals(summary), [summary]);

  // Observações por colaborador, pra badge na linha sem N queries.
  const notesByCollab = useMemo(() => {
    const m = new Map<string, PayrollPeriodNote[]>();
    for (const n of notes) {
      if (!n.collaborator_id) continue;
      const arr = m.get(n.collaborator_id) ?? [];
      arr.push(n);
      m.set(n.collaborator_id, arr);
    }
    return m;
  }, [notes]);

  const periodNotes = useMemo(
    () => notes.filter((n) => !n.collaborator_id),
    [notes],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return summary.filter((r) => {
      if (term && !r.name.toLowerCase().includes(term)) return false;
      if (onlyFlagged) {
        const hasOpenNote = (notesByCollab.get(r.collaboratorId) ?? []).some(
          (n) => !n.is_resolved,
        );
        if (!hasOpenNote && r.liquido > 0) return false;
      }
      return true;
    });
  }, [summary, search, onlyFlagged, notesByCollab]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openNotesCount = notes.filter((n) => !n.is_resolved).length;

  return (
    <div className="space-y-4">
      {/* KPIs — o que a diretoria assina */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatBlock label="Pessoas" value={String(totals.pessoas)} />
        <StatBlock label="Bruto" value={formatCurrency(totals.bruto)} accent="emerald" />
        <StatBlock label="Descontos" value={formatCurrency(totals.descontos)} accent="rose" />
        <StatBlock label="Líquido a pagar" value={formatCurrency(totals.liquido)} />
        <StatBlock label="FGTS (empresa)" value={formatCurrency(totals.fgts)} />
      </div>

      {totals.bonificacao > 0 && (
        <p className="text-xs text-muted-foreground">
          Do bruto acima, {formatCurrency(totals.bonificacao)} são{" "}
          <strong>bonificação (custo de setor)</strong> — já somados no líquido.
          Custo total da folha (bruto + FGTS):{" "}
          <strong>{formatCurrency(totals.custoTotal)}</strong>.
        </p>
      )}

      {/* Observação da folha inteira */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <ChatCircleText className="w-4 h-4 text-muted-foreground" />
              Observações da folha
            </h4>
            {openNotesCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {openNotesCount} em aberto
              </Badge>
            )}
          </div>
          <NoteBox
            periodId={periodId}
            collaboratorId={null}
            notes={periodNotes}
            canComment={canComment}
          />
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar colaborador…"
            className="pl-8 h-9"
          />
        </div>
        <Button
          variant={onlyFlagged ? "default" : "outline"}
          size="sm"
          className="h-9 text-xs"
          onClick={() => setOnlyFlagged((v) => !v)}
        >
          <Warning className="w-3.5 h-3.5 mr-1.5" />
          Só o que precisa de atenção
        </Button>
      </div>

      {totals.liquidoNaoPositivo > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900/60 p-3 text-xs">
          <strong>{totals.liquidoNaoPositivo}</strong> colaborador
          {totals.liquidoNaoPositivo === 1 ? "" : "es"} com líquido zerado ou
          negativo (descontos ≥ proventos). Diferente da aba Pagamentos, esta
          tela mostra todo mundo — vale conferir antes de aprovar.
        </div>
      )}

      {/* Lista agrupada por colaborador */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36px]" />
              <TableHead>Colaborador</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Descontos</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="text-right">FGTS</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  {summary.length === 0
                    ? "Nenhum lançamento nessa folha ainda."
                    : "Nada bate com o filtro."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((row) => {
              const isOpen = expanded.has(row.collaboratorId);
              const collabNotes = notesByCollab.get(row.collaboratorId) ?? [];
              const openNotes = collabNotes.filter((n) => !n.is_resolved).length;
              return (
                <Fragment key={row.collaboratorId}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggle(row.collaboratorId)}
                  >
                    <TableCell className="p-0 pl-2 align-middle">
                      {isOpen ? (
                        <CaretDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <CaretRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        {row.name}
                        {row.liquido <= 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 border-rose-300 text-rose-700 dark:text-rose-300"
                          >
                            Líquido {row.liquido < 0 ? "negativo" : "zerado"}
                          </Badge>
                        )}
                        {openNotes > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 border-amber-300 text-amber-700 dark:text-amber-300"
                          >
                            {openNotes} obs.
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(row.bruto)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-rose-700 dark:text-rose-300">
                      {row.descontos > 0 ? `- ${formatCurrency(row.descontos)}` : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-semibold ${
                        row.liquido <= 0
                          ? "text-rose-700 dark:text-rose-300"
                          : "text-orange-700 dark:text-orange-300"
                      }`}
                    >
                      {formatCurrency(row.liquido)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatCurrency(row.fgts)}
                    </TableCell>
                    <TableCell className="p-0 pr-2" onClick={(e) => e.stopPropagation()}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${
                              openNotes > 0
                                ? "text-amber-600"
                                : "text-muted-foreground"
                            }`}
                            title="Observações desta pessoa"
                          >
                            <ChatCircleText className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80">
                          <p className="text-xs font-medium mb-2">{row.name}</p>
                          <NoteBox
                            periodId={periodId}
                            collaboratorId={row.collaboratorId}
                            notes={collabNotes}
                            canComment={canComment}
                            compact
                          />
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  </TableRow>

                  {isOpen &&
                    row.entries.map((e) => {
                      // 3 naturezas, não 2 — o bug anterior era tratar tudo que
                      // não fosse provento como desconto, o que pintava a
                      // bonificação de vermelho com sinal de menos (parecia
                      // abater do salário).
                      //   credito     → soma no líquido (inclui bonificação)
                      //   debito      → sai do líquido
                      //   informativo → fora do líquido (só FGTS, que é custo
                      //                 do empregador e nunca sai do salário)
                      const natureza = isEmployerCost(e.type)
                        ? "informativo"
                        : isEarning(e.type)
                        ? "credito"
                        : "debito";
                      return (
                        <TableRow key={e.id} className="bg-muted/30">
                          <TableCell />
                          <TableCell className="pl-8 text-xs">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] h-4 px-1.5 ${
                                  ENTRY_TYPE_COLORS[e.type] ?? ""
                                }`}
                              >
                                {ENTRY_TYPE_LABELS[e.type] ?? e.type}
                              </Badge>
                              <span className="text-muted-foreground truncate">
                                {e.description ?? ""}
                              </span>
                              {natureza === "informativo" && (
                                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                                  · fora do líquido
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            colSpan={4}
                            className={`text-right font-mono text-xs ${
                              natureza === "informativo"
                                ? "text-muted-foreground"
                                : natureza === "credito"
                                ? "text-orange-700 dark:text-orange-300"
                                : "text-rose-700 dark:text-rose-300"
                            }`}
                          >
                            {natureza === "credito"
                              ? "+ "
                              : natureza === "debito"
                              ? "- "
                              : ""}
                            {formatCurrency(Number(e.value))}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {visible.length} de {summary.length} colaborador
        {summary.length === 1 ? "" : "es"} · status atual:{" "}
        <strong>{status === "open" ? "Rascunho" : status === "aprovado_rh" ? "Aprovado RH" : "Aprovado Diretoria"}</strong>
      </p>

      {/* Histórico do fluxo */}
      {approvals.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-3">Histórico de aprovação</h4>
            <div className="space-y-2">
              {approvals.map((a) => (
                <div key={a.id} className="text-xs flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">
                    {new Date(a.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    <strong>
                      {a.action === "approve_rh"
                        ? "Aprovado pelo RH"
                        : a.action === "approve_diretoria"
                        ? "Aprovado pela diretoria"
                        : a.action === "return_to_rh"
                        ? "Devolvido pro RH"
                        : a.action === "return_to_draft"
                        ? "Devolvido pra rascunho"
                        : a.action === "close"
                        ? "Período fechado"
                        : a.action === "reopen"
                        ? "Período reaberto"
                        : a.action}
                    </strong>
                    {a.reason ? ` — ${a.reason}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
