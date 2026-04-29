import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleNotch as Loader2,
  Upload,
  Eye,
  CheckCircle,
  ArrowsClockwise as RefreshCw,
} from "@phosphor-icons/react";
import {
  uploadAndProcessCv,
  getCvSignedUrl,
} from "../services/cv-process.service";
import type { Candidate } from "../types";

interface CvUploadCellProps {
  candidate: Candidate;
}

export function CvUploadCell({ candidate }: CvUploadCellProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();

  const indexed = !!candidate.cv_processed_at;
  const hasCv = !!candidate.cv_url;

  const handleSelect = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset input pra permitir upload do mesmo arquivo de novo

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

  const handleViewCv = async () => {
    if (!candidate.cv_url) return;
    const url = await getCvSignedUrl(candidate.cv_url);
    if (url) {
      window.open(url, "_blank", "noopener");
    } else {
      toast.error("Não consegui gerar o link de download.");
    }
  };

  if (isProcessing) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Processando...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFile}
      />

      {indexed && (
        <Badge
          variant="outline"
          className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0 text-xs font-normal"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Indexado
        </Badge>
      )}

      {hasCv && (
        <Button variant="ghost" size="sm" onClick={handleViewCv} title="Ver CV">
          <Eye className="w-4 h-4" />
        </Button>
      )}

      <Button
        variant={hasCv ? "ghost" : "outline"}
        size="sm"
        onClick={handleSelect}
        title={hasCv ? "Trocar CV" : "Anexar CV"}
      >
        {hasCv ? (
          <RefreshCw className="w-4 h-4" />
        ) : (
          <>
            <Upload className="w-4 h-4 mr-1" />
            Anexar CV
          </>
        )}
      </Button>
    </div>
  );
}
