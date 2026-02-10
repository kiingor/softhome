import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Position {
  id: string;
  name: string;
  salary: number;
  risk_group?: string | null;
  exam_periodicity_months?: number | null;
}

interface PositionChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPosition: Position | null;
  positions: Position[];
  onConfirm: (newPositionId: string, riskGroupChanged: boolean) => void;
}

export const PositionChangeDialog = ({
  open,
  onOpenChange,
  currentPosition,
  positions,
  onConfirm,
}: PositionChangeDialogProps) => {
  const [selectedPositionId, setSelectedPositionId] = useState("");

  const newPosition = positions.find((p) => p.id === selectedPositionId);
  const riskGroupChanged = !!(
    currentPosition?.risk_group &&
    newPosition?.risk_group &&
    currentPosition.risk_group !== newPosition.risk_group
  );

  const handleConfirm = () => {
    if (!selectedPositionId) return;
    onConfirm(selectedPositionId, riskGroupChanged);
    setSelectedPositionId("");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Trocar Função</AlertDialogTitle>
          <AlertDialogDescription>
            Selecione o novo cargo. Se o grupo de risco for diferente, um exame de Mudança de Função será gerado automaticamente.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Novo Cargo</Label>
            <Select value={selectedPositionId} onValueChange={setSelectedPositionId}>
              <SelectTrigger><SelectValue placeholder="Selecione o novo cargo" /></SelectTrigger>
              <SelectContent>
                {positions
                  .filter((p) => p.id !== currentPosition?.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {currentPosition && newPosition && (
            <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
              <p className="text-sm font-medium">Comparação</p>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Atual</p>
                  <p className="font-medium">{currentPosition.name}</p>
                  <p className="text-xs">{formatCurrency(currentPosition.salary)}</p>
                  <Badge variant="outline" className="text-xs mt-1">{currentPosition.risk_group || "Sem GR"}</Badge>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground text-xs">Novo</p>
                  <p className="font-medium">{newPosition.name}</p>
                  <p className="text-xs">{formatCurrency(newPosition.salary)}</p>
                  <Badge variant="outline" className="text-xs mt-1">{newPosition.risk_group || "Sem GR"}</Badge>
                </div>
              </div>
              {riskGroupChanged && (
                <div className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <p className="text-xs">Grupo de risco diferente — um exame de Mudança de Função será criado automaticamente.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setSelectedPositionId("")}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!selectedPositionId}>
            Confirmar Troca
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
