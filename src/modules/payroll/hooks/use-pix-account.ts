import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Saldo e extrato da conta pagadora, via edge payroll-pix-account (que fala com
// o santander-gw). É só leitura: nenhum destes caminhos move dinheiro.
// company_id serve só pro gate de permissão no servidor — a conta lida é a
// configurada no gateway.
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountBalance {
  available: string | null;
  blocked: string | null;
  invested: string | null;
  currency: string | null;
  branch: string | null;
  account: string | null;
}

export interface StatementEntry {
  transactionId: string | null;
  date: string | null;
  type: string | null;
  creditDebit: string | null;
  name: string | null;
  amount: string | null;
  currency: string | null;
  partyDocument: string | null;
}

function unwrap<T>(error: unknown, data: unknown): T {
  const corpo = data as { error?: unknown; message?: unknown } | null;
  const frase =
    corpo && typeof corpo === "object"
      ? (corpo.message ? String(corpo.message) : null) ??
        (corpo.error ? String(corpo.error) : null)
      : null;
  if (error) throw new Error(frase ?? (error as Error).message ?? "Falha na chamada");
  if (corpo && typeof corpo === "object" && "error" in corpo) {
    throw new Error(frase ?? "Falha na chamada");
  }
  return data as T;
}

/** Saldo da conta. Só busca quando `enabled` (o card só consulta quando aberto —
 *  toda chamada bate no banco de verdade, então não fica em polling). */
export function useAccountBalance(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["pix-account-balance", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("payroll-pix-account", {
        body: { action: "balance", company_id: companyId },
      });
      return unwrap<AccountBalance>(error, data);
    },
    enabled: !!companyId && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Extrato por intervalo, sob demanda (mutation em vez de query: o intervalo é
 *  escolhido na hora e não deve refetchar sozinho). */
export function useAccountStatement(companyId: string | undefined) {
  return useMutation({
    mutationFn: async (range: { from: string; to: string }) => {
      const { data, error } = await supabase.functions.invoke("payroll-pix-account", {
        body: {
          action: "statement",
          company_id: companyId,
          initial_date: range.from,
          final_date: range.to,
        },
      });
      return unwrap<{ entries: StatementEntry[]; hasMore: boolean }>(error, data);
    },
  });
}
