import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CircleNotch as Loader2,
  CheckCircle,
  Warning,
  PaperPlaneRight,
  FileText,
  Trophy,
  FileArrowDown as Upload,
} from "@phosphor-icons/react";
import {
  getAdmissionByToken,
  submitAdmissionDocs,
  type GetByTokenResult,
  type PublicDocumentInfo,
} from "../services/public-admission.service";
import {
  DOCUMENT_TYPE_LABELS,
  REGIME_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentType,
} from "../types";
import { formatCPFInput, formatPhoneInput } from "@/lib/validators";

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string; expired?: boolean; finalStatus?: string }
  | { kind: "ready"; data: GetByTokenResult }
  | { kind: "submitted"; data: GetByTokenResult; allReady: boolean };

export default function AdmissaoPublicaPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const result = await getAdmissionByToken(token);
        setState({ kind: "ready", data: result });
        // Pre-fill os dados que o RH já tinha
        if (result.journey.candidate_phone) {
          setPhone(formatPhoneInput(result.journey.candidate_phone));
        }
        if (result.journey.candidate_cpf) {
          setCpf(formatCPFInput(result.journey.candidate_cpf));
        }
      } catch (err) {
        const msg = (err as Error).message;
        const expired = msg.includes("expired");
        const finalStatusMatch = msg.match(/status:(\w+)/);
        setState({
          kind: "error",
          message: msg,
          expired,
          finalStatus: finalStatusMatch?.[1],
        });
      }
    })();
  }, [token]);

  // Documentos que ainda precisam de submissão (pending OU needs_adjustment)
  const docsToSubmit = useMemo(() => {
    if (state.kind !== "ready" && state.kind !== "submitted") return [];
    return state.data.documents.filter(
      (d) => d.status === "pending" || d.status === "needs_adjustment",
    );
  }, [state]);

  const handleFile = (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFiles((prev) => ({ ...prev, [docId]: file }));
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (state.kind !== "ready") return;

    const fileEntries = Object.entries(files);
    if (fileEntries.length === 0) {
      toast.error("Anexa pelo menos um documento pra continuar.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAdmissionDocs({
        token,
        candidate_data: {
          phone: phone.replace(/\D/g, "") || undefined,
          cpf: cpf.replace(/\D/g, "") || undefined,
        },
        documents: fileEntries.map(([docId, file]) => ({
          doc_id: docId,
          file,
        })),
      });

      // Re-fetch pra atualizar status dos docs
      const refreshed = await getAdmissionByToken(token);

      setState({
        kind: "submitted",
        data: refreshed,
        allReady: result.allRequiredReady,
      });
      setFiles({});

      if (result.errors.length > 0) {
        toast.error(
          `${result.uploaded} enviado${result.uploaded === 1 ? "" : "s"}, ${result.errors.length} com problema. Confere abaixo.`,
        );
      } else {
        toast.success("Pronto ✓");
      }
    } catch (err) {
      toast.error("Não rolou. " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────────────────
  if (state.kind === "loading") {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Erro / expirado / encerrado
  // ─────────────────────────────────────────────────────────────────────────
  if (state.kind === "error") {
    const isFinal = state.finalStatus === "admitted";
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                isFinal
                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                  : "bg-muted"
              }`}
            >
              {isFinal ? (
                <Trophy className="w-8 h-8 text-emerald-700 dark:text-emerald-300" />
              ) : (
                <Warning className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              {isFinal
                ? "Admissão concluída ✓"
                : state.expired
                ? "Link expirou"
                : "Link inválido"}
            </h1>
            <p className="text-muted-foreground mb-6">
              {isFinal
                ? "Que bom te ver aqui — você já foi admitido. Bora começar?"
                : state.expired
                ? "Pede pra empresa gerar um novo link de acesso."
                : "Verifica se você copiou o link completo. Se persistir, pede um novo pra empresa."}
            </p>
            <Button asChild variant="outline">
              <Link to="/">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ready / submitted (mesma UI, com adições de status)
  // ─────────────────────────────────────────────────────────────────────────
  const { journey, documents } = state.data;

  return (
    <div className="min-h-screen gradient-warm py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header SoftHome */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
              <span className="text-primary-foreground font-extrabold text-lg">
                S
              </span>
            </div>
            <span className="text-lg font-extrabold tracking-tight text-foreground">
              SoftHome
            </span>
          </div>
        </div>

        {/* Welcome card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Que bom te ver aqui 👋
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-foreground">
              Olá <strong>{journey.candidate_name}</strong>, você está em
              processo de admissão{" "}
              {journey.company_name && (
                <>
                  na <strong>{journey.company_name}</strong>
                </>
              )}{" "}
              como <strong>{REGIME_LABELS[journey.regime]}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              {state.kind === "submitted" && state.allReady
                ? "Já recebemos todos seus documentos. Agora é só esperar o RH revisar — você vai receber um email."
                : "Anexa abaixo os documentos requeridos. Pode vir como PDF ou foto (JPG/PNG)."}
            </p>
          </CardContent>
        </Card>

        {/* Confirmação de dados */}
        {state.kind === "ready" && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Confirma seus dados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    value={cpf}
                    onChange={(e) => setCpf(formatCPFInput(e.target.value))}
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documentos */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Documentos</CardTitle>
            <p className="text-sm text-muted-foreground">
              {docsToSubmit.length === 0
                ? "Tudo enviado — só esperar a revisão do RH."
                : `Falta${docsToSubmit.length === 1 ? "" : "m"} ${docsToSubmit.length} documento${docsToSubmit.length === 1 ? "" : "s"}.`}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  selectedFile={files[doc.id]}
                  onFile={(e) => handleFile(doc.id, e)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>

        {state.kind === "ready" && docsToSubmit.length > 0 && (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={submitting || Object.keys(files).length === 0}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <PaperPlaneRight className="w-5 h-5 mr-2" />
                Enviar documentos
              </>
            )}
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          Powered by SoftHome — Sistema interno de Gente & Cultura
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DocRow component
// ─────────────────────────────────────────────────────────────────────────────

function DocRow({
  doc,
  selectedFile,
  onFile,
}: {
  doc: PublicDocumentInfo;
  selectedFile: File | undefined;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const docLabel =
    DOCUMENT_TYPE_LABELS[doc.doc_type as DocumentType] ?? doc.doc_type;
  const statusLabel = DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status;

  // Status colors
  const statusBadge =
    doc.status === "approved"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
      : doc.status === "needs_adjustment"
      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
      : doc.status === "submitted" || doc.status === "ai_validating"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
      : "bg-muted text-muted-foreground";

  const canUpload =
    doc.status === "pending" || doc.status === "needs_adjustment";

  return (
    <li className="py-4 flex items-start gap-3">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          doc.status === "approved"
            ? "bg-emerald-100 dark:bg-emerald-900/30"
            : "bg-muted"
        }`}
      >
        {doc.status === "approved" ? (
          <CheckCircle className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
        ) : (
          <FileText className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">
            {docLabel}
            {doc.required && <span className="text-destructive ml-1">*</span>}
          </span>
          <Badge variant="outline" className={`text-xs font-normal border-0 ${statusBadge}`}>
            {statusLabel}
          </Badge>
        </div>

        {doc.rejection_reason && doc.status === "needs_adjustment" && (
          <p className="text-sm text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 p-2 rounded mt-2">
            <strong>Motivo do ajuste:</strong> {doc.rejection_reason}
          </p>
        )}

        {canUpload && (
          <div className="mt-2 flex items-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={onFile}
                className="hidden"
              />
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-muted transition-colors">
                <Upload className="w-4 h-4" />
                {selectedFile ? "Trocar arquivo" : "Anexar"}
              </span>
            </label>
            {selectedFile && (
              <span className="text-xs text-muted-foreground truncate">
                {selectedFile.name} · {(selectedFile.size / 1024).toFixed(0)} KB
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
