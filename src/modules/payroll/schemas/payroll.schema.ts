import { z } from "zod";
import { ACTIVE_ENTRY_TYPES } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Schema: abrir período (RH clica "Abrir mês X" — decisão Q3 manual)
// ─────────────────────────────────────────────────────────────────────────────

export const openPeriodSchema = z.object({
  reference_month: z
    .string()
    .min(1, "Escolhe o mês.")
    .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "Formato inválido."),
  notes: z.string().max(1000).optional().or(z.literal("")),
  auto_populate: z.boolean().default(true),
});

export type OpenPeriodValues = z.infer<typeof openPeriodSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: novo lançamento manual num período aberto
// ─────────────────────────────────────────────────────────────────────────────

export const newEntrySchema = z.object({
  collaborator_id: z.string().uuid("Selecione um colaborador."),
  type: z.enum(ACTIVE_ENTRY_TYPES, {
    errorMap: () => ({ message: "Tipo inválido." }),
  }),
  description: z.string().max(500).optional().or(z.literal("")),
  value: z
    .number({ invalid_type_error: "Valor é obrigatório." })
    .positive("Valor precisa ser positivo. Pra desconto/falta use o tipo apropriado."),
  is_fixed: z.boolean().default(false),
});

export type NewEntryValues = z.infer<typeof newEntrySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: estornar lançamento (cria entrada negativa, não deleta)
// Decisão arquitetural: lançamentos aprovados nunca são deletados,
// só estornados via novo lançamento contrário com referência ao original.
// ─────────────────────────────────────────────────────────────────────────────

export const reverseEntrySchema = z.object({
  reason: z
    .string()
    .min(5, "Conta um pouco mais o motivo do estorno.")
    .max(500),
});

export type ReverseEntryValues = z.infer<typeof reverseEntrySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema: fechamento de período
// ─────────────────────────────────────────────────────────────────────────────

export const closePeriodSchema = z.object({
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type ClosePeriodValues = z.infer<typeof closePeriodSchema>;
