import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleNotch as Loader2,
  Upload,
  Eye,
  CheckCircle,
  ArrowsClockwise as RefreshCw,
  Sparkle as Sparkles,
  Trash,
  DotsThreeVertical,
} from "@phosphor-icons/react";
import {
  uploadAndProcessCv,
  reprocessCv,
} from "../services/cv-process.service";
import { useCvViewer } from "../hooks/use-cv-viewer";
import type { Candidate } from "../types";

interface Props {
  candidate: Candidate;
  onDeactivate: (id: string) => void;
  isDeactivating?: boolean;
}

export function CandidateActionsMenu({ candidate, onDeactivate, isDeactivating }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const queryClient = useQueryClient();
  const { openCv } = useCvViewer();

  const indexed = !!candidate.cv_processed_at;
  const hasCv = !!candidate.cv_url;

  const handleSelect = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsProcessing(true);
    try {
      await uploadAndProcessCv(candidate.id, candidate.company_id, file);
      toast.success("CV indexado ✓");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    } catch (err) {
      toast.error("Não rolou. " + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReprocess = async () => {
    if (!candidate.cv_url) return;
    setIsProcessing(true);
    try {
      await reprocessCv(candidate.id, candidate.cv_url);
      toast.success("CV indexado ✓");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    } catch (err) {
      toast.error("Não rolou. " + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewCv = () => openCv(candidate.cv_url);

  return (
    <div className="flex items-center gap-2 justify-end">
      {indexed && (
        <Badge
          variant="outline"
          className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-0 text-xs font-normal"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Indexado
        </Badge>
      )}

      {isProcessing && (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFile}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isProcessing || isDeactivating}
            title="Ações"
          >
            <DotsThreeVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {hasCv && (
            <DropdownMenuItem onClick={handleViewCv}>
              <Eye className="mr-2 h-4 w-4" />
              Ver CV
            </DropdownMenuItem>
          )}
          {hasCv && !indexed && (
            <DropdownMenuItem onClick={handleReprocess}>
              <Sparkles className="mr-2 h-4 w-4" />
              Indexar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleSelect}>
            {hasCv ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Trocar CV
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Anexar CV
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash className="mr-2 h-4 w-4" />
            Remover
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover candidato</AlertDialogTitle>
            <AlertDialogDescription>
              "{candidate.name}" será removido do banco de talentos. O histórico de candidaturas é preservado (LGPD). Quer continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDeactivate(candidate.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
