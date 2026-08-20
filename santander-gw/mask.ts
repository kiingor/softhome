// Mascaramento de PII e logger estruturado do santander-gw.
//
// POR QUE ESTE ARQUIVO EXISTE
// O CLAUDE.md proíbe logar dado pessoal em texto plano, e este serviço é o
// único lugar do sistema onde CPF, nome e chave PIX passam JUNTOS do valor a
// pagar. O `docker logs` de um container fica em disco, vai pro backup e é lido
// por quem estiver de plantão — é o vazamento mais fácil de cometer e o mais
// difícil de desfazer.
//
// A regra prática: `idempotency_key` e `provider_payment_id` podem ir a log à
// vontade (são identificadores NOSSOS, não identificam pessoa fora do sistema e
// são exatamente o que se precisa pra investigar um pagamento). Documento e
// chave PIX, nunca — só mascarados, e mascarados de um jeito que ainda permita
// CONFERIR ("é a chave terminada em 4?") sem REVELAR.

/** Só os dígitos. Documento chega com máscara ou sem, e o log tem que ser igual nos dois casos. */
function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * CPF/CNPJ mascarado: mantém os 3 primeiros e os 2 últimos dígitos.
 *
 * Mesma forma que o próprio Santander devolve no `beneficiary.documentNumber`
 * ("549*******4") — conferir contra a resposta do banco continua possível.
 */
export function maskDoc(doc?: string | null): string {
  const digits = onlyDigits(String(doc ?? ""));
  if (!digits) return "—";
  // Documento curto demais pra mascarar sem virar adivinhação: esconde tudo.
  if (digits.length <= 5) return "*".repeat(digits.length);
  return `${digits.slice(0, 3)}${"*".repeat(digits.length - 5)}${digits.slice(-2)}`;
}

/**
 * Chave PIX mascarada por tipo. O formato varia demais pra um mascarador só:
 * e-mail sem domínio é inútil pra conferir, e telefone sem os últimos dígitos
 * também. Cada tipo mantém a parte que serve pra CONFERIR e esconde o resto.
 *
 * `type` é o nosso enum minúsculo (public.pix_key_type). Aceita maiúsculo
 * também porque o dictCodeType do Santander volta assim.
 */
export function maskPixKey(key?: string | null, type?: string | null): string {
  const raw = String(key ?? "").trim();
  if (!raw) return "—";
  const kind = String(type ?? "").trim().toLowerCase();

  if (kind === "cpf" || kind === "cnpj") return maskDoc(raw);

  if (kind === "email" || (!kind && raw.includes("@"))) {
    const at = raw.lastIndexOf("@");
    if (at <= 0) return "***";
    // Domínio inteiro fica visível de propósito: ele não identifica ninguém
    // sozinho e é o que denuncia chave digitada errada (gmail vs. gmial).
    return `${raw[0]}***${raw.slice(at)}`;
  }

  if (kind === "phone") {
    const digits = onlyDigits(raw);
    if (digits.length <= 4) return "*".repeat(digits.length);
    return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
  }

  // EVP (uuid aleatório) e qualquer tipo que apareça no futuro: pontas visíveis.
  if (raw.length <= 8) return `${raw.slice(0, 2)}***`;
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

/** Nome de pessoa: primeiro nome + iniciais. Some do log completo, sobra o suficiente pra reconhecer. */
export function maskName(name?: string | null): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const [first, ...rest] = parts;
  return [first, ...rest.map((p) => `${p[0].toUpperCase()}.`)].join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger estruturado
//
// Escreve JSON por linha direto no stdout (que é o transporte de log do
// container). Não usa console.log de propósito — o CLAUDE.md proíbe, e escrever
// no Deno.stdout deixa explícito que a saída é UMA LINHA JSON, não texto solto
// que alguém depois tenta parsear com regex.
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error";

const encoder = new TextEncoder();

export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    svc: "santander-gw",
    event,
    ...fields,
  });
  try {
    Deno.stdout.writeSync(encoder.encode(line + "\n"));
  } catch {
    // stdout fechado (container morrendo, pipe quebrado). Log não pode derrubar
    // pagamento: engole e segue.
  }
}
