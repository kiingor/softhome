import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type { Candidate } from "../types";
import type { CandidateManualValues } from "../schemas/recruitment.schema";

interface UseCandidatesOptions {
  isActive?: boolean | "all";
}

export function useCandidates(options: UseCandidatesOptions = {}) {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["candidates", companyId, options.isActive],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("candidates")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (options.isActive !== undefined && options.isActive !== "all") {
        q = q.eq("is_active", options.isActive);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
    enabled: !!companyId,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cadastro manual (RH recebeu CV por outro canal e cadastra)
  // ─────────────────────────────────────────────────────────────────────────
  const createCandidate = useMutation({
    mutationFn: async (values: CandidateManualValues) => {
      if (!companyId) throw new Error("Empresa não encontrada");

      // Decisão Q4: detecta recorrente por email + CPF
      const cleanCpf = values.cpf?.replace(/\D/g, "") || null;
      const conditions: string[] = [`email.eq.${values.email}`];
      if (cleanCpf) conditions.push(`cpf.eq.${cleanCpf}`);

      const { data: existing } = await supabase
        .from("candidates")
        .select("id, name, is_active")
        .eq("company_id", companyId)
        .or(conditions.join(","))
        .limit(1);

      if (existing && existing.length > 0) {
        throw new Error(
          `Esse candidato já tá no banco de talentos como "${existing[0].name}". Atualiza o cadastro existente em vez de criar novo.`
        );
      }

      const { data, error } = await supabase
        .from("candidates")
        .insert({
          company_id: companyId,
          name: values.name,
          email: values.email,
          phone: values.phone || null,
          cpf: cleanCpf,
          linkedin_url: values.linkedin_url || null,
          source: values.source || null,
          notes: values.notes || null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Candidate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidato cadastrado ✓");
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Não rolou. Tenta de novo?");
    },
  });

  const updateCandidate = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<CandidateManualValues>;
    }) => {
      const cleanCpf = values.cpf?.replace(/\D/g, "");
      const { error } = await supabase
        .from("candidates")
        .update({
          name: values.name,
          email: values.email,
          phone: values.phone || null,
          cpf: cleanCpf || null,
          linkedin_url: values.linkedin_url || null,
          source: values.source || null,
          notes: values.notes || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Cadastro atualizado ✓");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  // Decisão Q3 (banco de talentos opt-out): "remover" = soft delete via is_active=false
  // Candidato pode pedir saída via LGPD; histórico de aplicações fica preservado.
  const deactivateCandidate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("candidates")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidato saiu do banco de talentos.");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  return {
    candidates,
    isLoading,
    createCandidate,
    updateCandidate,
    deactivateCandidate,
  };
}

export function useCandidate(id: string | undefined) {
  return useQuery({
    queryKey: ["candidate", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Candidate;
    },
    enabled: !!id,
  });
}

// Histórico de aplicações de um candidato (quais vagas ele se candidatou)
export function useCandidateApplications(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["candidate-applications", candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      const { data, error } = await supabase
        .from("candidate_applications")
        .select("*, job:job_openings(id, title, status)")
        .eq("candidate_id", candidateId)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!candidateId,
  });
}
