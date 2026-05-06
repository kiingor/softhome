// Cliente público pra Edge Functions admission-public-{get,submit}.
// Usado pela página /admissao/:token.

import { supabase } from "@/integrations/supabase/client";
import type {
  AdmissionDocumentStatus,
  AdmissionJourneyStatus,
  CollaboratorRegime,
} from "../types";

export interface CandidateDataInput {
  phone?: string;
  cpf?: string;
  email?: string;
  birth_date?: string;
  rg?: string;
  zip?: string;
  address?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface PublicJourneyInfo {
  id: string;
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  candidate_cpf: string | null;
  candidate_birth_date: string | null;
  candidate_rg: string | null;
  candidate_zip: string | null;
  candidate_address: string | null;
  candidate_address_number: string | null;
  candidate_address_complement: string | null;
  candidate_neighborhood: string | null;
  candidate_city: string | null;
  candidate_state: string | null;
  regime: CollaboratorRegime;
  status: AdmissionJourneyStatus;
  token_expires_at: string | null;
  company_name: string | null;
}

export interface PublicDocumentInfo {
  id: string;
  doc_type: string;
  required: boolean;
  status: AdmissionDocumentStatus;
  file_url: string | null;
  file_name: string | null;
  rejection_reason: string | null;
  uploaded_at: string | null;
  notes: string | null;
  text_response: string | null;
}

export interface GetByTokenResult {
  success: true;
  journey: PublicJourneyInfo;
  documents: PublicDocumentInfo[];
}

export interface SubmitDocFile {
  doc_id: string;
  file: File;
}

export interface SubmitDocText {
  doc_id: string;
  text: string;
}

export interface SubmitResult {
  success: boolean;
  uploaded: number;
  errors: { doc_id: string; error: string }[];
  allRequiredReady: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;

export async function getAdmissionByToken(
  token: string,
): Promise<GetByTokenResult> {
  const { data, error } = await supabase.functions.invoke<GetByTokenResult>(
    "admission-public-get",
    { body: { token } },
  );
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string; expired?: boolean; finalStatus?: string }> } }).context;
    if (ctx?.json) {
      try {
        const body = await ctx.json();
        if (body?.error) {
          const parts: string[] = [body.error];
          if (body.expired) parts.push("expired");
          if (body.finalStatus) parts.push("status:" + body.finalStatus);
          msg = parts.join(" ");
        }
      } catch {
        // ignore
      }
    }
    throw new Error(msg);
  }
  if (!data || !data.success) throw new Error("Resposta inválida");
  return data;
}

export async function submitAdmissionDocs(input: {
  token: string;
  candidate_data?: CandidateDataInput;
  documents: SubmitDocFile[];
  text_responses?: SubmitDocText[];
}): Promise<SubmitResult> {
  // Valida tamanhos antes de mandar
  for (const d of input.documents) {
    if (d.file.size > MAX_BYTES) {
      throw new Error(
        `O arquivo ${d.file.name} passou de 10MB. Reduz e tenta de novo?`,
      );
    }
  }

  // Converte cada file pra base64
  const docsPayload = await Promise.all(
    input.documents.map(async (d) => ({
      doc_id: d.doc_id,
      base64: await fileToBase64(d.file),
      filename: d.file.name,
      mime_type: d.file.type,
    })),
  );

  const { data, error } = await supabase.functions.invoke<SubmitResult>(
    "admission-public-submit",
    {
      body: {
        token: input.token,
        candidate_data: input.candidate_data,
        documents: docsPayload,
        text_responses: input.text_responses ?? [],
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
  if (!data) throw new Error("Resposta vazia");
  return data;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
