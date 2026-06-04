import { z } from "zod";

export const objetivoSchema = z.object({
  tipo: z.string().min(1, "Escolha o tipo."),
  comentario: z.string().max(2000, "Comentário muito longo.").optional(),
  mostrarSuporte: z.boolean(),
});

export type ObjetivoFormValues = z.infer<typeof objetivoSchema>;
