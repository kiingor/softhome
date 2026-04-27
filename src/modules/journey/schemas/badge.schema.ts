import { z } from "zod";

export const badgeCategorySchema = z.enum([
  "tecnico",
  "comportamental",
  "lideranca",
  "cultura",
  "integracao",
  "outro",
]);

export const badgeFormSchema = z.object({
  name: z
    .string()
    .min(2, "Nome muito curto, dá pra melhorar?")
    .max(80, "Nome longo demais, encurta um pouco?"),
  description: z
    .string()
    .max(500, "Descrição passou de 500 caracteres.")
    .optional()
    .or(z.literal("")),
  category: badgeCategorySchema,
  weight: z
    .number()
    .int()
    .min(1, "Peso mínimo é 1.")
    .max(10, "Peso máximo é 10."),
  icon: z.string().max(40).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type BadgeFormValues = z.infer<typeof badgeFormSchema>;

export const badgeAssignmentSchema = z.object({
  collaborator_id: z.string().uuid("Selecione um colaborador."),
  badge_id: z.string().uuid("Selecione uma insígnia."),
  awarded_at: z.string().min(1, "Quando foi conquistada?"),
  evidence: z
    .string()
    .max(2000, "Evidência longa demais.")
    .optional()
    .or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type BadgeAssignmentValues = z.infer<typeof badgeAssignmentSchema>;
