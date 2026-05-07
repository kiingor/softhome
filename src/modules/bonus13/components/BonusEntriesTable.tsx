import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { formatCPF } from "@/lib/validators";
import { EntryActionsMenu } from "./EntryActionsMenu";
import {
  BONUS_MODE_LABELS,
  type BonusEntryWithCollaborator,
} from "../lib/bonus-types";

type Props = {
  entries: BonusEntryWithCollaborator[];
  /** Quando o período já foi gerado (status='pagamento' ou 'concluido'),
   *  desabilita ações que mudam mode/valor das entries do batch. */
  readOnly?: boolean;
  onEdit: (entry: BonusEntryWithCollaborator) => void;
  onRequestIndividual: (entry: BonusEntryWithCollaborator) => void;
  onAnticipate: (entry: BonusEntryWithCollaborator) => void;
};

const MODE_COLORS: Record<string, string> = {
  batch: "bg-slate-100 text-slate-700",
  individual: "bg-amber-100 text-amber-700",
  anticipated: "bg-emerald-100 text-emerald-700",
};

export function BonusEntriesTable({
  entries,
  readOnly = false,
  onEdit,
  onRequestIndividual,
  onAnticipate,
}: Props) {
  if (entries.length === 0) {
    return (
      <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum colaborador nessa campanha.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Colaborador</TableHead>
          <TableHead className="w-[140px]">CPF</TableHead>
          <TableHead className="w-[100px]">Meses</TableHead>
          <TableHead className="w-[140px]">Salário base</TableHead>
          <TableHead className="w-[140px]">13º bruto</TableHead>
          <TableHead className="w-[120px]">Tipo</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id} className="hover:bg-muted/40">
            <TableCell>
              <div className="font-medium text-sm capitalize">
                {e.collaborator.name.toLowerCase()}
              </div>
              {e.collaborator.position && (
                <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                  {e.collaborator.position}
                </div>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
              {formatCPF(e.collaborator.cpf)}
            </TableCell>
            <TableCell className="tabular-nums text-sm">
              {e.months_worked}/12
            </TableCell>
            <TableCell className="tabular-nums text-sm text-muted-foreground">
              {formatCurrency(e.base_salary)}
            </TableCell>
            <TableCell className="tabular-nums text-sm font-semibold">
              {formatCurrency(e.gross_value)}
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={`font-normal border-0 ${MODE_COLORS[e.mode] ?? ""}`}
              >
                {BONUS_MODE_LABELS[e.mode]}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <EntryActionsMenu
                entry={e}
                disabled={readOnly}
                onEdit={onEdit}
                onRequestIndividual={onRequestIndividual}
                onAnticipate={onAnticipate}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
