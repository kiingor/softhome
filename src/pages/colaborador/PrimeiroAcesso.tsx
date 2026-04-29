import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ArrowRight, CircleNotch as Loader2, CheckCircle as CheckCircle2, Warning as AlertTriangle, Upload, FileText, User, CurrencyDollar as DollarSign } from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCPFInput, cleanCPF } from "@/lib/validators";
import { formatCurrency } from "@/lib/formatters";

interface OnboardingData {
  collaborator: {
    id: string; name: string; cpf: string; email: string | null; phone: string | null; position: string | null; status: string;
  };
  company: { company_name: string; logo_url: string | null; cnpj: string | null };
  session: { id: string; current_step: number; data_validated: boolean; financial_validated: boolean; documents_completed: boolean };
  requiredDocuments: { id: string; name: string; observation: string | null; file_type: string }[];
  uploadedDocuments: { id: string; position_document_id: string; file_url: string; file_name: string; status: string; rejection_reason: string | null }[];
  financialEntries: { id: string; type: string; value: number; description: string | null }[];
  benefits: { id: string; benefit: { id: string; name: string; value: number; value_type: string } }[];
  errors: { id: string; step: number; description: string; created_at: string }[];
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  salario: "Salário", vale: "Vale", custo: "Custo", despesa: "Despesa",
  adicional: "Adicional", inss: "INSS", fgts: "FGTS", irpf: "IRPF",
};

export default function PrimeiroAcesso() {
  const [cpf, setCpf] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<OnboardingData | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDescription, setErrorDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  const lookupCpf = async () => {
    const cleaned = cleanCPF(cpf);
    if (cleaned.length !== 11) { toast.error("CPF inválido"); return; }
    setIsLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("onboarding-lookup", {
        body: { cpf: cleaned },
      });
      if (error) throw error;
      if (response?.error) { toast.error(response.error); return; }
      setData(response);
      setCurrentStep(response.session.current_step);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar CPF");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = useCallback(async (action: string, actionData?: any) => {
    if (!data) return;
    setIsSubmitting(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("onboarding-action", {
        body: { action, collaborator_id: data.collaborator.id, session_id: data.session.id, data: actionData },
      });
      if (error) throw error;
      if (response?.error) { toast.error(response.error); return; }
      return response;
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setIsSubmitting(false);
    }
  }, [data]);

  const advanceStep = async () => {
    const result = await handleAction("validate_step", { step: currentStep });
    if (result?.success) setCurrentStep((s) => s + 1);
  };

  const reportError = async () => {
    if (!errorDescription.trim()) { toast.error("Descreva o erro"); return; }
    const result = await handleAction("report_error", { step: currentStep, description: errorDescription });
    if (result?.success) {
      setErrorDialogOpen(false);
      setErrorDescription("");
      setCurrentStep((s) => s + 1);
      toast.success("Erro sinalizado com sucesso");
    }
  };

  const completeOnboarding = async () => {
    const result = await handleAction("complete", {});
    if (result?.success) {
      setCurrentStep(4);
      toast.success("Cadastro finalizado!");
    }
  };

  const uploadDocument = async (positionDocumentId: string, file: File) => {
    if (!data) return;
    setUploadingDocId(positionDocumentId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("collaborator_id", data.collaborator.id);
      formData.append("company_id", data.company.cnpj ? data.collaborator.id : data.session.id);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "szvskyxczgvfcbucmjjk";
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Get company_id from session
      const { data: collabData } = await supabase.functions.invoke("onboarding-lookup", {
        body: { cpf: cleanCPF(cpf) },
      });

      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("collaborator_id", data.collaborator.id);
      uploadFormData.append("company_id", collabData?.session?.company_id || "");
      uploadFormData.append("position_document_id", positionDocumentId);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-upload`,
        {
          method: "POST",
          headers: { apikey: anonKey },
          body: uploadFormData,
        }
      );

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      // Refresh data
      const { data: refreshed } = await supabase.functions.invoke("onboarding-lookup", {
        body: { cpf: cleanCPF(cpf) },
      });
      if (refreshed && !refreshed.error) setData(refreshed);

      toast.success("Documento enviado!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar documento");
    } finally {
      setUploadingDocId(null);
    }
  };

  const getDocStatus = (posDocId: string) => {
    return data?.uploadedDocuments.find((d) => d.position_document_id === posDocId);
  };

  const uploadedCount = data?.requiredDocuments.filter((rd) => getDocStatus(rd.id)).length || 0;
  const totalDocs = data?.requiredDocuments.length || 0;
  const allDocsUploaded = totalDocs > 0 && uploadedCount === totalDocs;
  const progressPercent = totalDocs > 0 ? (uploadedCount / totalDocs) * 100 : 0;

  // CPF Entry Screen
  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Link to="/portal/login" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />Voltar ao login
          </Link>
          <Card>
            <CardHeader className="text-center">
              <div className="inline-flex items-center justify-center gap-2 mb-2">
                <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center"><User className="text-primary-foreground w-6 h-6" /></div>
              </div>
              <CardTitle className="text-xl">Primeiro Acesso</CardTitle>
              <p className="text-muted-foreground text-sm">Digite seu CPF para iniciar o processo de validação</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input
                  value={cpf} onChange={(e) => setCpf(formatCPFInput(e.target.value))}
                  placeholder="000.000.000-00" maxLength={14}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupCpf(); } }}
                />
              </div>
              <Button className="w-full" onClick={lookupCpf} disabled={isLoading}>
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Buscando...</> : "Continuar"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Completed Screen
  if (currentStep >= 4) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="w-16 h-16 mx-auto text-green-500" />
            <h2 className="text-2xl font-bold">Cadastro Pré-Aprovado!</h2>
            <p className="text-muted-foreground">Seus documentos serão validados pela equipe de RH. Você será notificado quando seu acesso for liberado.</p>
            <Link to="/portal/login">
              <Button variant="outline" className="mt-4">Voltar ao Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step-by-step UI
  const steps = [
    { number: 1, label: "Dados Cadastrais", icon: User },
    { number: 2, label: "Financeiro", icon: DollarSign },
    { number: 3, label: "Documentos", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Company Header */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto p-4 flex items-center gap-3">
          {data.company.logo_url && (
            <img src={data.company.logo_url} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
          )}
          <div>
            <h1 className="font-semibold text-foreground">{data.company.company_name}</h1>
            <p className="text-xs text-muted-foreground">Primeiro Acesso - Validação de Cadastro</p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, i) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${currentStep >= step.number ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep >= step.number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {currentStep > step.number ? <CheckCircle2 className="w-5 h-5" /> : step.number}
                </div>
                <span className="text-xs font-medium hidden sm:inline">{step.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${currentStep > step.number ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 - Dados Cadastrais */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" />Dados Cadastrais</CardTitle>
              <p className="text-sm text-muted-foreground">Verifique se seus dados estão corretos</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label className="text-muted-foreground text-xs">Nome</Label><p className="font-medium">{data.collaborator.name}</p></div>
                <div><Label className="text-muted-foreground text-xs">CPF</Label><p className="font-medium">{data.collaborator.cpf}</p></div>
                <div><Label className="text-muted-foreground text-xs">Email</Label><p className="font-medium">{data.collaborator.email || "-"}</p></div>
                <div><Label className="text-muted-foreground text-xs">Telefone</Label><p className="font-medium">{data.collaborator.phone || "-"}</p></div>
                <div><Label className="text-muted-foreground text-xs">Cargo</Label><p className="font-medium">{data.collaborator.position || "-"}</p></div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button variant="outline" className="flex-1" onClick={() => setErrorDialogOpen(true)}>
                  <AlertTriangle className="w-4 h-4 mr-2" />Sinalizar Erro
                </Button>
                <Button className="flex-1" onClick={advanceStep} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}Avançar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 - Financeiro + Benefícios */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" />Lançamentos Financeiros e Benefícios</CardTitle>
              <p className="text-sm text-muted-foreground">Verifique seus lançamentos e benefícios atribuídos</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {data.financialEntries.length > 0 ? (
                <div>
                  <h3 className="font-medium mb-2">Lançamentos</h3>
                  <div className="space-y-2">
                    {data.financialEntries.map((entry) => {
                      const isCredit = entry.type === "salario" || entry.type === "adicional";
                      const sign = isCredit ? "+" : "-";
                      const colorClass = isCredit ? "text-green-600" : "text-red-600";
                      return (
                      <div key={entry.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-sm">{ENTRY_TYPE_LABELS[entry.type] || entry.type}{entry.description ? ` - ${entry.description}` : ""}</span>
                        <span className={`font-medium ${colorClass}`}>{sign} {formatCurrency(entry.value)}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Nenhum lançamento financeiro encontrado.</p>
              )}

              {data.benefits.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Benefícios</h3>
                  <div className="space-y-2">
                    {data.benefits.map((ba) => (
                      <div key={ba.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-sm">{ba.benefit.name}</span>
                        <span className="font-medium">{formatCurrency(ba.benefit.value)}/{ba.benefit.value_type === "daily" ? "dia" : "mês"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button variant="outline" className="flex-1" onClick={() => setErrorDialogOpen(true)}>
                  <AlertTriangle className="w-4 h-4 mr-2" />Sinalizar Erro
                </Button>
                <Button className="flex-1" onClick={advanceStep} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}Avançar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 - Documentos */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Upload de Documentos</CardTitle>
              <p className="text-sm text-muted-foreground">Envie os documentos obrigatórios para o seu cargo</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{uploadedCount} de {totalDocs} documentos enviados</span>
                  <span>{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              <div className="space-y-3">
                {data.requiredDocuments.map((doc) => {
                  const uploaded = getDocStatus(doc.id);
                  const isUploading = uploadingDocId === doc.id;

                  return (
                    <div key={doc.id} className="p-4 rounded-lg border bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{doc.name}</p>
                          {doc.observation && <p className="text-xs text-muted-foreground">{doc.observation}</p>}
                          <Badge variant="outline" className="mt-1 text-xs">{doc.file_type.toUpperCase()}</Badge>
                        </div>
                        {uploaded && (
                          <Badge variant={uploaded.status === "aprovado" ? "default" : uploaded.status === "reprovado" ? "destructive" : "secondary"}>
                            {uploaded.status === "aprovado" ? "Aprovado" : uploaded.status === "reprovado" ? "Reprovado" : "Enviado"}
                          </Badge>
                        )}
                      </div>

                      {uploaded?.status === "reprovado" && uploaded.rejection_reason && (
                        <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
                          <strong>Motivo da reprovação:</strong> {uploaded.rejection_reason}
                        </div>
                      )}

                      {(!uploaded || uploaded.status === "reprovado") && (
                        <div>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              className="hidden"
                              accept={doc.file_type === "pdf" ? ".pdf" : doc.file_type === "image" ? "image/*" : ".doc,.docx"}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocument(doc.id, f); }}
                              disabled={isUploading}
                            />
                            <div className="flex items-center gap-2 p-2 rounded border border-dashed hover:border-primary transition-colors text-sm text-muted-foreground hover:text-foreground">
                              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                              {isUploading ? "Enviando..." : uploaded?.status === "reprovado" ? "Reenviar documento" : "Enviar documento"}
                            </div>
                          </label>
                        </div>
                      )}

                      {uploaded && uploaded.status !== "reprovado" && (
                        <p className="text-xs text-muted-foreground">✓ {uploaded.file_name}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {totalDocs === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">Nenhum documento obrigatório cadastrado para seu cargo.</p>
              )}

              <div className="pt-4 border-t">
                <Button className="w-full" onClick={completeOnboarding} disabled={isSubmitting || (!allDocsUploaded && totalDocs > 0)}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Finalizar Cadastro
                </Button>
                {!allDocsUploaded && totalDocs > 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">Envie todos os documentos para finalizar</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sinalizar Erro</DialogTitle>
            <DialogDescription>Descreva o que está incorreto nos seus dados</DialogDescription>
          </DialogHeader>
          <Textarea
            value={errorDescription} onChange={(e) => setErrorDescription(e.target.value)}
            placeholder="Descreva o erro encontrado..." rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorDialogOpen(false)}>Cancelar</Button>
            <Button onClick={reportError} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Enviar e Avançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
