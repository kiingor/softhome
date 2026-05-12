import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DotsThree as MoreHorizontal,
  PencilSimple,
  UserCircle,
  FastForward,
  FileText,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { downloadBonusReceipt } from "../services/bonus-receipt.service";
import type { BonusEntryWithCollaborator } from "../lib/bonus-types";

type Props = {
  entry: BonusEntryWithCollaborator;
  disabled?: boolean;
  onEdit: (entry: BonusEntryWithCollaborator) => void;
  onRequestIndividual: (entry: BonusEntryWithCollaborator) => void;
  onAnticipate: (entry: BonusEntryWithCollaborator) => void;
};

export function EntryActionsMenu({
  entry,
  disabled,
  onEdit,
  onRequestIndividual,
  onAnticipate,
}: Props) {
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  // Se já saiu do batch (avulso/antecipado), só permite editar valor
  const isOutOfBatch = entry.mode !== "batch";

  const handleGenerateReceipt = async () => {
    setIsGeneratingReceipt(true);
    try {
      await downloadBonusReceipt(entry.id);
      toast.success("Recibo gerado ✓");
    } catch (err) {
      toast.error("Não rolou. " + (err as Error).message);
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}>
          <MoreHorizontal className="w-4 h-4" />
          <span className="sr-only">Ações</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onEdit(entry)}>
          <PencilSimple className="w-4 h-4 mr-2" />
          Editar valor
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleGenerateReceipt}
          disabled={isGeneratingReceipt}
        >
          <FileText className="w-4 h-4 mr-2 text-primary" />
          Gerar recibo (PDF)
        </DropdownMenuItem>
        {!isOutOfBatch && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAnticipate(entry)}>
              <FastForward className="w-4 h-4 mr-2 text-emerald-600" />
              Antecipar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRequestIndividual(entry)}>
              <UserCircle className="w-4 h-4 mr-2 text-amber-600" />
              Solicitar individual
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
