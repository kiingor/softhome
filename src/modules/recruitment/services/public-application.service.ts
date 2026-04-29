// Cliente do Edge Function recruitment-apply.
// Endpoint público — não exige JWT, usa apenas o ANON_KEY do Supabase.

import { supabase } from "@/integrations/supabase/client";

export interface SubmitApplicationInput {
  jobId: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  linkedin_url?: string;
  cover_letter?: string;
  consent_talent_pool: boolean;
  consent_lgpd: boolean;
  cvFile: File;
}

export interface SubmitApplicationResult {
  success: boolean;
  applicationId: string;
  candidateId: string;
  indexed: boolean;
  message: string;
}

const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<SubmitApplicationResult> {
  if (input.cvFile.type !== "application/pdf") {
    throw new Error("Só PDF, por enquanto.");
  }
  if (input.cvFile.size > MAX_CV_BYTES) {
    throw new Error("CV passou de 5MB. Reduz e tenta de novo?");
  }

  const cvBase64 = await fileToBase64(input.cvFile);

  const { data, error } = await supabase.functions.invoke<SubmitApplicationResult>(
    "recruitment-apply",
    {
      body: {
        jobId: input.jobId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        cpf: input.cpf,
        linkedin_url: input.linkedin_url ?? "",
        cover_letter: input.cover_letter ?? "",
        consent_talent_pool: input.consent_talent_pool,
        consent_lgpd: input.consent_lgpd,
        cvBase64,
        cvFilename: input.cvFile.name,
      },
    },
  );

  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      } catch {
        // ignore
      }
    }
    throw new Error(msg);
  }
  if (!data || !data.success) {
    throw new Error("Edge Function retornou sem sucesso.");
  }
  return data;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o prefixo "data:application/pdf;base64,"
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Hook simples pra buscar dados públicos da vaga (título, descrição, requisitos)
// Usado pra mostrar o que a pessoa tá se candidatando antes do form.
// RLS atual em job_openings exige role autenticada — vou usar uma RPC pública
// ou fallback pra "dados básicos" via Edge Function. Por simplicidade v1, faço
// chamada anon e se RLS bloquear, mostro só o ID.
export async function getPublicJobInfo(
  jobId: string,
): Promise<{
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  regime: string;
  status: string;
} | null> {
  const { data } = await supabase
    .from("job_openings")
    .select("id, title, description, requirements, regime, status")
    .eq("id", jobId)
    .maybeSingle();
  return data;
}
