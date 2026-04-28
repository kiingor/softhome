import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type { AdmissionDocument } from "../types";
import type { RejectDocumentValues } from "../schemas/admission.schema";

export function useAdmissionDocuments(journeyId: string | undefined) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["admission-documents", journeyId],
    queryFn: async () => {
      if (!journeyId) return [];
      const { data, error } = await supabase
        .from("admission_documents")
        .select("*")
        .eq("journey_id", journeyId)
        .order("doc_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdmissionDocument[];
    },
    enabled: !!journeyId,
  });

  const approveDocument = useMutation({
    mutationFn: async (documentId: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: doc, error: fetchError } = await supabase
        .from("admission_documents")
        .select("doc_type")
        .eq("id", documentId)
        .single();
      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from("admission_documents")
        .update({
          status: "approved",
          reviewer_id: userData?.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", documentId);
      if (error) throw error;

      if (companyId && journeyId) {
        await supabase.from("admission_events").insert({
          company_id: companyId,
          journey_id: journeyId,
          kind: "doc_approved",
          actor_id: userData?.user?.id ?? null,
          document_id: documentId,
          message: `Documento "${doc?.doc_type}" aprovado`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-documents"] });
      queryClient.invalidateQueries({ queryKey: ["admission-events"] });
      toast.success("Documento ok ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  const rejectDocument = useMutation({
    mutationFn: async ({
      documentId,
      values,
    }: {
      documentId: string;
      values: RejectDocumentValues;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: doc } = await supabase
        .from("admission_documents")
        .select("doc_type")
        .eq("id", documentId)
        .single();

      const { error } = await supabase
        .from("admission_documents")
        .update({
          status: "needs_adjustment",
          reviewer_id: userData?.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          rejection_reason: values.rejection_reason,
        })
        .eq("id", documentId);
      if (error) throw error;

      if (companyId && journeyId) {
        await supabase.from("admission_events").insert({
          company_id: companyId,
          journey_id: journeyId,
          kind: "doc_rejected",
          actor_id: userData?.user?.id ?? null,
          document_id: documentId,
          message: `"${doc?.doc_type}" precisa de ajuste: ${values.rejection_reason}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-documents"] });
      queryClient.invalidateQueries({ queryKey: ["admission-events"] });
      toast.success("Ajuste solicitado.");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return {
    documents,
    isLoading,
    approveDocument,
    rejectDocument,
  };
}
