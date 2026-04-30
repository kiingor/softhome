import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Check,
  Warning,
  CircleNotch as Loader2,
  FileText,
  Eye,
  Sparkle,
} from "@phosphor-icons/react";
import { useAdmissionDocuments } from "../hooks/use-admission-documents";
import { RejectDocDialog } from "./RejectDocDialog";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  type AdmissionDocument,
  type AIValidationResult,
  type DocumentType,
} from "../types";
import type { RejectDocumentValues } from "../schemas/admission.schema";

interface DocumentListProps {
  journeyId: string;
  canManage: boolean;
}

export function DocumentList({ journeyId, canManage }: DocumentListProps) {
  const { documents, isLoading, approveDocument, rejectDocument, validateDocument } =
    useAdmissionDocuments(journeyId);

  const [rejectingDoc, setRejectingDoc] = useState<AdmissionDocument | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  const handleReject = async (values: RejectDocumentValues) => {
    if (!rejectingDoc) return;
    await rejectDocument.mutateAsync({
      documentId: rejectingDoc.id,
      values,
    });
    setRejectingDoc(null);
  };

  const handleValidate = async (documentId: string) => {
    setValidatingId(documentId);
    try {
      await validateDocument.mutateAsync(documentId);
    } finally {
      setValidatingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhum documento cadastrado.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {documents.map((doc) => {
          const docLabel =
            DOCUMENT_TYPE_LABELS[doc.doc_type as DocumentType] ?? doc.doc_type;
          const submitted =
            doc.status === "submitted" ||
            doc.status === "ai_validating" ||
            doc.status === "approved" ||
            doc.status === "needs_adjustment";

          return (
            <li key={doc.id} className="py-4 flex items-start gap-3">
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  doc.status === "approved"
                    ? "bg-emerald-100 dark:bg-emerald-900/30"
                    : doc.status === "needs_adjustment"
                    ? "bg-orange-100 dark:bg-orange-900/30"
                    : "bg-muted"
                )}
              >
                {doc.status === "approved" ? (
                  <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                ) : doc.status === "needs_adjustment" ? (
                  <Warning className="w-4 h-4 text-orange-700 dark:text-orange-300" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-medium text-foreground">
                      {docLabel}
                      {doc.required && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </p>
                    <Badge variant="outline" className="text-xs mt-1 font-normal">
                      {DOCUMENT_STATUS_LABELS[doc.status]}
                    </Badge>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.file_url && (
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver
                        </a>
                      </Button>
                    )}
                    {canManage && submitted && doc.status !== "approved" && (
                      <>
                        {doc.status === "ai_validating" || validatingId === doc.id ? (
                          <Button variant="outline" size="sm" disabled>
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            IA analisando…
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleValidate(doc.id)}
                            className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800"
                          >
                            <Sparkle className="w-4 h-4 mr-1" />
                            {doc.ai_validation_result ? "Revalidar IA" : "Validar com IA"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => approveDocument.mutate(doc.id)}
                          disabled={approveDocument.isPending}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRejectingDoc(doc)}
                          className="text-orange-700 border-orange-200 hover:bg-orange-50 dark:text-orange-300 dark:border-orange-800"
                        >
                          Pedir ajuste
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {doc.ai_validation_result && (
                  <AIValidationCard
                    result={doc.ai_validation_result as unknown as AIValidationResult}
                    confidence={doc.ai_confidence}
                  />
                )}

                {doc.rejection_reason && doc.status === "needs_adjustment" && (
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-2 bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
                    <strong>Motivo:</strong> {doc.rejection_reason}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <RejectDocDialog
        open={!!rejectingDoc}
        onOpenChange={(o) => !o && setRejectingDoc(null)}
        docLabel={
          rejectingDoc
            ? DOCUMENT_TYPE_LABELS[rejectingDoc.doc_type as DocumentType] ??
              rejectingDoc.doc_type
            : ""
        }
        onSubmit={handleReject}
        isSubmitting={rejectDocument.isPending}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card do parecer da IA (usa cores baseadas em legibilidade + match)
// ─────────────────────────────────────────────────────────────────────────────

function AIValidationCard({
  result,
  confidence,
}: {
  result: AIValidationResult;
  confidence: number | null;
}) {
  const hasIssue =
    !result.is_legible || !result.type_matches || !result.data_matches_cadastro ||
    result.warnings.length > 0;

  const tone = hasIssue
    ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
    : "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800";

  const titleTone = hasIssue
    ? "text-amber-900 dark:text-amber-200"
    : "text-emerald-900 dark:text-emerald-200";

  const confidencePct = confidence != null ? `${Math.round(confidence * 100)}%` : "—";

  return (
    <div className={cn("mt-3 border rounded-md p-3 text-sm", tone)}>
      <div className={cn("flex items-center gap-2 font-medium", titleTone)}>
        <Sparkle className="w-4 h-4" />
        Parecer da IA
        <Badge variant="outline" className="ml-auto text-xs font-normal">
          confiança {confidencePct}
        </Badge>
      </div>

      <ul className="mt-2 space-y-1 text-foreground/80">
        <li>
          {result.is_legible ? "✓" : "✗"} Legível
        </li>
        <li>
          {result.type_matches ? "✓" : "✗"} Tipo bate com o esperado
          {!result.type_matches && (
            <span className="text-muted-foreground"> (detectou: {result.detected_type})</span>
          )}
        </li>
        <li>
          {result.data_matches_cadastro ? "✓" : "✗"} Dados batem com o cadastro
        </li>
      </ul>

      {result.warnings.length > 0 && (
        <div className="mt-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Avisos
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-foreground/80">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        IA não substitui revisão humana — confira antes de aprovar.
      </p>
    </div>
  );
}
