import { useMemo } from "react";
import {
  CheckCircle,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, formatNumberAsCurrency } from "@/lib/formatters";
import { formatCPF } from "@/lib/validators";
import type { ImportRow, Lookups } from "../../../utils/collaborator-import-parser";
import type { ValidationResult } from "../../../utils/collaborator-import-validator";

type Props = {
  rows: ImportRow[];
  validations: ValidationResult[];
  visibleIndices: number[];
  selection: Set<number>;
  lookups: Lookups;
  onToggleRow: (index: number) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onRowClick: (index: number) => void;
};

const SEVERITY_ICON = {
  ok: { Icon: CheckCircle, className: "text-emerald-600" },
  warning: { Icon: Warning, className: "text-amber-500" },
  error: { Icon: WarningCircle, className: "text-destructive" },
} as const;

export function ImportTable({
  rows,
  validations,
  visibleIndices,
  selection,
  lookups,
  onToggleRow,
  onSelectAllVisible,
  onClearSelection,
  onRowClick,
}: Props) {
  const positionsById = useMemo(
    () => new Map(lookups.positions.map((p) => [p.id, p])),
    [lookups.positions],
  );
  const teamsById = useMemo(
    () => new Map(lookups.teams.map((t) => [t.id, t])),
    [lookups.teams],
  );

  const allVisibleSelected =
    visibleIndices.length > 0 && visibleIndices.every((i) => selection.has(i));
  const someVisibleSelected = visibleIndices.some((i) => selection.has(i));

  return (
    <div className="border rounded-md overflow-hidden flex-1 min-h-0">
      <div className="overflow-auto h-full">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) => {
                    if (checked) onSelectAllVisible();
                    else onClearSelection();
                  }}
                  aria-label="Selecionar todas visíveis"
                />
              </TableHead>
              <TableHead className="w-8" />
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="text-right">Salário</TableHead>
              <TableHead className="text-center">Benef.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleIndices.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma linha pra mostrar com o filtro atual.
                </TableCell>
              </TableRow>
            )}
            {visibleIndices.map((rowIndex) => {
              const row = rows[rowIndex];
              const validation = validations[rowIndex];
              if (!row || !validation) return null;
              const isSelected = selection.has(rowIndex);
              const { Icon, className } = SEVERITY_ICON[validation.severity];
              const position = row.position_id ? positionsById.get(row.position_id) : null;
              const team = row.team_id ? teamsById.get(row.team_id) : null;

              return (
                <TableRow
                  key={rowIndex}
                  data-state={isSelected ? "selected" : undefined}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onRowClick(rowIndex)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleRow(rowIndex)}
                      aria-label={`Selecionar ${row.name || "linha"}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Icon className={`w-5 h-5 ${className}`} />
                      </TooltipTrigger>
                      {validation.issues.length > 0 && (
                        <TooltipContent className="max-w-sm">
                          <ul className="text-xs list-disc list-inside space-y-1">
                            {validation.issues.map((issue, i) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {row.name || <span className="text-muted-foreground italic">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.cpf ? formatCPF(row.cpf) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                    {team?.name ?? row.raw_team_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px] truncate">
                    {position?.name ?? row.raw_position_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {position
                      ? formatCurrency(position.salary)
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.benefit_ids.length > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {row.benefit_ids.length}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// re-export to keep import paths short
export { formatNumberAsCurrency };
