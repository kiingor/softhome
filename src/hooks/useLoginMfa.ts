// ─────────────────────────────────────────────────────────────────────────────
// MFA de login (2º fator dos papéis admin_gc/diretoria).
//
// Usa o MFA NATIVO do GoTrue (fator telefone): verificar o fator eleva o JWT a
// AAL2, e a RLS exige AAL2 nos dados sensíveis. A entrega do código sai pela
// Evolution (Send-SMS hook `mfa-send-whatsapp`) — aqui só falamos com o
// supabase.auth.mfa; quem escolhe o canal é o servidor.
//
// Este hook NÃO guarda telefone nem código: o número vive no GoTrue (mascarado
// pra tela) e o código só existe no WhatsApp do dono do aparelho.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MfaPhoneFactor {
  id: string;
  status: "verified" | "unverified";
  phoneLast4: string | null;
  friendlyName: string | null;
}

export interface MfaGate {
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  verifiedPhone: MfaPhoneFactor | null;
  /** Tem fator verificado mas a sessão ainda é aal1 → precisa do 2º fator agora. */
  needsStepUp: boolean;
  hasVerifiedFactor: boolean;
}

function last4(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
}

/** Lê o estado do 2º fator: nível atual da sessão + fator de telefone. */
export async function fetchMfaGate(): Promise<MfaGate> {
  const [{ data: aal, error: aalErr }, { data: factors, error: facErr }] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
  if (aalErr) throw aalErr;
  if (facErr) throw facErr;

  const phoneFactors = (factors?.phone ?? []) as Array<{
    id: string;
    status: string;
    phone?: string | null;
    friendly_name?: string | null;
  }>;
  const verified = phoneFactors.find((f) => f.status === "verified") ?? null;
  const verifiedPhone: MfaPhoneFactor | null = verified
    ? {
        id: verified.id,
        status: "verified",
        phoneLast4: last4(verified.phone),
        friendlyName: verified.friendly_name ?? null,
      }
    : null;

  const currentLevel = (aal?.currentLevel ?? null) as MfaGate["currentLevel"];
  const nextLevel = (aal?.nextLevel ?? null) as MfaGate["nextLevel"];

  return {
    currentLevel,
    nextLevel,
    verifiedPhone,
    hasVerifiedFactor: !!verifiedPhone,
    needsStepUp: nextLevel === "aal2" && currentLevel !== "aal2",
  };
}

export function useMfaGate(enabled = true) {
  return useQuery({
    queryKey: ["mfa-gate"],
    queryFn: fetchMfaGate,
    enabled,
    // Curto: logo após um login o estado precisa refletir a realidade sem
    // depender de refetch manual; a UI invalida explicitamente no verify.
    staleTime: 15_000,
    retry: 1,
  });
}

export function useInvalidateMfaGate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["mfa-gate"] });
}

// ── Operações cruas do supabase.auth.mfa ─────────────────────────────────────

/** E.164 brasileiro a partir dos dígitos digitados (DDD + número). */
function toE164BR(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.startsWith("55") ? `+${d}` : `+55${d}`;
}

export interface EnrollStarted {
  factorId: string;
  challengeId: string;
  phoneLast4: string;
}

/** Passo 1 do cadastro: cria o fator telefone e dispara o código no WhatsApp. */
export async function enrollPhoneStart(digits: string): Promise<EnrollStarted> {
  const phone = toE164BR(digits);
  const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
    factorType: "phone",
    phone,
  });
  if (enrollErr || !enrolled) throw enrollErr ?? new Error("Falha ao iniciar cadastro do 2º fator.");

  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
    factorId: enrolled.id,
  });
  if (chErr || !ch) throw chErr ?? new Error("Não deu pra enviar o código.");

  return {
    factorId: enrolled.id,
    challengeId: ch.id,
    phoneLast4: last4(phone) ?? "••••",
  };
}

/** Reenvio: novo desafio pro mesmo fator (novo código). */
export async function challengeFactor(factorId: string): Promise<string> {
  const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error || !ch) throw error ?? new Error("Não deu pra enviar o código.");
  return ch.id;
}

/** Confirma o código: verifica o fator (enroll) OU eleva a sessão a AAL2 (step-up). */
export async function verifyFactor(
  factorId: string,
  challengeId: string,
  code: string,
): Promise<void> {
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
  if (error) throw error;
}

/** Remove um fator (exige AAL2 no GoTrue quando o fator é verificado). */
export async function unenrollFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
