import { useCallback, useMemo, useState } from "react";
import {
  parseCollaboratorXlsx,
  mapRowToImportRow,
  isRowEmpty,
  type ImportRow,
  type Lookups,
} from "../utils/collaborator-import-parser";
import {
  validateRow,
  buildBatchCpfMap,
  type ValidationResult,
} from "../utils/collaborator-import-validator";

export type FilterMode = "all" | "valid" | "errors";

export type UseCollaboratorImportArgs = {
  lookups: Lookups;
  existingCpfs: Set<string>;
};

export function useCollaboratorImport({
  lookups,
  existingCpfs,
}: UseCollaboratorImportArgs) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<FilterMode>("all");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const validations = useMemo<ValidationResult[]>(() => {
    if (rows.length === 0) return [];
    const batchMap = buildBatchCpfMap(rows);
    return rows.map((r, i) =>
      validateRow(r, i, { existingCpfs, batchCpfs: batchMap }),
    );
  }, [rows, existingCpfs]);

  const stats = useMemo(() => {
    let ok = 0;
    let warning = 0;
    let error = 0;
    for (const v of validations) {
      if (v.severity === "ok") ok++;
      else if (v.severity === "warning") warning++;
      else error++;
    }
    return { ok, warning, error, total: validations.length, selected: selection.size };
  }, [validations, selection.size]);

  const visibleIndices = useMemo(() => {
    const idx: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const v = validations[i];
      if (filter === "all") idx.push(i);
      else if (filter === "errors" && v?.severity === "error") idx.push(i);
      else if (filter === "valid" && v?.severity !== "error") idx.push(i);
    }
    return idx;
  }, [rows, validations, filter]);

  const loadFile = useCallback(
    async (file: File) => {
      setIsParsing(true);
      try {
        const raw = await parseCollaboratorXlsx(file);
        const filtered = raw.filter((r) => !isRowEmpty(r));
        const mapped = filtered.map((r) => mapRowToImportRow(r, lookups));
        setRows(mapped);
        setSelection(new Set());
        setFileName(file.name);
      } finally {
        setIsParsing(false);
      }
    },
    [lookups],
  );

  const reset = useCallback(() => {
    setRows([]);
    setSelection(new Set());
    setFilter("all");
    setFileName(null);
  }, []);

  const updateRow = useCallback((index: number, patch: Partial<ImportRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const applyToSelected = useCallback(
    (patch: Partial<ImportRow>) => {
      setRows((prev) =>
        prev.map((r, i) => (selection.has(i) ? { ...r, ...patch } : r)),
      );
    },
    [selection],
  );

  const toggleSelection = useCallback((index: number) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelection((prev) => {
      const next = new Set(prev);
      for (const i of visibleIndices) next.add(i);
      return next;
    });
  }, [visibleIndices]);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const selectByPredicate = useCallback(
    (pred: (row: ImportRow, index: number, validation: ValidationResult) => boolean) => {
      setSelection(() => {
        const next = new Set<number>();
        rows.forEach((r, i) => {
          const v = validations[i];
          if (v && pred(r, i, v)) next.add(i);
        });
        return next;
      });
    },
    [rows, validations],
  );

  const importableRows = useMemo(
    () =>
      rows
        .map((r, i) => ({ row: r, index: i, validation: validations[i] }))
        .filter((x) => x.validation && x.validation.severity !== "error"),
    [rows, validations],
  );

  return {
    rows,
    validations,
    selection,
    filter,
    setFilter,
    stats,
    fileName,
    isParsing,
    visibleIndices,
    importableRows,
    loadFile,
    reset,
    updateRow,
    applyToSelected,
    toggleSelection,
    selectAllVisible,
    clearSelection,
    selectByPredicate,
  };
}
