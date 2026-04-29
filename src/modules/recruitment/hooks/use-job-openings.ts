import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type {
  JobOpening,
  JobOpeningStatus,
  JobOpeningWithStats,
  CandidateApplicationWithCandidate,
  ApplicationStage,
} from "../types";
import type { JobOpeningValues } from "../schemas/recruitment.schema";

interface UseJobOpeningsOptions {
  status?: JobOpeningStatus | "all";
}

export function useJobOpenings(options: UseJobOpeningsOptions = {}) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["job-openings", companyId, options.status],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("job_openings")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (options.status && options.status !== "all") q = q.eq("status", options.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as JobOpeningWithStats[];
    },
    enabled: !!companyId,
  });

  const createJob = useMutation({
    mutationFn: async (values: JobOpeningValues) => {
      if (!companyId) throw new Error("Empresa não encontrada");
      const { data: userData } = await supabase.auth.getUser();
      const isOpening = values.status === "open";
      const { data, error } = await supabase
        .from("job_openings")
        .insert({
          company_id: companyId,
          title: values.title,
          description: values.description || null,
          requirements: values.requirements || null,
          regime: values.regime,
          status: values.status,
          position_id: values.position_id || null,
          team_id: values.team_id || null,
          hiring_manager_id: values.hiring_manager_id || userData?.user?.id || null,
          vacancies_count: values.vacancies_count,
          opened_at: isOpening ? new Date().toISOString() : null,
          notes: values.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as JobOpening;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      toast.success("Vaga cadastrada ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  const updateJob = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: JobOpeningValues }) => {
      // Se virou 'open' e ainda não tinha opened_at, marca agora
      const updates: Record<string, unknown> = {
        title: values.title,
        description: values.description || null,
        requirements: values.requirements || null,
        regime: values.regime,
        status: values.status,
        position_id: values.position_id || null,
        team_id: values.team_id || null,
        hiring_manager_id: values.hiring_manager_id || null,
        vacancies_count: values.vacancies_count,
        notes: values.notes || null,
      };

      if (values.status === "open") {
        const { data: existing } = await supabase
          .from("job_openings")
          .select("opened_at")
          .eq("id", id)
          .single();
        if (!existing?.opened_at) updates.opened_at = new Date().toISOString();
      }
      if (values.status === "filled" || values.status === "cancelled") {
        updates.closed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("job_openings").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      queryClient.invalidateQueries({ queryKey: ["job-opening"] });
      toast.success("Vaga atualizada ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return { jobs, isLoading, createJob, updateJob };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single job por id
// ─────────────────────────────────────────────────────────────────────────────

export function useJobOpening(id: string | undefined) {
  return useQuery({
    queryKey: ["job-opening", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("job_openings")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as JobOpening;
    },
    enabled: !!id,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Applications de uma vaga (pro pipeline kanban)
// ─────────────────────────────────────────────────────────────────────────────

export function useJobApplications(jobId: string | undefined) {
  const queryClient = useQueryClient();
  const { currentCompany } = useDashboard();

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["job-applications", jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from("candidate_applications")
        .select("*, candidate:candidates(id, name, email, phone, cv_url)")
        .eq("job_id", jobId)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CandidateApplicationWithCandidate[];
    },
    enabled: !!jobId,
  });

  const moveStage = useMutation({
    mutationFn: async ({
      applicationId,
      stage,
      rejectedReason,
    }: {
      applicationId: string;
      stage: ApplicationStage;
      rejectedReason?: string;
    }) => {
      const updates: Record<string, unknown> = { stage };
      if (stage === "rejected" && rejectedReason) {
        updates.rejected_reason = rejectedReason;
      }
      const { error } = await supabase
        .from("candidate_applications")
        .update(updates)
        .eq("id", applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-applications"] });
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  // Cria aplicação manual (RH cadastra um candidato direto numa vaga,
  // pulando o form público — comum quando recebe CV por outro canal)
  const addApplication = useMutation({
    mutationFn: async (candidateId: string) => {
      if (!jobId || !currentCompany?.id) throw new Error("Empresa ou vaga não encontrada");
      const { error } = await supabase.from("candidate_applications").insert({
        company_id: currentCompany.id,
        job_id: jobId,
        candidate_id: candidateId,
        stage: "new",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      toast.success("Candidato adicionado à vaga ✓");
    },
    onError: (err: Error) => {
      // Unique constraint violation = já existe
      if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
        toast.error("Esse candidato já tá nessa vaga.");
      } else {
        toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
      }
    },
  });

  return { applications, isLoading, moveStage, addApplication };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: dispara criação de admission_journey a partir de uma application
// que está no estágio 'accepted' (decisão Q7: manual via botão)
// ─────────────────────────────────────────────────────────────────────────────

export function useStartAdmissionFromApplication() {
  const queryClient = useQueryClient();
  const { currentCompany } = useDashboard();

  return useMutation({
    mutationFn: async ({
      applicationId,
      candidateName,
      candidateEmail,
      candidateCpf,
      regime,
      positionId,
    }: {
      applicationId: string;
      candidateName: string;
      candidateEmail: string;
      candidateCpf: string | null;
      regime: "clt" | "pj" | "estagiario";
      positionId: string | null;
    }) => {
      if (!currentCompany?.id) throw new Error("Empresa não encontrada");

      // Gera token URL-safe pra acesso público do candidato preencher dados de admissão
      const token = `adm_${crypto.randomUUID().replace(/-/g, "")}`;
      const tokenExpiry = new Date();
      tokenExpiry.setDate(tokenExpiry.getDate() + 30);

      const { data: userData } = await supabase.auth.getUser();

      const { data: journey, error } = await supabase
        .from("admission_journeys")
        .insert({
          company_id: currentCompany.id,
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          candidate_cpf: candidateCpf,
          regime,
          position_id: positionId,
          status: "docs_pending",
          access_token: token,
          token_expires_at: tokenExpiry.toISOString(),
          application_id: applicationId,
          created_by: userData?.user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return journey;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-journeys"] });
      toast.success("Admissão iniciada ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });
}
