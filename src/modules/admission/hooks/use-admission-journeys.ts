import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type {
  AdmissionJourney,
  AdmissionJourneyStatus,
  CollaboratorRegime,
  AdmissionJourneyWithCounts,
} from "../types";
import type { NewAdmissionValues } from "../schemas/admission.schema";
import { REQUIRED_DOCS_BY_REGIME, DOCUMENT_TYPE_LABELS } from "../types";

interface UseAdmissionJourneysOptions {
  status?: AdmissionJourneyStatus | "all";
  regime?: CollaboratorRegime | "all";
}

// Gera token URL-safe ~32 chars (uuid-style sem hyphens, com timestamp)
function generateAccessToken(): string {
  const a = crypto.randomUUID().replace(/-/g, "");
  return `adm_${a}`;
}

// Decisão Q7: TTL de 30 dias com regenerar
const TOKEN_TTL_DAYS = 30;

function tokenExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_TTL_DAYS);
  return d.toISOString();
}

export function useAdmissionJourneys(options: UseAdmissionJourneysOptions = {}) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: journeys = [], isLoading } = useQuery({
    queryKey: ["admission-journeys", companyId, options.status, options.regime],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("admission_journeys")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (options.status && options.status !== "all") q = q.eq("status", options.status);
      if (options.regime && options.regime !== "all") q = q.eq("regime", options.regime);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AdmissionJourneyWithCounts[];
    },
    enabled: !!companyId,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cria nova journey + auto-popula admission_documents conforme regime
  // (decisão Q1: tabela default de docs por regime)
  // ─────────────────────────────────────────────────────────────────────────
  const createJourney = useMutation({
    mutationFn: async (values: NewAdmissionValues) => {
      if (!companyId) throw new Error("Empresa não encontrada");

      const { data: userData } = await supabase.auth.getUser();
      const accessToken = generateAccessToken();

      // 1. Cria journey
      const { data: journey, error: journeyError } = await supabase
        .from("admission_journeys")
        .insert({
          company_id: companyId,
          candidate_name: values.candidate_name,
          candidate_email: values.candidate_email || null,
          candidate_phone: values.candidate_phone || null,
          candidate_cpf: values.candidate_cpf || null,
          regime: values.regime,
          position_id: values.position_id || null,
          status: "docs_pending",
          access_token: accessToken,
          token_expires_at: tokenExpiry(),
          notes: values.notes || null,
          created_by: userData?.user?.id ?? null,
        })
        .select()
        .single();

      if (journeyError) throw journeyError;
      if (!journey) throw new Error("Falha ao criar admissão");

      // 2. Popula docs requeridos por regime
      const requiredDocs = REQUIRED_DOCS_BY_REGIME[values.regime];
      const docsToInsert = requiredDocs.map((docType) => ({
        company_id: companyId,
        journey_id: journey.id,
        doc_type: docType,
        required: true,
        status: "pending" as const,
      }));

      const { error: docsError } = await supabase
        .from("admission_documents")
        .insert(docsToInsert);

      if (docsError) throw docsError;

      // 3. Evento na timeline
      const { error: eventError } = await supabase.from("admission_events").insert({
        company_id: companyId,
        journey_id: journey.id,
        kind: "created",
        actor_id: userData?.user?.id ?? null,
        message: `Admissão criada para ${values.candidate_name} (${values.regime.toUpperCase()})`,
      });

      if (eventError) console.error("Erro ao registrar evento:", eventError);

      // 4. Auto-envio do link por email se candidato tem email cadastrado.
      //    Falha silenciosa: RH ainda pode reenviar manualmente no detail.
      if (values.candidate_email) {
        try {
          await supabase.functions.invoke("admission-send-token", {
            body: {
              journey_id: journey.id,
              public_url_origin: window.location.origin,
            },
          });
        } catch (err) {
          console.warn("[admission] auto-send do email falhou:", err);
        }
      }

      return journey;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-journeys"] });
      queryClient.invalidateQueries({ queryKey: ["admission-events"] });
      toast.success("Admissão criada ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Reenvia link por email (botão "Enviar por email" no detail)
  // ─────────────────────────────────────────────────────────────────────────
  const sendTokenEmail = useMutation({
    mutationFn: async (journeyId: string) => {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        sent_to: string;
        resend_id: string;
      }>("admission-send-token", {
        body: {
          journey_id: journeyId,
          public_url_origin: window.location.origin,
        },
      });

      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string; details?: string }> } }).context;
        if (ctx?.json) {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error + (body.details ? ` — ${body.details}` : "");
          } catch {
            // ignore
          }
        }
        throw new Error(msg);
      }
      if (!data) throw new Error("Resposta vazia");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admission-events"] });
      toast.success(`Email enviado pra ${data.sent_to} ✓`);
    },
    onError: (err: Error) => {
      toast.error("Não rolou enviar. " + (err.message ?? "Tenta de novo?"));
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Atualiza status (e registra evento)
  // ─────────────────────────────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      message,
    }: {
      id: string;
      status: AdmissionJourneyStatus;
      message?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from("admission_journeys")
        .update({ status })
        .eq("id", id);

      if (updateError) throw updateError;

      // Mapeia status → kind do evento
      const kindByStatus: Partial<Record<AdmissionJourneyStatus, string>> = {
        cancelled: "cancelled",
        admitted: "admitted",
        contract_signed: "contract_signed",
        exam_scheduled: "exam_scheduled",
        exam_done: "exam_completed",
      };

      const kind = (kindByStatus[status] ?? "note") as
        | "cancelled"
        | "admitted"
        | "contract_signed"
        | "exam_scheduled"
        | "exam_completed"
        | "note";

      if (companyId) {
        await supabase.from("admission_events").insert({
          company_id: companyId,
          journey_id: id,
          kind,
          actor_id: userData?.user?.id ?? null,
          message: message ?? `Status mudou para "${status}"`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-journeys"] });
      queryClient.invalidateQueries({ queryKey: ["admission-journey"] });
      queryClient.invalidateQueries({ queryKey: ["admission-events"] });
      toast.success("Atualizado ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Regenera access_token (decisão Q7: regenerável)
  // ─────────────────────────────────────────────────────────────────────────
  const regenerateToken = useMutation({
    mutationFn: async (id: string) => {
      const newToken = generateAccessToken();
      const { error } = await supabase
        .from("admission_journeys")
        .update({
          access_token: newToken,
          token_expires_at: tokenExpiry(),
        })
        .eq("id", id);
      if (error) throw error;

      if (companyId) {
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from("admission_events").insert({
          company_id: companyId,
          journey_id: id,
          kind: "token_sent",
          actor_id: userData?.user?.id ?? null,
          message: "Link de acesso regenerado (validade 30 dias)",
        });
      }
      return newToken;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-journey"] });
      queryClient.invalidateQueries({ queryKey: ["admission-events"] });
      toast.success("Link regenerado ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return {
    journeys,
    isLoading,
    createJourney,
    updateStatus,
    regenerateToken,
    sendTokenEmail,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single journey por id (pra detail page)
// ─────────────────────────────────────────────────────────────────────────────

export function useAdmissionJourney(id: string | undefined) {
  return useQuery({
    queryKey: ["admission-journey", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("admission_journeys")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as AdmissionJourney;
    },
    enabled: !!id,
  });
}

// Helper exportado pra construir URL pública do form do candidato
export function buildCandidateFormUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/admissao/${token}`;
}

// Lista legível de docs requeridos pra mostrar em UI
export function listRequiredDocs(regime: CollaboratorRegime): string {
  return REQUIRED_DOCS_BY_REGIME[regime]
    .map((d) => DOCUMENT_TYPE_LABELS[d])
    .join(", ");
}
