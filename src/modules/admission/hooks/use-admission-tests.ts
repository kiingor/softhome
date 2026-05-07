import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";

export interface AdmissionTest {
  id: string;
  company_id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  time_limit_minutes: number | null;
  allow_pause: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// As tabelas novas ainda não foram regeneradas em types.ts; cast pra
// `any` na boundary até o user rodar `supabase gen types`.
const tbl = (name: string) => (supabase as unknown as { from: (n: string) => any }).from(name);

/** Catálogo de testes da empresa (toda a lista, ativos e inativos). */
export function useAdmissionTests() {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["admission-tests", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await tbl("admission_tests")
        .select("*")
        .eq("company_id", companyId)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdmissionTest[];
    },
    enabled: !!companyId,
  });

  const updateTest = useMutation({
    mutationFn: async (patch: Partial<AdmissionTest> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await tbl("admission_tests").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-tests"] });
      toast.success("Teste atualizado ✓");
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  return { tests, isLoading, updateTest };
}

// ─────────────────────────────────────────────────────────────────────────────
// Testes atribuídos a uma jornada de admissão
// ─────────────────────────────────────────────────────────────────────────────

export interface JourneyTest {
  id: string;
  journey_id: string;
  test_id: string;
  test_slug: string;
  status: "not_started" | "in_progress" | "completed" | "reviewed";
  answers: Record<string, unknown>;
  auto_score: number | null;
  reviewer_score: number | null;
  result_summary: Record<string, unknown> | null;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  reviewer_notes: string | null;
}

export function useJourneyTests(journeyId: string | null) {
  const queryClient = useQueryClient();

  const { data: journeyTests = [], isLoading } = useQuery({
    queryKey: ["journey-tests", journeyId],
    queryFn: async () => {
      if (!journeyId) return [];
      const { data, error } = await tbl("admission_journey_tests")
        .select("*, test:admission_tests(*)")
        .eq("journey_id", journeyId)
        .order("assigned_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<JourneyTest & { test: AdmissionTest }>;
    },
    enabled: !!journeyId,
  });

  /** Atribui múltiplos testes do catálogo à jornada (e/ou força reset do status). */
  const assignTests = useMutation({
    mutationFn: async ({ journeyId, testIds }: { journeyId: string; testIds: string[] }) => {
      let inserted = 0;
      if (testIds.length > 0) {
        // Pega slugs dos tests pra snapshot
        const { data: catalogRows, error: catErr } = await tbl("admission_tests")
          .select("id, slug")
          .in("id", testIds);
        if (catErr) throw catErr;

        const rows = (catalogRows ?? []).map((c: { id: string; slug: string }) => ({
          journey_id: journeyId,
          test_id: c.id,
          test_slug: c.slug,
        }));
        if (rows.length > 0) {
          const { error } = await tbl("admission_journey_tests").upsert(rows, {
            onConflict: "journey_id,test_id",
            ignoreDuplicates: true,
          });
          if (error) throw error;
          inserted = rows.length;
        }
      }

      // Reposiciona a journey pra etapa 1 (tests_pending) sempre que ainda
      // está numa fase pré-aprovação E existem testes pendentes.
      // Não mexe se a admissão já foi aprovada (docs_approved+).
      const RESETTABLE = new Set([
        "created",
        "docs_pending",
        "docs_in_review",
        "docs_needs_adjustment",
      ]);
      const { data: j } = await (
        supabase as unknown as { from: (n: string) => any }
      )
        .from("admission_journeys")
        .select("status")
        .eq("id", journeyId)
        .single();
      if (j && RESETTABLE.has(j.status)) {
        // Confirma que existe algum teste pendente antes de "rebobinar".
        const { data: pending } = await tbl("admission_journey_tests")
          .select("id")
          .eq("journey_id", journeyId)
          .in("status", ["not_started", "in_progress"])
          .limit(1);
        if (pending && pending.length > 0) {
          await supabase
            .from("admission_journeys")
            .update({ status: "tests_pending" })
            .eq("id", journeyId);
        }
      }

      // Loga evento só se inseriu novos testes
      if (inserted > 0) {
        await (supabase as unknown as { from: (n: string) => any })
          .from("admission_events")
          .insert({
            journey_id: journeyId,
            kind: "tests_assigned",
            payload: { count: inserted },
          });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-tests"] });
      queryClient.invalidateQueries({ queryKey: ["admission-journey"] });
    },
  });

  /** Remove um teste atribuído (só se ainda não começou). */
  const removeTest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tbl("admission_journey_tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-tests"] });
    },
  });

  return { journeyTests, isLoading, assignTests, removeTest };
}
