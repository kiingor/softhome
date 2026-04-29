import { z } from "zod";
import { validateCPF, validateCNPJ } from "@/lib/validators";

// ─────────────────────────────────────────────────────────────────────────────
// Schema: criar nova admission_journey
// Campos mínimos pro RH abrir o processo. Position e CNPJ podem vir depois.
// ─────────────────────────────────────────────────────────────────────────────

export const newAdmissionSchema = z.object({
  candidate_name: z
    .string()
    .min(3, "Nome muito curto.")
    .max(120, "Nome muito longo."),
  candidate_email: z
    .string()
    .email("Esse email não tá batendo, dá uma conferida?"),
  candidate_phone: z
    .string()
    .max(20)
    .optional()
    .or(z.literal("")),
  candidate_cpf: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || validateCPF(v),
      "Esse CPF tá com algo errado, confere aí?"
    ),
  regime: z.enum(["clt", "pj", "estagiario"]),
  position_id: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type NewAdmissionValues = z.infer<typeof newAdmissionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: rejeitar/pedir ajuste em um doc
// ─────────────────────────────────────────────────────────────────────────────

export const rejectDocumentSchema = z.object({
  rejection_reason: z
    .string()
    .min(5, "Conta um pouco mais por que precisa ajustar?")
    .max(500),
});

export type RejectDocumentValues = z.infer<typeof rejectDocumentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: nota livre na timeline
// ─────────────────────────────────────────────────────────────────────────────

export const journeyNoteSchema = z.object({
  message: z.string().min(1).max(1000),
});

export type JourneyNoteValues = z.infer<typeof journeyNoteSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: form público que candidato preenche (Sessão futura 1)
// Mantenho aqui pra evitar arquivo separado quando for implementar.
// Inclui validação CPF/CNPJ.
// ─────────────────────────────────────────────────────────────────────────────

export const candidatePublicFormSchema = z.object({
  candidate_name: z.string().min(3).max(120),
  candidate_email: z.string().email(),
  candidate_phone: z.string().min(8).max(20),
  candidate_cpf: z
    .string()
    .min(11)
    .refine(validateCPF, "Esse CPF tá com algo errado, confere aí?"),
  candidate_birth_date: z.string().min(1, "Quando você nasceu?"),
  candidate_address: z.string().min(5).max(300),
  // Para PJ
  candidate_cnpj: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || validateCNPJ(v),
      "Esse CNPJ tá com algo errado, confere aí?"
    ),
});

export type CandidatePublicFormValues = z.infer<typeof candidatePublicFormSchema>;
