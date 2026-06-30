import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getValidationItems,
  getValidationLogs,
  listValidations,
  resolveItem,
  resolveItemsBulk,
  runValidation,
  type RunValidationResult,
} from "../services/validation/payroll-validation.service";

const KEYS = {
  list: (companyId?: string, month?: string) => ["payroll-validations", companyId, month] as const,
  items: (validationId?: string) => ["payroll-validation-items", validationId] as const,
  logs: (validationId?: string) => ["payroll-validation-logs", validationId] as const,
};

export function usePayrollValidations(companyId?: string, referenceMonth?: string) {
  return useQuery({
    queryKey: KEYS.list(companyId, referenceMonth),
    queryFn: () => listValidations(companyId!, referenceMonth!),
    enabled: !!companyId && !!referenceMonth,
  });
}

export function usePayrollValidationItems(validationId?: string) {
  return useQuery({
    queryKey: KEYS.items(validationId),
    queryFn: () => getValidationItems(validationId!),
    enabled: !!validationId,
  });
}

export function usePayrollValidationLogs(validationId?: string) {
  return useQuery({
    queryKey: KEYS.logs(validationId),
    queryFn: () => getValidationLogs(validationId!),
    enabled: !!validationId,
  });
}

/** Mapa uid → nome pra exibir quem agiu no log. */
export function useProfilesMap() {
  return useQuery({
    queryKey: ["profiles-name-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) m.set(p.id, p.full_name ?? "Usuário");
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRunValidation(companyId?: string, referenceMonth?: string) {
  const qc = useQueryClient();
  return useMutation<RunValidationResult, Error, File[]>({
    mutationFn: (files) => runValidation({ companyId: companyId!, referenceMonth: referenceMonth!, files }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list(companyId, referenceMonth) });
    },
  });
}

export function useResolveValidationItem(validationId: string, companyId?: string, referenceMonth?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEYS.items(validationId) });
    qc.invalidateQueries({ queryKey: KEYS.logs(validationId) });
    qc.invalidateQueries({ queryKey: KEYS.list(companyId, referenceMonth) });
  };
  const single = useMutation({
    mutationFn: ({ itemId, status, notes }: { itemId: string; status: string; notes: string }) =>
      resolveItem(itemId, status, notes),
    onSuccess: invalidate,
  });
  const bulk = useMutation({
    mutationFn: ({ itemIds, status, notes }: { itemIds: string[]; status: string; notes: string }) =>
      resolveItemsBulk(itemIds, status, notes),
    onSuccess: invalidate,
  });
  return { single, bulk };
}
