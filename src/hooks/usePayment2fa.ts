// Hook do segundo fator de PAGAMENTO — lado do cadastro do aparelho.
//
// O que existe aqui:
//   • usePayment2faDevice()      → o aparelho do próprio usuário (leitura RLS)
//   • usePayment2faEnrollStart() → manda o código pelo WhatsApp da empresa
//   • usePayment2faEnrollConfirm() → prova a posse e ativa o aparelho
//
// REGRA DE EXIBIÇÃO (vale pra qualquer consumidor deste hook): daqui só sai
// `phone_last4`. O telefone completo mora em payment_2fa_devices e é PII —
// nem a query pede a coluna `phone`, pra que um `console.log(device)` de
// depuração não vaze o número inteiro sem querer.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";

// `payment_2fa_devices` nasceu na migration 20260818120300, mais nova que o
// último `npx supabase gen types` — o `Database` gerado ainda não conhece a
// tabela. Um client sem schema tipado evita espalhar `as never` por cada
// .select()/.eq() da query. Quando os tipos forem regerados, troca por
// `supabase` direto e apaga esta linha.
const db = supabase as unknown as SupabaseClient;

/** Tentativas por desafio — espelha `max_attempts` default da tabela. */
export const PAYMENT_2FA_MAX_ATTEMPTS = 3;

/** Segundos até liberar o botão de reenviar. Freio de UI, não de segurança. */
export const PAYMENT_2FA_RESEND_SECONDS = 60;

export interface Payment2faDevice {
  id: string;
  company_id: string;
  /** Só o final do número. O completo nunca sai do banco pra cá. */
  phone_last4: string | null;
  status: "pending" | "active" | "revoked";
  verified_at: string | null;
  /** Quando o aparelho passa a valer. Numa troca, fica 60 min à frente. */
  active_from: string | null;
  /** Trava temporária por erro repetido de código. */
  locked_until: string | null;
  created_at: string;
}

export interface EnrollStartResult {
  challenge_id: string;
  last4: string;
  expires_at: string;
}

export interface EnrollConfirmResult {
  status: "active";
  last4: string;
  active_from: string;
  replaced: boolean;
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Erros
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Erro de negócio das functions de 2FA, já com o CÓDIGO preservado.
 *
 * O código importa: a UI reage de formas diferentes a WHATSAPP_UNAVAILABLE
 * (avisar o admin) e a INVALID_CODE (gastar tentativa). Se só sobrasse a
 * mensagem, a tela teria que fazer match de string — que quebra no dia em que
 * alguém melhorar o texto na edge function.
 */
export class Payment2faError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "Payment2faError";
    this.code = code;
    this.status = status;
  }
}

/** Fallback por status HTTP pra quando nem o corpo do erro veio legível. */
const STATUS_FALLBACK: Record<number, { code: string; message: string }> = {
  401: {
    code: "INVALID_PASSWORD",
    message: "Senha incorreta. Confere e tenta de novo.",
  },
  403: {
    code: "FORBIDDEN",
    message: "Você não tem permissão de pagamento nessa empresa.",
  },
  409: {
    code: "PHONE_IN_USE",
    message: "Esse número já está cadastrado.",
  },
  429: {
    code: "TOO_MANY_REQUESTS",
    message: "Muitos códigos pedidos. Espera uns minutos e tenta de novo.",
  },
  502: {
    code: "WHATSAPP_SEND_FAILED",
    message: "Não conseguimos mandar o código agora. Tenta de novo em instantes.",
  },
  503: {
    code: "WHATSAPP_UNAVAILABLE",
    message: "O WhatsApp da empresa está fora do ar. Fala com o admin e tenta em seguida.",
  },
};

const GENERIC_FAILURE = {
  code: "UNKNOWN",
  message: "Algo não foi bem aqui. Tenta de novo?",
};

/**
 * Extrai `{ error, message }` do corpo de uma resposta non-2xx.
 *
 * POR QUE ISSO É NECESSÁRIO: o supabase-js MASCARA o corpo quando o status não
 * é 2xx — `data` volta null e `error.message` vira um genérico
 * ("Edge Function returned a non-2xx status code"). Todo o vocabulário de erro
 * das functions (WHATSAPP_UNAVAILABLE, PHONE_IN_USE, INVALID_CODE...) fica
 * escondido dentro de `error.context`, que é a Response crua. Sem abrir esse
 * corpo, "senha errada" e "WhatsApp fora do ar" chegariam na tela com o mesmo
 * texto inútil.
 */
async function readErrorBody(
  error: unknown,
): Promise<{ code: string; message: string; status?: number }> {
  const context = (error as { context?: unknown })?.context;
  const status = context instanceof Response ? context.status : undefined;

  if (context instanceof Response) {
    try {
      // clone() porque a Response pode ser lida de novo por outro caminho —
      // consumir o corpo original transformaria um erro em outro erro.
      const body = await context.clone().json();
      if (body && typeof body === "object" && "error" in body) {
        const payload = body as { error: string; message?: string; details?: string };
        return {
          code: payload.error,
          message: payload.message ?? payload.details ?? payload.error,
          status,
        };
      }
    } catch {
      // Corpo não-JSON ou já consumido: cai no fallback por status.
    }
  }

  const fallback = (status && STATUS_FALLBACK[status]) || GENERIC_FAILURE;
  return { ...fallback, status };
}

/**
 * Invoca uma edge function tratando erro nas DUAS camadas — mesmo padrão de
 * useCoreResourceMutation:65-75.
 *
 *   Camada 1: `error` do invoke (status non-2xx, rede caiu, CORS).
 *   Camada 2: `"error" in data`, pro caso da function responder 200 com um
 *             payload de falha. Checar só a camada 1 deixaria esse caso passar
 *             como sucesso e a tela comemoraria um cadastro que não aconteceu.
 */
async function invoke2fa<T>(fnName: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fnName, { body });

  if (error) {
    const parsed = await readErrorBody(error);
    throw new Payment2faError(parsed.code, parsed.message, parsed.status);
  }

  if (data && typeof data === "object" && "error" in data) {
    const payload = data as { error: string; message?: string; details?: string };
    throw new Payment2faError(
      payload.error,
      payload.message ?? payload.details ?? payload.error,
    );
  }

  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query — o aparelho do próprio usuário
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lê o dispositivo do usuário logado pela policy "user reads own 2fa device".
 *
 * A chave da query é só o user_id, sem empresa, porque o aparelho É POR PESSOA
 * e global (uq_payment_2fa_devices_active_per_user): trocar de CNPJ no seletor
 * não muda o celular cadastrado, e cachear por empresa faria a mesma linha ser
 * buscada de novo à toa.
 */
export function usePayment2faDevice() {
  const { user } = useDashboard();

  return useQuery({
    queryKey: ["payment-2fa-device", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Payment2faDevice | null> => {
      const { data, error } = await db
        .from("payment_2fa_devices")
        // Sem a coluna `phone`: o número completo não precisa chegar no browser.
        .select(
          "id, company_id, phone_last4, status, verified_at, active_from, locked_until, created_at",
        )
        .eq("user_id", user!.id)
        // 'revoked' fica de fora: é histórico. Se um dia a pessoa tiver um
        // aparelho ativo e vários revogados, mostrar o revogado confundiria.
        .in("status", ["pending", "active"])
        // 'active' antes de 'pending' na ordem alfabética — e é justamente o
        // que a gente quer priorizar quando existirem os dois (o pending é um
        // cadastro em andamento, o active é o que vale hoje).
        .order("status", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      const rows = (data ?? []) as unknown as Payment2faDevice[];
      return rows[0] ?? null;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado derivado — uma fonte só pra tela e pro futuro gate de pagamento
// ─────────────────────────────────────────────────────────────────────────────

export type Payment2faState =
  /** Nunca cadastrou. */
  | "none"
  /** Código enviado, cadastro não concluído. */
  | "pending"
  /** Travado por erro repetido de código (locked_until no futuro). */
  | "locked"
  /** Ativo, mas ainda na janela anti-SIM-swap (active_from no futuro). */
  | "waiting"
  /** Ativo e valendo agora. */
  | "active";

/**
 * Traduz a linha do banco no estado que a UI entende.
 *
 * A ordem das checagens é a ordem de gravidade: um aparelho travado E dentro
 * da janela de espera precisa mostrar a TRAVA primeiro — é o que impede o
 * pagamento agora e o que exige ação (ou paciência) da pessoa.
 */
export function derivePayment2faState(
  device: Payment2faDevice | null | undefined,
  now: number = Date.now(),
): Payment2faState {
  if (!device) return "none";
  if (device.status === "pending") return "pending";
  if (device.locked_until && new Date(device.locked_until).getTime() > now) {
    return "locked";
  }
  if (device.active_from && new Date(device.active_from).getTime() > now) {
    return "waiting";
  }
  return "active";
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Passo 1: dispara o código pro celular informado.
 *
 * A senha vai junto porque a edge function REAUTENTICA — cadastrar/trocar o
 * celular é a operação que derruba o 2FA, então sessão válida não basta. Ela
 * não é guardada em lugar nenhum aqui: entra no body e morre com a chamada.
 */
export function usePayment2faEnrollStart() {
  const { currentCompany } = useDashboard();

  return useMutation<EnrollStartResult, Payment2faError, { phone: string; password: string }>({
    mutationFn: async ({ phone, password }) => {
      if (!currentCompany?.id) {
        throw new Payment2faError(
          "NO_COMPANY",
          "Escolhe uma empresa antes de cadastrar o celular.",
        );
      }
      return invoke2fa<EnrollStartResult>("payment-2fa-enroll-start", {
        company_id: currentCompany.id,
        phone,
        password,
      });
    },
  });
}

/**
 * Passo 2: confirma o código e ativa o aparelho.
 *
 * Invalida a query do dispositivo no sucesso pra que o card de Segurança já
 * apareça com o estado novo (ativo, ou "em janela de espera" numa troca).
 */
export function usePayment2faEnrollConfirm() {
  const queryClient = useQueryClient();
  const { user } = useDashboard();

  return useMutation<EnrollConfirmResult, Payment2faError, { challengeId: string; code: string }>({
    mutationFn: async ({ challengeId, code }) =>
      invoke2fa<EnrollConfirmResult>("payment-2fa-enroll-confirm", {
        challenge_id: challengeId,
        // Só dígitos: a function limpa de novo, mas mandar sujeira daqui só
        // gastaria uma das 3 tentativas por causa de um espaço colado.
        code: code.replace(/\D/g, ""),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-2fa-device", user?.id] });
    },
  });
}
