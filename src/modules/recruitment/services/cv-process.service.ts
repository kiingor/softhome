// Cliente do Edge Function cv-process.
// Faz upload do PDF pro Storage, depois chama a função pra processar.

import { supabase } from "@/integrations/supabase/client";

export const CV_BUCKET = "candidate-cvs";
export const MAX_CV_SIZE_MB = 5;

export interface CvProcessResult {
  success: boolean;
  summary: string;
  tokens: number;
  candidateId: string;
}

export async function uploadAndProcessCv(
  candidateId: string,
  companyId: string,
  file: File,
): Promise<CvProcessResult> {
  // 1. Validações client-side
  if (file.type !== "application/pdf") {
    throw new Error("Só PDF, por enquanto. Tenta com outro arquivo?");
  }
  if (file.size > MAX_CV_SIZE_MB * 1024 * 1024) {
    throw new Error(`CV maior que ${MAX_CV_SIZE_MB}MB.`);
  }

  // 2. Path: <company_id>/<candidate_id>.pdf
  const filePath = `${companyId}/${candidateId}.pdf`;

  // 3. Upload pro Storage
  const { error: uploadError } = await supabase.storage
    .from(CV_BUCKET)
    .upload(filePath, file, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error("Falha no upload: " + uploadError.message);
  }

  // 4. Chama Edge Function pra processar (Claude summary + OpenAI embed)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Sessão expirada. Faz login de novo?");
  }

  const { data, error } = await supabase.functions.invoke<CvProcessResult>(
    "cv-process",
    {
      body: { candidateId, filePath },
    },
  );

  if (error) {
    throw new Error("Falha no processamento: " + error.message);
  }
  if (!data || !data.success) {
    throw new Error("Edge Function não confirmou sucesso.");
  }

  return data;
}

// Reprocessa um CV já cadastrado (gera/atualiza embedding) a partir do
// cv_url existente. Usa filePath se for path de Storage; cvUrl se for
// URL pública (caso de candidato vindo via API de migração).
export async function reprocessCv(
  candidateId: string,
  cvUrl: string,
): Promise<CvProcessResult> {
  const isExternalUrl = cvUrl.startsWith("http");
  const body = isExternalUrl
    ? { candidateId, cvUrl }
    : { candidateId, filePath: cvUrl };

  const { data, error } = await supabase.functions.invoke<CvProcessResult>(
    "cv-process",
    { body },
  );

  if (error) throw new Error("Falha no processamento: " + error.message);
  if (!data || !data.success) {
    throw new Error("Edge Function não confirmou sucesso.");
  }
  return data;
}

// Gera signed URL temporária pra view do CV (bucket é privado)
export async function getCvSignedUrl(
  filePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(CV_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
