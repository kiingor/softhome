import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Download } from "@phosphor-icons/react";
import { useExamDocuments, type OccupationalExam } from "@/hooks/useExams";
import { EXAM_TYPE_LABELS } from "@/lib/riskGroupDefaults";
import { supabase } from "@/integrations/supabase/client";

interface ExamUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: OccupationalExam | null;
}

export const ExamUploadModal = ({ open, onOpenChange, exam }: ExamUploadModalProps) => {
  const { documents, uploadDocument, isUploading } = useExamDocuments(exam?.id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) setSelectedFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  const handleUpload = () => {
    if (!selectedFile || !exam) return;
    uploadDocument(
      { examId: exam.id, companyId: exam.company_id, file: selectedFile },
      {
        onSuccess: () => setSelectedFile(null),
      }
    );
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    // For private bucket, generate signed URL
    const path = fileUrl.split("/exam-documents/")[1];
    if (path) {
      const { data } = await supabase.storage.from("exam-documents").createSignedUrl(path, 60);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  };

  if (!exam) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Enviar ASO
            <Badge variant="secondary">{EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload zone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            {selectedFile ? (
              <p className="text-sm font-medium">{selectedFile.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Arraste um PDF ou clique para selecionar</p>
            )}
          </div>

          {selectedFile && (
            <Button onClick={handleUpload} disabled={isUploading} className="w-full">
              {isUploading ? "Enviando..." : "Enviar ASO"}
            </Button>
          )}

          {/* Versões anteriores */}
          {documents.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Versões anteriores</p>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          v{doc.version} • {new Date(doc.uploaded_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => handleDownload(doc.file_url, doc.file_name)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
