import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PayslipUploadZoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}

const PayslipUploadZone = ({ files, onFilesChange, disabled }: PayslipUploadZoneProps) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // Filter only PDFs
      const pdfFiles = acceptedFiles.filter(
        (file) => file.type === "application/pdf"
      );
      onFilesChange([...files, ...pdfFiles]);
    },
    [files, onFilesChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    disabled,
    multiple: true,
  });

  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    onFilesChange(newFiles);
  };

  const clearAll = () => {
    onFilesChange([]);
  };

  return (
    <div className="space-y-4">
      <Card
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <CardContent className="p-8 text-center">
          <input {...getInputProps()} />
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          {isDragActive ? (
            <p className="text-primary font-medium">Solte os arquivos aqui...</p>
          ) : (
            <>
              <p className="font-medium text-foreground mb-1">
                Arraste e solte os contracheques aqui
              </p>
              <p className="text-sm text-muted-foreground">
                ou clique para selecionar (apenas PDFs)
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {files.length} arquivo(s) selecionado(s)
            </p>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Limpar todos
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-muted/50 rounded-lg">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-2 bg-background rounded-md"
              >
                <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => removeFile(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PayslipUploadZone;
