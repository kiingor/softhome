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
import { CircleNotch as Loader2, Eye, Robot } from "@phosphor-icons/react";
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
                {!r.user_id ? (
                  <div
                    className="flex items-center gap-1.5 text-muted-foreground"
                    title="Ação executada por uma Edge Function ou fluxo público (ex: candidatura, processamento de CV)"
                  >
                    <Robot className="w-3.5 h-3.5 shrink-0" weight="duotone" />
                    <span className="font-medium italic">Sistema</span>
                  </div>
                ) : !r.user_name && !r.user_email ? (
                  <div className="text-muted-foreground italic" title={r.user_id}>
                    Usuário removido
                  </div>
                ) : (
                  <>
                    <div className="font-medium text-foreground truncate max-w-[200px]">
                      {r.user_name ?? r.user_email}
                    </div>
                    {r.user_name && r.user_email && (
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {r.user_email}
                      </div>
                    )}
                  </>
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
