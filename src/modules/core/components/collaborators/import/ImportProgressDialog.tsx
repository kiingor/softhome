import { CheckCircle, WarningCircle, CircleNotch } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export type ImportRunResult = {
  row_index: number;
  status: "ok" | "error";
  collaborator_id?: string;
  auth_user_created?: boolean;
  temp_password?: string;
  error?: string;
  row_label: string;
};

type Props = {
  open: boolean;
  totalRows: number;
  processedRows: number;
  results: ImportRunResult[];
  isRunning: boolean;
  onClose: () => void;
  onOpenRowFromError?: (rowIndex: number) => void;
};

export function ImportProgressDialog({
  open,
  totalRows,
  processedRows,
  results,
  isRunning,
  onClose,
  onOpenRowFromError,
}: Props) {
  const pct = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;
  const okCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const authCount = results.filter((r) => r.auth_user_created).length;
  const errors = results.filter((r) => r.status === "error");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isRunning && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isRunning ? "Importando colaboradores…" : "Importação concluída"}
          </DialogTitle>
          <DialogDescription>
            {isRunning
              ? `${processedRows} de ${totalRows} processado${processedRows === 1 ? "" : "s"}.`
              : `${okCount} criados · ${errorCount} com erro · ${authCount} login(s) gerado(s).`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Progress value={pct} />

          {isRunning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleNotch className="w-4 h-4 animate-spin" />
              Aguarde — o servidor está cadastrando cada colaborador e criando os logins.
            </div>
          )}

          {!isRunning && (
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

          {!isRunning && errors.length > 0 && (
            <div className="border rounded-md">
              <div className="px-3 py-2 bg-muted text-xs font-medium border-b">
                Erros por linha
              </div>
              <ScrollArea className="max-h-60">
                <ul className="divide-y">
                  {errors.map((e) => (
                    <li
                      key={e.row_index}
                      className="px-3 py-2 text-sm flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          Linha {e.row_index + 1}: {e.row_label}
                        </p>
                        <p className="text-xs text-destructive mt-0.5">{e.error}</p>
                      </div>
                      {onOpenRowFromError && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs shrink-0"
                          onClick={() => onOpenRowFromError(e.row_index)}
                        >
                          abrir linha
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          {!isRunning && (
            <Button onClick={onClose}>
              {errorCount === 0 ? "Concluir" : "Fechar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
