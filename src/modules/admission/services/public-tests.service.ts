// Cliente HTTP pra edge function `admission-public-tests`. Usado pela
// página pública /admissao/:token quando a journey está na etapa de
// testes (stage 1).

import { supabase } from "@/integrations/supabase/client";

export interface PublicJourneyInfo {
  id: string;
  candidate_name: string;
  status: string;
}

export interface PublicJourneyTest {
  id: string;
  test_id: string;
  test_slug: string;
  status: "not_started" | "in_progress" | "completed" | "reviewed";
  started_at: string | null;
  completed_at: string | null;
  test: {
    name: string;
    description: string | null;
    category: string | null;
    time_limit_minutes: number | null;
    allow_pause: boolean;
  };
}

export interface PublicTestsResponse {
  success: true;
  journey: PublicJourneyInfo;
  tests: PublicJourneyTest[];
}

async function call(action: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admission-public-tests", {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function getPublicTests(token: string): Promise<PublicTestsResponse> {
  return call("get", { token });
}

export function startPublicTest(token: string, journeyTestId: string) {
  return call("start", { token, journeyTestId });
}

export function savePublicTestProgress(
  token: string,
  journeyTestId: string,
  answers: Record<string, unknown>,
) {
  return call("save", { token, journeyTestId, answers });
}

export function completePublicTest(
  token: string,
  journeyTestId: string,
  answers: Record<string, unknown>,
  autoScore: number,
  resultSummary: Record<string, unknown>,
) {
  return call("complete", {
    token,
    journeyTestId,
    answers,
    autoScore,
    resultSummary,
  });
}
