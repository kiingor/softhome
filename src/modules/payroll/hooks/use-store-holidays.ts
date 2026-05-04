import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HolidayType = "national" | "state" | "municipal" | "manual";

export interface StoreHoliday {
  id: string;
  store_id: string;
  company_id: string;
  date: string;          // YYYY-MM-DD
  name: string;
  type: HolidayType;
  source: string | null;
}

interface UseStoreHolidaysResult {
  holidays: StoreHoliday[];
  /** ISO dates (YYYY-MM-DD) — pronto pra passar pra workingDays */
  holidayDates: string[];
  /** Lookup rápido por data */
  holidayMap: Record<string, StoreHoliday>;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Carrega os feriados de uma store/empresa pra um ano específico.
 * Retorna lista crua + array de ISO dates pronto pra `calculateMonthlyBenefitValue`.
 *
 * Aceita storeId nullable — quando vazio retorna estrutura vazia (sem
 * disparar query). Útil pra colaborador sem store_id ainda.
 */
export function useStoreHolidays(
  storeId: string | null | undefined,
  year: number,
): UseStoreHolidaysResult {
  const enabled = !!storeId;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["store-holidays", storeId, year],
    queryFn: async (): Promise<StoreHoliday[]> => {
      if (!storeId) return [];
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("store_holidays")
        .select("id, store_id, company_id, date, name, type, source")
        .eq("store_id", storeId)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StoreHoliday[];
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  });

  return useMemo(() => {
    const holidays = data ?? [];
    const holidayDates = holidays.map((h) => h.date);
    const holidayMap = holidays.reduce<Record<string, StoreHoliday>>((acc, h) => {
      acc[h.date] = h;
      return acc;
    }, {});
    return { holidays, holidayDates, holidayMap, isLoading, refetch };
  }, [data, isLoading, refetch]);
}
