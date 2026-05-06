import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CircleNotch as Loader2, Eye } from "@phosphor-icons/react";
import type { AuditLogRowWithUser } from "../hooks/use-audit-log";
import { tableLabel } from "../lib/audit-labels";
import { ACTION_LABELS, ACTION_COLORS } from "../lib/audit-formatters";

interface Props {
  rows: AuditLogRowWithUser[];
  isLoading: boolean;
  onView: (row: AuditLogRowWithUser) => void;
}

export function AuditTable({ rows, isLoading, onView }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma alteração registrada nesse filtro.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[160px]">Data/Hora</TableHead>
          <TableHead>Usuário</TableHead>
          <TableHead className="w-[110px]">Ação</TableHead>
          <TableHead>Tabela</TableHead>
          <TableHead className="w-[110px]">Registro</TableHead>
          <TableHead className="w-[80px] text-right">Detalhe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const dt = new Date(r.created_at);
          return (
            <TableRow key={r.id} className="hover:bg-muted/40">
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                <div>{dt.toLocaleDateString("pt-BR")}</div>
                <div>
                  {dt.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
              </TableCell>
              <TableCell className="text-sm">
                <div className="font-medium text-foreground truncate max-w-[200px]">
                  {r.user_name ?? "(sem nome)"}
                </div>
                {r.user_email && (
                  <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {r.user_email}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`border-0 text-xs font-normal ${
                    ACTION_COLORS[r.action] ?? ""
                  }`}
                >
                  {ACTION_LABELS[r.action] ?? r.action}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{tableLabel(r.table_name)}</TableCell>
              <TableCell
                className="text-xs font-mono text-muted-foreground"
                title={r.record_id}
              >
                #{r.record_id.slice(0, 8)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => onView(r)}
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  Ver
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
