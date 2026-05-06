import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  useAuditLog,
  useAuditedTables,
  useAuditedUsers,
  type AuditLogFilters,
  type AuditLogRowWithUser,
} from "../hooks/use-audit-log";
import { AuditFilters } from "../components/AuditFilters";
import { AuditTable } from "../components/AuditTable";
import { AuditDiffDialog } from "../components/AuditDiffDialog";
import { exportAuditCSV } from "../services/audit-export.service";

function defaultFilters(): AuditLogFilters {
  // Default: últimos 7 dias
  const today = new Date();
  const week = new Date();
  week.setDate(week.getDate() - 7);
  return {
    dateFrom: week.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
    userId: null,
    tableName: null,
    action: null,
    page: 0,
    pageSize: AUDIT_DEFAULT_PAGE_SIZE,
  };
}

export default function AuditoriaTab() {
  const [filters, setFilters] = useState<AuditLogFilters>(defaultFilters);
  const [viewRow, setViewRow] = useState<AuditLogRowWithUser | null>(null);

  const { data, isLoading } = useAuditLog(filters);
  const { data: tables = [] } = useAuditedTables();
  const { data: users = [] } = useAuditedUsers();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const headerCount = useMemo(() => {
    if (isLoading) return "—";
    return `${total.toLocaleString("pt-BR")} registro${total === 1 ? "" : "s"}`;
  }, [total, isLoading]);

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error("Nada pra exportar nesse filtro.");
      return;
    }
    try {
      exportAuditCSV(rows);
      toast.success("CSV gerado ✓");
    } catch (err) {
      toast.error("Não rolou exportar.");
      console.error(err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Auditoria
              <Badge variant="secondary" className="font-normal text-xs">
                {headerCount}
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Trilha completa de alterações no sistema. Útil pra LGPD e
              investigação de incidentes — só admin enxerga.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuditFilters
          filters={filters}
          onChange={setFilters}
          tables={tables}
          users={users}
          onReset={() => setFilters(defaultFilters())}
        />

        <AuditTable
          rows={rows}
          isLoading={isLoading}
          onView={(row) => setViewRow(row)}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Página {filters.page + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 0}
                onClick={() =>
                  setFilters({ ...filters, page: filters.page - 1 })
                }
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page + 1 >= totalPages}
                onClick={() =>
                  setFilters({ ...filters, page: filters.page + 1 })
                }
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AuditDiffDialog
        row={viewRow}
        onOpenChange={(open) => !open && setViewRow(null)}
      />
    </Card>
  );
}
