import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Download, CheckCircle as CheckCircle2, XCircle, Warning as AlertTriangle, CircleNotch as Loader2, FileText } from "@phosphor-icons/react";
import { toast } from "sonner";
import { sendWhatsAppNotification } from "@/lib/whatsappNotifications";

interface ValidationTabProps {
  collaboratorId: string;
  companyId: string;
  collaboratorStatus: string;
  onStatusChange: () => void;
}

export default function CollaboratorValidationTab({ collaboratorId, companyId, collaboratorStatus, onStatusChange }: ValidationTabProps) {
  const queryClient = useQueryClient();
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [globalRejectReason, setGlobalRejectReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch onboarding session
  const { data: session } = useQuery({
    queryKey: ["onboarding-session", collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_sessions")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch onboarding errors
  const { data: errors = [] } = useQuery({
    queryKey: ["onboarding-errors", session?.id],
    queryFn: async () => {
      if (!session?.id) return [];
      const { data, error } = await supabase
        .from("onboarding_errors")
        .select("*")
        .eq("onboarding_session_id", session.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!session?.id,
  });

  // Fetch documents
  const { data: documents = [] } = useQuery({
    queryKey: ["collaborator-documents", collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_documents")
        .select("*, position_document:position_documents(name, observation, file_type)")
        .eq("collaborator_id", collaboratorId);
      if (error) throw error;
      return data;
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, status, rejection_reason }: { id: string; status: string; rejection_reason?: string }) => {
      const { error } = await supabase.from("collaborator_documents").update({
        status,
        rejection_reason: rejection_reason || null,
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collaborator-documents", collaboratorId] });
    },
  });

  const handleApproveDoc = (docId: string) => {
    updateDocMutation.mutate({ id: docId, status: "aprovado" });
    toast.success("Documento aprovado");
  };

  const handleRejectDoc = () => {
    if (!rejectDocId || !rejectReason.trim()) { toast.error("Informe o motivo"); return; }
    updateDocMutation.mutate({ id: rejectDocId, status: "reprovado", rejection_reason: rejectReason });
    setRejectDocId(null);
    setRejectReason("");
    toast.success("Documento reprovado");
  };

  const handleApproveAll = async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase.from("collaborators").update({ status: "ativo" }).eq("id", collaboratorId);
      if (error) throw error;
      toast.success("Cadastro aprovado! Colaborador ativado.");
      onStatusChange();
      setApproveDialogOpen(false);
      // Send WhatsApp notification
      sendWhatsAppNotification(companyId, collaboratorId, "documents_approved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectAll = async () => {
    if (!globalRejectReason.trim()) { toast.error("Informe o motivo"); return; }
    setIsProcessing(true);
    try {
      const { error } = await supabase.from("collaborators").update({ status: "reprovado" }).eq("id", collaboratorId);
      if (error) throw error;
      toast.success("Cadastro reprovado.");
      onStatusChange();
      setRejectDialogOpen(false);
      setGlobalRejectReason("");
      // Send WhatsApp notification
      sendWhatsAppNotification(companyId, collaboratorId, "documents_rejected");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage.from("collaborator-documents").download(fileUrl);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error("Erro ao baixar: " + err.message);
    }
  };

  const stepLabels: Record<number, string> = { 1: "Dados Cadastrais", 2: "Financeiro", 3: "Documentos" };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Validação de Cadastro
        </h3>

        {/* Onboarding Errors */}
        {errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Sinalizações do Colaborador
            </h4>
            <div className="space-y-2">
              {errors.map((err) => (
                <div key={err.id} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{stepLabels[err.step] || `Step ${err.step}`}</Badge>
                  </div>
                  <p className="text-sm">{err.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Documentos Enviados</h4>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum documento enviado</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{doc.position_document?.name || doc.file_name}</p>
                      {doc.position_document?.observation && (
                        <p className="text-xs text-muted-foreground">{doc.position_document.observation}</p>
                      )}
                    </div>
                    <Badge variant={doc.status === "aprovado" ? "default" : doc.status === "reprovado" ? "destructive" : "secondary"}>
                      {doc.status === "aprovado" ? "Aprovado" : doc.status === "reprovado" ? "Reprovado" : "Pendente"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDownload(doc.file_url, doc.file_name)}>
                      <Download className="w-3 h-3 mr-1" />Baixar
                    </Button>
                    {doc.status !== "aprovado" && (
                      <Button variant="outline" size="sm" onClick={() => handleApproveDoc(doc.id)} className="text-green-600">
                        <CheckCircle2 className="w-3 h-3 mr-1" />Aprovar
                      </Button>
                    )}
                    {doc.status !== "reprovado" && (
                      <Button variant="outline" size="sm" onClick={() => { setRejectDocId(doc.id); setRejectReason(""); }} className="text-destructive">
                        <XCircle className="w-3 h-3 mr-1" />Reprovar
                      </Button>
                    )}
                  </div>
                  {doc.rejection_reason && (
                    <p className="text-xs text-destructive">Motivo: {doc.rejection_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {(collaboratorStatus === "validacao_pendente" || collaboratorStatus === "reprovado") && (
          <div className="flex gap-3 pt-4 border-t">
            <Button className="flex-1" onClick={() => setApproveDialogOpen(true)}>
              <CheckCircle2 className="w-4 h-4 mr-2" />Aprovar Cadastro
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => setRejectDialogOpen(true)}>
              <XCircle className="w-4 h-4 mr-2" />Reprovar Cadastro
            </Button>
          </div>
        )}
      </div>

      {/* Reject Document Dialog */}
      <Dialog open={!!rejectDocId} onOpenChange={(open) => !open && setRejectDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar Documento</DialogTitle>
            <DialogDescription>Informe o motivo da reprovação</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Motivo da reprovação..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDocId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejectDoc}>Reprovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve All Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar Cadastro</AlertDialogTitle>
            <AlertDialogDescription>
              Ao aprovar, o colaborador será ativado e poderá acessar o Portal. Os lançamentos financeiros e exames serão habilitados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveAll} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Aprovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject All Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar Cadastro</DialogTitle>
            <DialogDescription>Informe o motivo geral da reprovação</DialogDescription>
          </DialogHeader>
          <Textarea value={globalRejectReason} onChange={(e) => setGlobalRejectReason(e.target.value)} placeholder="Motivo da reprovação..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejectAll} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Reprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
