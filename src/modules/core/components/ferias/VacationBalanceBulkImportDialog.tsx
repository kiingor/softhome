import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { cleanCPF } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UploadSimple,
  CheckCircle,
  WarningCircle,
  CircleNotch as Loader2,
  DownloadSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ImportRow = {
  rowNumber: number;
  cpf: string;
  daysTaken: number;
  daysSold: number;
  notes: string;
};

type ImportResult = {
  rowNumber: number;
  cpf: string;
  status: "ok" | "error";
  message: string;
  collaboratorName?: string;
};

const COLUMN_KEYS = {
  cpf: ["CPF*", "CPF", "cpf"],
  taken: ["Dias já tirados", "Dias tirados", "dias_tirados"],
  sold: ["Dias vendidos", "Abono", "dias_vendidos"],
  notes: ["Observação", "Observacao", "Notas"],
} as const;

const pick = (row: Record<string, unknown>, keys: readonly string[]): string | null => {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return null;
};

const parseInt0 = (v: string | null): number => {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

export function VacationBalanceBulkImportDialog({ open, onOpenChange }: Props) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [processedCount, setProcessedCount] = useState(0);

  const reset = () => {
    setRows([]);
    setResults([]);
    setProcessedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v && !running) {
      onOpenChange(false);
      setTimeout(reset, 300);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["CPF*", "Dias já tirados", "Dias vendidos", "Observação"],
      ["123.456.789-00", 15, 0, "Saldo importado da planilha legada"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Saldos");
    XLSX.writeFile(wb, "modelo-saldos-ferias.xlsx");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setResults([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets["Saldos"] ?? wb.Sheets[wb.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("Planilha vazia");
      const raw = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: false,
      }) as Record<string, unknown>[];

      const parsed: ImportRow[] = raw
        .map((r, i) => {
          const cpf = cleanCPF(pick(r, COLUMN_KEYS.cpf) ?? "");
          const daysTaken = parseInt0(pick(r, COLUMN_KEYS.taken));
          const daysSold = parseInt0(pick(r, COLUMN_KEYS.sold));
          const notes = (pick(r, COLUMN_KEYS.notes) ?? "").trim();
          return { rowNumber: i + 2, cpf, daysTaken, daysSold, notes };
        })
        .filter((r) => r.cpf);

      if (parsed.length === 0) {
        toast.error("Nenhuma linha com CPF encontrada");
        return;
      }
      setRows(parsed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler planilha");
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    if (!currentCompany?.id || rows.length === 0) return;
    setRunning(true);
    setResults([]);
    setProcessedCount(0);

    const out: ImportResult[] = [];

    for (const row of rows) {
      try {
        // 1) acha colaborador da empresa pelo CPF
        const { data: collab, error: cErr } = await supabase
          .from("collaborators")
          .select("id, name")
          .eq("company_id", currentCompany.id)
          .eq("cpf", row.cpf)
          .maybeSingle();

        if (cErr) throw cErr;
        if (!collab) {
          out.push({
            rowNumber: row.rowNumber,
            cpf: row.cpf,
            status: "error",
            message: "CPF não encontrado nesta empresa",
          });
          continue;
        }

        // 2) acha período aquisitivo "atual" — mais recente já iniciado e não expirado
        const today = new Date().toISOString().slice(0, 10);
        const { data: periods, error: pErr } = await supabase
          .from("vacation_periods")
          .select("id, start_date, end_date, status, days_entitled")
          .eq("collaborator_id", collab.id)
          .lte("start_date", today)
          .neq("status", "expired")
          .order("start_date", { ascending: false })
          .limit(1);

        if (pErr) throw pErr;
        const period = periods?.[0];
        if (!period) {
          out.push({
            rowNumber: row.rowNumber,
            cpf: row.cpf,
            collaboratorName: collab.name,
            status: "error",
            message: "Sem período aquisitivo ativo (verifique data de admissão)",
          });
          continue;
        }

        // 3) RPC com validação no servidor
        const { error: rpcErr } = await supabase.rpc(
          "adjust_vacation_period_manual",
          {
            _period_id: period.id,
            _days_taken: row.daysTaken,
            _days_sold: row.daysSold,
            _notes: row.notes || "Importação em massa de saldo",
          },
        );

        if (rpcErr) {
          out.push({
            rowNumber: row.rowNumber,
            cpf: row.cpf,
            collaboratorName: collab.name,
            status: "error",
            message: rpcErr.message,
          });
        } else {
          out.push({
            rowNumber: row.rowNumber,
            cpf: row.cpf,
            collaboratorName: collab.name,
            status: "ok",
            message: `${row.daysTaken} tirados, ${row.daysSold} vendidos`,
          });
        }
      } catch (err) {
        out.push({
          rowNumber: row.rowNumber,
          cpf: row.cpf,
          status: "error",
          message: err instanceof Error ? err.message : "Erro desconhecido",
        });
      } finally {
        setProcessedCount((n) => n + 1);
      }
    }

    setResults(out);
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["vacation-periods"] });
    queryClient.invalidateQueries({ queryKey: ["vacation-periods-collaborator"] });
  };

  const okCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const pct = rows.length > 0 ? Math.round((processedCount / rows.length) * 100) : 0;
  const finished = results.length > 0 && !running;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar saldos de férias em massa</DialogTitle>
          <DialogDescription>
            Atualiza dias já tirados e vendidos do período aquisitivo atual de
            cada colaborador. Use só pra carga inicial — depois disso, prefira o
            fluxo normal de solicitação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Step 1: download template + upload */}
          {rows.length === 0 && results.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-md border p-4 bg-muted/30 text-sm space-y-2">
                <p className="font-medium">Como funciona</p>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li>Baixe o modelo abaixo e preencha CPF + dias.</li>
                  <li>O sistema busca o colaborador pelo CPF nesta empresa.</li>
                  <li>O ajuste vai pro período aquisitivo mais recente (já iniciado e não expirado).</li>
                  <li>Quem ajustou e quando fica registrado no período.</li>
                </ol>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={downloadTemplate}>
                  <DownloadSimple className="w-4 h-4 mr-2" />
                  Baixar modelo
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing}
                >
                  {parsing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <UploadSimple className="w-4 h-4 mr-2" />
                  )}
                  Selecionar planilha
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: preview */}
          {rows.length > 0 && results.length === 0 && !running && (
            <div className="rounded-md border flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="px-3 py-2 bg-muted text-xs font-medium border-b shrink-0 flex items-center justify-between">
                <span>{rows.length} linhas prontas pra importar</span>
                <Button variant="ghost" size="sm" onClick={reset} className="h-6 text-xs">
                  Trocar planilha
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5">CPF</th>
                      <th className="text-right px-3 py-1.5">Tirados</th>
                      <th className="text-right px-3 py-1.5">Vendidos</th>
                      <th className="text-left px-3 py-1.5">Observação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-1.5 font-mono">{r.cpf}</td>
                        <td className="px-3 py-1.5 text-right">{r.daysTaken}</td>
                        <td className="px-3 py-1.5 text-right">{r.daysSold}</td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[16ch]">
                          {r.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: progress / results */}
          {(running || finished) && (
            <div className="space-y-3 flex-1 min-h-0 flex flex-col overflow-hidden">
              <Progress value={pct} />
              {running && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Aplicando ajustes — {processedCount} de {rows.length}…
                </div>
              )}
              {finished && (
                <div className="flex items-center gap-3 text-sm">
                  <Badge className="bg-emerald-100 text-emerald-700 border-0">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {okCount} OK
                  </Badge>
                  {errorCount > 0 && (
                    <Badge variant="destructive">
                      <WarningCircle className="w-3 h-3 mr-1" />
                      {errorCount} erro{errorCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
              )}
              {finished && errorCount > 0 && (
                <div className="border rounded-md flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="px-3 py-2 bg-muted text-xs font-medium border-b shrink-0">
                    Linhas com erro
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <ul className="divide-y">
                      {results
                        .filter((r) => r.status === "error")
                        .map((r) => (
                          <li
                            key={r.rowNumber}
                            className="px-3 py-2 text-sm"
                          >
                            <p className="font-medium">
                              Linha {r.rowNumber} · CPF {r.cpf}
                              {r.collaboratorName ? ` · ${r.collaboratorName}` : ""}
                            </p>
                            <p className="text-xs text-destructive mt-0.5 break-words">
                              {r.message}
                            </p>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {rows.length > 0 && results.length === 0 && !running && (
            <Button onClick={runImport}>Importar saldos</Button>
          )}
          {finished && (
            <Button onClick={() => handleClose(false)}>Fechar</Button>
          )}
          {!running && rows.length === 0 && results.length === 0 && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
