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

export async function startPublicApplicationTest(token: string): Promise<void> {
  const { error } = await supabase
    .from("application_tests")
    .update({
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .eq("access_token", token)
    .in("status", ["not_started"]);
  if (error) throw error;
}

export async function savePublicApplicationTestProgress(
  token: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("application_tests")
    .update({ answers })
    .eq("access_token", token);
  if (error) throw error;
}

export async function completePublicApplicationTest(
  token: string,
  finalAnswers: Record<string, unknown>,
  autoScore: number | null,
  resultSummary: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await supabase
    .from("application_tests")
    .update({
      status: "completed",
      answers: finalAnswers,
      auto_score: autoScore,
      result_summary: resultSummary,
      completed_at: new Date().toISOString(),
    })
    .eq("access_token", token);
  if (error) throw error;
}

export function buildApplicationTestUrl(token: string): string {
  const origin = window.location.origin;
  return `${origin}/recrutamento/teste/${token}`;
}

// ─────────────────────────────────────────────────────────────────────
// Session-based (1 link único pra application com todos os testes)
// ─────────────────────────────────────────────────────────────────────

export interface ApplicationTestSessionItem {
  id: string;
  test_slug: string;
  status: "not_started" | "in_progress" | "completed" | "reviewed";
  answers: Record<string, unknown>;
  completed_at: string | null;
  started_at: string | null;
  name: string;
  description: string | null;
  category: string | null;
  time_limit_minutes: number | null;
}

export interface ApplicationTestSession {
  application_id: string;
  candidate_name: string;
  job_title: string;
  tests: ApplicationTestSessionItem[];
}

export async function getApplicationTestsSession(
  token: string,
): Promise<ApplicationTestSession | null> {
  const { data, error } = await supabase.rpc("get_application_tests_session", {
    p_token: token,
  });
  if (error) throw error;
  if (!data) return null;
  return data as unknown as ApplicationTestSession;
}

export async function startApplicationTestInSession(
  token: string,
  testId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "start_application_test_in_session",
    { p_token: token, p_test_id: testId },
  );
  if (error) throw error;
  const res = data as { ok?: boolean; error?: string } | null;
  if (res?.ok === false) throw new Error(res.error ?? "Falha ao iniciar teste");
}

export async function saveApplicationTestProgressInSession(
  token: string,
  testId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc(
    "save_application_test_progress_in_session",
    { p_token: token, p_test_id: testId, p_answers: answers },
  );
  if (error) throw error;
}

export async function completeApplicationTestInSession(
  token: string,
  testId: string,
  answers: Record<string, unknown>,
  autoScore: number | null,
  resultSummary: Record<string, unknown> | null,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "complete_application_test_in_session",
    {
      p_token: token,
      p_test_id: testId,
      p_answers: answers,
      p_auto_score: autoScore,
      p_result_summary: resultSummary,
    },
  );
  if (error) throw error;
  const res = data as { ok?: boolean; error?: string } | null;
  if (res?.ok === false) throw new Error(res.error ?? "Falha ao finalizar");
}

export function buildApplicationTestsSessionUrl(sessionToken: string): string {
  const origin = window.location.origin;
  return `${origin}/recrutamento/teste/${sessionToken}`;
}

export async function getApplicationSessionToken(
  applicationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("candidate_applications")
    .select("tests_session_token")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw error;
  return (data?.tests_session_token as string | null) ?? null;
}
