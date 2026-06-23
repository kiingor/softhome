import { supabase } from "@/integrations/supabase/client";

export interface ApplicationTest {
  id: string;
  application_id: string;
  candidate_id: string;
  test_id: string;
  test_slug: string;
  status: "not_started" | "in_progress" | "completed" | "reviewed";
  access_token: string;
  answers: Record<string, unknown>;
  auto_score: number | null;
  reviewer_score: number | null;
  result_summary: Record<string, unknown> | null;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface CompanyAdmissionTest {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  time_limit_minutes: number | null;
  allow_pause: boolean;
}

export interface PublicApplicationTest {
  id: string;
  test_slug: string;
  status: "not_started" | "in_progress" | "completed" | "reviewed";
  answers: Record<string, unknown>;
  started_at: string | null;
  expires_at: string | null;
  candidate_name: string;
}

export async function listApplicationTests(
  applicationId: string,
): Promise<ApplicationTest[]> {
  const { data, error } = await supabase
    .from("application_tests")
    .select("*")
    .eq("application_id", applicationId)
    .order("assigned_at");
  if (error) throw error;
  return (data ?? []) as ApplicationTest[];
}

export async function listAvailableAdmissionTests(
  companyId: string,
): Promise<CompanyAdmissionTest[]> {
  const { data, error } = await supabase
    .from("admission_tests")
    .select("id, slug, name, description, category, is_active, time_limit_minutes, allow_pause")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("category")
    .order("name");
  if (error) throw error;
  return (data ?? []) as CompanyAdmissionTest[];
}

export async function assignTests(
  applicationId: string,
  candidateId: string,
  companyId: string,
  testIds: string[],
  testsById: Map<string, CompanyAdmissionTest>,
): Promise<void> {
  const rows = testIds.map((testId) => {
    const t = testsById.get(testId);
    if (!t) throw new Error(`Teste ${testId} não encontrado`);
    return {
      company_id: companyId,
      application_id: applicationId,
      candidate_id: candidateId,
      test_id: testId,
      test_slug: t.slug,
    };
  });
  const { error } = await supabase
    .from("application_tests")
    .upsert(rows, { onConflict: "application_id,test_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function getApplicationTestByToken(
  token: string,
): Promise<PublicApplicationTest | null> {
  const { data, error } = await supabase.rpc("get_application_test_by_token", {
    p_token: token,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PublicApplicationTest | null;
}

// Escritas do candidato (anônimo) vão por RPCs SECURITY DEFINER — a RLS de
// application_tests só libera RH/admin, então UPDATE direto pelo client anônimo
// casava 0 linhas SEM erro e nada persistia. As RPCs recebem o token como
// credencial e tocam só na linha daquele token. Retornam { ok, error }.
type RpcResult = { ok?: boolean; error?: string } | null;

export async function startPublicApplicationTest(token: string): Promise<void> {
  const { data, error } = await supabase.rpc("start_application_test_by_token", {
    p_token: token,
  });
  if (error) throw error;
  const res = data as RpcResult;
  if (res && res.ok === false) throw new Error(res.error ?? "Não foi possível iniciar o teste.");
}

export async function savePublicApplicationTestProgress(
  token: string,
  answers: Record<string, unknown>,
): Promise<void> {
  // Autosave — best effort. Falha é silenciada por quem chama.
  const { error } = await supabase.rpc("save_application_test_progress_by_token", {
    p_token: token,
    p_answers: answers as never,
  });
  if (error) throw error;
}

export async function completePublicApplicationTest(
  token: string,
  finalAnswers: Record<string, unknown>,
  autoScore: number | null,
  resultSummary: Record<string, unknown> | null,
): Promise<void> {
  const { data, error } = await supabase.rpc("complete_application_test_by_token", {
    p_token: token,
    p_answers: finalAnswers as never,
    p_auto_score: autoScore,
    p_result_summary: resultSummary as never,
  });
  if (error) throw error;
  const res = data as RpcResult;
  if (res && res.ok === false) {
    throw new Error(res.error ?? "Não foi possível registrar suas respostas. Tente novamente.");
  }
}

export function buildApplicationTestUrl(token: string): string {
  const origin = window.location.origin;
  return `${origin}/recrutamento/teste/${token}`;
}
