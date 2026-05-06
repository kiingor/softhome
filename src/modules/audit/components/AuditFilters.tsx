import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowCounterClockwise as RotateCcw } from "@phosphor-icons/react";
import type { AuditLogFilters } from "../hooks/use-audit-log";
import { tableLabel } from "../lib/audit-labels";

interface Props {
  filters: AuditLogFilters;
  onChange: (next: AuditLogFilters) => void;
  tables: string[];
  users: Array<{ id: string; name: string | null; email: string | null }>;
  onReset: () => void;
}

export function AuditFilters({
  filters,
  onChange,
  tables,
  users,
  onReset,
}: Props) {
  const set = <K extends keyof AuditLogFilters>(
    k: K,
    v: AuditLogFilters[K],
  ) => onChange({ ...filters, [k]: v, page: 0 });

  return (
    <div className="grid gap-3 md:grid-cols-5 items-end">
      <div className="space-y-1">
        <Label htmlFor="audit-from" className="text-xs">
          De
        </Label>
        <Input
          id="audit-from"
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => set("dateFrom", e.target.value || null)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="audit-to" className="text-xs">
          Até
        </Label>
        <Input
          id="audit-to"
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => set("dateTo", e.target.value || null)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Usuário</Label>
        <Select
          value={filters.userId ?? "_all"}
          onValueChange={(v) => set("userId", v === "_all" ? null : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name ?? u.email ?? u.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tabela</Label>
        <Select
          value={filters.tableName ?? "_all"}
          onValueChange={(v) => set("tableName", v === "_all" ? null : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas</SelectItem>
            {tables.map((t) => (
              <SelectItem key={t} value={t}>
                {tableLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Ação</Label>
        <div className="flex gap-2">
          <Select
            value={filters.action ?? "_all"}
            onValueChange={(v) =>
              set("action", v === "_all" ? null : (v as "insert" | "update" | "delete"))
            }
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas</SelectItem>
              <SelectItem value="insert">Criou</SelectItem>
              <SelectItem value="update">Editou</SelectItem>
              <SelectItem value="delete">Excluiu</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onReset}
            title="Resetar filtros"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
