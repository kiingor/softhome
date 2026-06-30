import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FilePdf,
  FileArrowUp,
  X as XIcon,
  CircleNotch as Loader2,
  SealCheck,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRunValidation } from "../../hooks/use-payroll-validation";

interface Props {
  companyId?: string;
  referenceMonth?: string;
  onDone: (validationId: string) => void;
}

export function ValidationUpload({ companyId, referenceMonth, onDone }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const run = useRunValidation(companyId, referenceMonth);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    setFiles((prev) => {
      const names = new Set(prev.map((p) => p.name));
      return [...prev, ...pdfs.filter((p) => !names.has(p.name))];
    });
  };

  const handleRun = () => {
    run.mutate(files, {
      onSuccess: (res) => {
        if (res.warnings.length) {
          toast.warning(`Validação criada com ${res.warnings.length} aviso(s).`, {
            description: res.warnings.slice(0, 3).join(" · "),
          });
        }
        toast.success(
          res.itemsCount === 0
            ? "Folha 100% conferida — nenhuma divergência! 🎉"
            : `${res.itemsCount} divergência(s) encontrada(s) em ${res.stats.collaborators_matched} colaborador(es).`,
        );
        onDone(res.validationId);
      },
      onError: (e) => toast.error("Falha na validação", { description: e.message }),
    });
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/50 transition-colors"
      >
        <FileArrowUp className="w-9 h-9 text-muted-foreground" />
        <p className="text-sm font-medium">Arraste os PDFs da contabilidade aqui</p>
        <p className="text-xs text-muted-foreground">
          As "Relações de Cálculo" (uma por filial). Pode soltar os 4 de uma vez.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <FilePdf className="w-4 h-4 text-rose-500 shrink-0" weight="fill" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setFiles((prev) => prev.filter((p) => p.name !== f.name));
                }}
                disabled={run.isPending}
              >
                <XIcon className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        <Warning className="w-4 h-4 shrink-0" weight="fill" />
        Os PDFs são lidos no seu navegador — nada é enviado pra fora. Só as divergências ficam salvas.
      </div>

      <Button onClick={handleRun} disabled={files.length === 0 || run.isPending} className="w-full">
        {run.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Lendo PDFs e conferindo a folha…
          </>
        ) : (
          <>
            <SealCheck className="w-4 h-4 mr-2" weight="fill" />
            Iniciar validação
          </>
        )}
      </Button>
    </div>
  );
}
