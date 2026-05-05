import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DownloadSimple, UploadSimple, FileXls } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cleanCPF } from "@/lib/validators";

import { useCollaboratorImport } from "../../../hooks/use-collaborator-import";
import type { ImportRow, Lookups } from "../../../utils/collaborator-import-parser";
import { ImportTable } from "./ImportTable";
import { ImportToolbar } from "./ImportToolbar";
import { ImportRowDrawer } from "./ImportRowDrawer";
import {
  ImportProgressDialog,
  type ImportRunResult,
} from "./ImportProgressDialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onImportFinished: () => void;
};

const BATCH_SIZE = 50;

export function CollaboratorsImportDialog({
  open,
  onOpenChange,
  companyId,
  onImportFinished,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [drawerIndex, setDrawerIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [processedRows, setProcessedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [runResults, setRunResults] = useState<ImportRunResult[]>([]);

  // Lookups: positions, teams, stores
  const lookupsQuery = useQuery({
    queryKey: ["collab-import-lookups", companyId],
    enabled: !!companyId && open,
    queryFn: async (): Promise<Lookups> => {
      const [positions, teams, stores] = await Promise.all([
        supabase
          .from("positions")
          .select("id, name, salary")
          .eq("company_id", companyId)
          .order("name"),
        supabase
          .from("teams")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name"),
        supabase
          .from("stores")
          .select("id, store_name")
          .eq("company_id", companyId)
          .order("store_name"),
      ]);
      return {
        positions: (positions.data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          salary: Number(p.salary) || 0,
        })),
        teams: (teams.data ?? []).map((t) => ({ id: t.id, name: t.name })),
        stores: (stores.data ?? []).map((s) => ({
          id: s.id,
          store_name: s.store_name,
        })),
      };
    },
  });

  // Benefícios disponíveis
  const benefitsQuery = useQuery({
    queryKey: ["collab-import-benefits", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefits")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  // CPFs já cadastrados (para detectar duplicatas)
  const existingCpfsQuery = useQuery({
    queryKey: ["collab-import-existing-cpfs", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("cpf")
        .eq("company_id", companyId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => cleanCPF(String(r.cpf))));
    },
  });

  const lookups: Lookups = useMemo(
    () =>
      lookupsQuery.data ?? {
        positions: [],
        teams: [],
        stores: [],
      },
    [lookupsQuery.data],
  );

  const importHook = useCollaboratorImport({
    lookups,
    existingCpfs: existingCpfsQuery.data ?? new Set(),
  });

  useEffect(() => {
    if (!open) {
      importHook.reset();
      setDrawerIndex(null);
      setIsRunning(false);
      setProgressOpen(false);
      setProcessedRows(0);
      setTotalRows(0);
      setRunResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const benefits = benefitsQuery.data ?? [];

  const handleFile = async (file: File) => {
    try {
      await importHook.loadFile(file);
      toast.success(`Arquivo "${file.name}" carregado.`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler o arquivo. Confira o formato.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    const importable = importHook.importableRows;
    if (importable.length === 0) {
      toast.error("Nenhuma linha válida pra importar.");
      return;
    }
    setIsRunning(true);
    setProgressOpen(true);
    setProcessedRows(0);
    setTotalRows(importable.length);
    setRunResults([]);

    const batches: typeof importable[] = [];
    for (let i = 0; i < importable.length; i += BATCH_SIZE) {
      batches.push(importable.slice(i, i + BATCH_SIZE));
    }

    let processed = 0;

    for (const batch of batches) {
      const payload = {
        company_id: companyId,
        rows: batch.map((b) => ({ row_index: b.index, ...b.row })),
      };

      try {
        const { data, error } = await supabase.functions.invoke<{
          results: ImportRunResult[];
        }>("import-collaborators", { body: payload });

        if (error || !data?.results) {
          // Marca todo o batch como erro
          const fallback: ImportRunResult[] = batch.map((b) => ({
            row_index: b.index,
            status: "error",
            error: error?.message ?? "Falha ao chamar servidor",
            row_label: b.row.name || b.row.cpf || `Linha ${b.index + 1}`,
          }));
          setRunResults((prev) => [...prev, ...fallback]);
        } else {
          const labeled = data.results.map((r) => {
            const row = batch.find((b) => b.index === r.row_index)?.row;
            return {
              ...r,
              row_label: row?.name || row?.cpf || `Linha ${r.row_index + 1}`,
            };
          });
          setRunResults((prev) => [...prev, ...labeled]);
        }
      } catch (e) {
        const fallback: ImportRunResult[] = batch.map((b) => ({
          row_index: b.index,
          status: "error",
          error: e instanceof Error ? e.message : "Erro inesperado",
          row_label: b.row.name || b.row.cpf || `Linha ${b.index + 1}`,
        }));
        setRunResults((prev) => [...prev, ...fallback]);
      }

      processed += batch.length;
      setProcessedRows(processed);
    }

    setIsRunning(false);
    onImportFinished();
  };

  const handleClickRow = (i: number) => setDrawerIndex(i);

  const handleSaveDrawer = (i: number, patch: Partial<ImportRow>) => {
    importHook.updateRow(i, patch);
  };

  const importableCount = importHook.importableRows.length;
  const hasRows = importHook.rows.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[95vw] max-w-none h-[92vh] p-0 flex flex-col gap-0"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle>Importar colaboradores</DialogTitle>
            <DialogDescription>
              Suba a planilha do sistema antigo, ajuste em massa e importe.
              {importHook.fileName && (
                <span className="block text-xs mt-1 text-foreground/70">
                  Arquivo: <strong>{importHook.fileName}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {!hasRows ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-10">
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Comece baixando a planilha modelo, preencha com os dados do sistema antigo
                e suba o arquivo aqui pra revisar antes de importar.
              </p>
              <div className="flex gap-3 flex-wrap justify-center">
                <Button asChild variant="outline">
                  <a
                    href="/modelo-importacao-colaboradores.xlsx"
                    download="modelo-importacao-colaboradores.xlsx"
                  >
                    <DownloadSimple className="w-4 h-4 mr-2" />
                    Baixar planilha modelo
                  </a>
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importHook.isParsing}
                >
                  <UploadSimple className="w-4 h-4 mr-2" />
                  {importHook.isParsing ? "Lendo..." : "Selecionar arquivo .xlsx"}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileXls className="w-4 h-4" />
                Formatos aceitos: .xlsx, .xls, .csv
              </div>
            </div>
          ) : (
            <>
              <ImportToolbar
                stats={importHook.stats}
                filter={importHook.filter}
                onChangeFilter={importHook.setFilter}
                lookups={lookups}
                benefits={benefits}
                onApplyToSelected={importHook.applyToSelected}
                onClearSelection={importHook.clearSelection}
                disabled={isRunning}
              />

              <div className="flex-1 min-h-0 px-4 py-3 flex flex-col">
                <ImportTable
                  rows={importHook.rows}
                  validations={importHook.validations}
                  visibleIndices={importHook.visibleIndices}
                  selection={importHook.selection}
                  lookups={lookups}
                  onToggleRow={importHook.toggleSelection}
                  onSelectAllVisible={importHook.selectAllVisible}
                  onClearSelection={importHook.clearSelection}
                  onRowClick={handleClickRow}
                />
              </div>

              <div className="flex items-center justify-between gap-3 px-6 py-3 border-t bg-background">
                <Button
                  variant="ghost"
                  onClick={() => importHook.reset()}
                  disabled={isRunning}
                >
                  Limpar e subir outro arquivo
                </Button>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isRunning}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={isRunning || importableCount === 0}
                  >
                    Importar {importableCount} colaborador{importableCount === 1 ? "" : "es"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ImportRowDrawer
        open={drawerIndex !== null}
        rowIndex={drawerIndex}
        row={drawerIndex !== null ? (importHook.rows[drawerIndex] ?? null) : null}
        lookups={lookups}
        benefits={benefits}
        onClose={() => setDrawerIndex(null)}
        onSave={handleSaveDrawer}
      />

      <ImportProgressDialog
        open={progressOpen}
        totalRows={totalRows}
        processedRows={processedRows}
        results={runResults}
        isRunning={isRunning}
        onClose={() => {
          setProgressOpen(false);
          if (runResults.some((r) => r.status === "ok")) {
            // Resetar tudo após sucesso
            onOpenChange(false);
          }
        }}
        onOpenRowFromError={(i) => {
          setProgressOpen(false);
          setDrawerIndex(i);
        }}
      />
    </>
  );
}
