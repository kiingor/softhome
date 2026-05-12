import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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

function defaultFilters(recordId: string | null = null): AuditLogFilters {
  // Default: últimos 7 dias. Quando filtrando por recordId (ex: histórico de
  // um colaborador), expande a janela pra últimos 365 dias.
  const today = new Date();
  const past = new Date();
  past.setDate(past.getDate() - (recordId ? 365 : 7));
  return {
    dateFrom: past.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
    userId: null,
    tableName: null,
    action: null,
    recordId,
    page: 0,
    pageSize: AUDIT_DEFAULT_PAGE_SIZE,
  };
}

export default function AuditoriaTab() {
  const [searchParams] = useSearchParams();
  const recordIdFromUrl = searchParams.get("recordId");
  const [filters, setFilters] = useState<AuditLogFilters>(() =>
    defaultFilters(recordIdFromUrl),
  );
  const [viewRow, setViewRow] = useState<AuditLogRowWithUser | null>(null);

  useEffect(() => {
    setFilters((prev) => {
      if (prev.recordId === recordIdFromUrl) return prev;
      return defaultFilters(recordIdFromUrl);
    });
  }, [recordIdFromUrl]);

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
        {filters.recordId && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Filtrando alterações de um registro específico
              <span className="font-mono text-xs ml-2 text-foreground">
                {filters.recordId.slice(0, 8)}…
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters((p) => ({ ...p, recordId: null, page: 0 }))}
            >
              Limpar
            </Button>
          </div>
        )}

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
