import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  BonusEntry,
  BonusEntryMode,
  BonusEntryWithCollaborator,
} from "../lib/bonus-types";

export function useBonusEntries(periodId: string | null) {
  return useQuery({
    queryKey: ["bonus-entries", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bonus_entries")
        .select(
          `
          *,
          collaborator:collaborators (
            id, name, cpf, email, position, admission_date, status
          )
          `,
        )
        .eq("period_id", periodId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BonusEntryWithCollaborator[];
    },
  });
}

export function useUpdateEntryMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entryId: string;
      mode: BonusEntryMode;
      notes?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("bonus_entries")
        .update({
          mode: input.mode,
          mode_set_by: user?.id ?? null,
          mode_set_at: new Date().toISOString(),
          mode_notes: input.notes ?? null,
        })
        .eq("id", input.entryId);
      if (error) throw error;
    },
    onSuccess: (_data, { entryId }) => {
      // Invalida tudo que depende de entries
      qc.invalidateQueries({ queryKey: ["bonus-entries"] });
      qc.invalidateQueries({ queryKey: ["bonus-entry", entryId] });
    },
  });
}

export function useUpdateEntryGrossValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entryId: string; grossValue: number }) => {
      const { error } = await supabase
        .from("bonus_entries")
        .update({ gross_value: input.grossValue })
        .eq("id", input.entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-entries"] });
    },
  });
}

/** Helper: pegar uma entry por id. */
export function useBonusEntry(id: string | null) {
  return useQuery({
    queryKey: ["bonus-entry", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bonus_entries")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as BonusEntry;
    },
  });
}
