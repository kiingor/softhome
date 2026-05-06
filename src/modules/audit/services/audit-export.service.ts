import * as XLSX from "xlsx";
import type { AuditLogRowWithUser } from "../hooks/use-audit-log";
import { tableLabel, columnLabel, NOISE_COLUMNS } from "../lib/audit-labels";
import {
  ACTION_LABELS,
  diffFields,
  formatValue,
} from "../lib/audit-formatters";

function safeFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function changesForRow(row: AuditLogRowWithUser): string {
  if (row.action === "insert") {
    if (!row.after) return "";
    const fields = Object.entries(row.after)
      .filter(([k]) => !NOISE_COLUMNS.has(k))
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(
        ([k, v]) =>
          `${columnLabel(row.table_name, k)}: ${formatValue(k, v)}`,
      );
    return fields.join("; ");
  }
  if (row.action === "delete") {
    return "(registro removido)";
  }
  // update
  const diff = diffFields(row.before, row.after, NOISE_COLUMNS);
  return diff
    .map(
      (d) =>
        `${columnLabel(row.table_name, d.column)}: ${formatValue(d.column, d.before)} → ${formatValue(d.column, d.after)}`,
    )
    .join("; ");
}

export function exportAuditCSV(
  rows: AuditLogRowWithUser[],
  filenamePrefix = "auditoria",
): void {
  const data = rows.map((r) => ({
    "Data/Hora": new Date(r.created_at).toLocaleString("pt-BR"),
    Usuário: r.user_name ?? r.user_email ?? "(sem usuário)",
    Ação: ACTION_LABELS[r.action] ?? r.action,
    Tabela: tableLabel(r.table_name),
    Registro: r.record_id,
    Mudanças: changesForRow(r),
  }));

  const ws = XLSX.utils.json_to_sheet(data, { skipHeader: false });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Auditoria");

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${safeFilename(filenamePrefix)}_${today}.csv`;

  XLSX.writeFile(wb, filename, { bookType: "csv", FS: "," });
}
