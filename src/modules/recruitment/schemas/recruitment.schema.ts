import { z } from "zod";
import { validateCPF } from "@/lib/validators";

// ─────────────────────────────────────────────────────────────────────────────
// Schema: criar/editar vaga (job_opening)
// ─────────────────────────────────────────────────────────────────────────────

export const jobOpeningSchema = z.object({
  title: z
    .string()
    .min(3, "Título muito curto.")
    .max(120, "Título muito longo."),
  description: z
    .string()
    .max(5000, "Descrição passou de 5000 caracteres.")
    .optional()
    .or(z.literal("")),
  requirements: z
    .string()
    .max(5000, "Requisitos muito longos.")
    .optional()
    .or(z.literal("")),
  regime: z.enum(["clt", "pj", "estagiario"]),
  status: z.enum(["draft", "open", "paused", "filled", "cancelled"]).default("draft"),
  position_id: z.string().uuid().optional().or(z.literal("")),
  team_id: z.string().uuid().optional().or(z.literal("")),
  hiring_manager_id: z.string().uuid().optional().or(z.literal("")),
  vacancies_count: z
    .number()
    .int()
    .min(1, "Pelo menos 1 vaga.")
    .max(100)
    .default(1),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type JobOpeningValues = z.infer<typeof jobOpeningSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: candidato manualmente cadastrado pelo RH (sessão atual)
// O form público de candidatura virá em sessão futura — esse é o cadastro
// rápido que o RH faz quando recebe CV por email/whatsapp.
// ─────────────────────────────────────────────────────────────────────────────

export const candidateManualSchema = z.object({
  name: z.string().min(3).max(120),
  email: z.string().email("Esse email não tá batendo."),
  phone: z.string().max(20).optional().or(z.literal("")),
  cpf: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || validateCPF(v),
      "Esse CPF tá com algo errado, confere aí?"
    ),
  linkedin_url: z
    .string()
    .url("Link inválido.")
    .optional()
    .or(z.literal("")),
  source: z.string().max(60).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CandidateManualValues = z.infer<typeof candidateManualSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: form público de candidatura (sessão futura — pre-fab aqui)
// Decisão Q3 (banco de talentos opt-out): adiciona checkbox de consentimento
// pra ficar no banco de talentos.
// Decisão Q4 (chave recorrência email+CPF): CPF obrigatório.
// Decisão Q6 (CV obrigatório): cv_file required.
// ─────────────────────────────────────────────────────────────────────────────

export const candidatePublicApplicationSchema = z.object({
  name: z.string().min(3).max(120),
  email: z.string().email(),
  phone: z.string().min(8).max(20),
  cpf: z
    .string()
    .min(11, "CPF é obrigatório.")
    .refine(validateCPF, "Esse CPF tá com algo errado, confere aí?"),
  linkedin_url: z.string().url().optional().or(z.literal("")),
  cover_letter: z.string().max(2000).optional().or(z.literal("")),
  // CV file será validado fora do zod (File API)
  consent_talent_pool: z.boolean().refine((v) => v === true, {
    message:
      "Marque pra ficar no banco de talentos. Sem isso a gente não consegue te avisar de futuras vagas.",
  }),
  consent_lgpd: z.boolean().refine((v) => v === true, {
    message: "Marca aí pra confirmar que tá ok com o tratamento dos seus dados.",
  }),
});

export type CandidatePublicApplicationValues = z.infer<
  typeof candidatePublicApplicationSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: agendar entrevista (decisão Q5: sem GCal v1, só armazena)
// ─────────────────────────────────────────────────────────────────────────────

export const scheduleInterviewSchema = z.object({
  scheduled_for: z.string().min(1, "Quando vai ser?"),
  duration_minutes: z.number().int().min(15).max(480).default(60),
  location: z
    .string()
    .max(500)
    .optional()
    .or(z.literal("")),
  interviewer_id: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type ScheduleInterviewValues = z.infer<typeof scheduleInterviewSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: feedback estruturado pós-entrevista
// ─────────────────────────────────────────────────────────────────────────────

export const interviewFeedbackSchema = z.object({
  recommendation: z.enum(["hire", "no_hire", "maybe", "next_round"]),
  notes: z.string().max(3000).optional().or(z.literal("")),
  scores: z
    .object({
      tecnico: z.number().int().min(1).max(5).optional(),
      comportamental: z.number().int().min(1).max(5).optional(),
      fit: z.number().int().min(1).max(5).optional(),
    })
    .optional(),
});

export type InterviewFeedbackValues = z.infer<typeof interviewFeedbackSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: rejeitar aplicação com motivo
// ─────────────────────────────────────────────────────────────────────────────

export const rejectApplicationSchema = z.object({
  rejected_reason: z.string().min(3).max(500),
});

export type RejectApplicationValues = z.infer<typeof rejectApplicationSchema>;
