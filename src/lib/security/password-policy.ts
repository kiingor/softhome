/**
 * Regra de senha do DNA Softcom.
 *
 * O piso vinha de 6 caracteres (default antigo do Supabase) em 6 telas
 * diferentes, cada uma com o seu próprio literal. Aqui fica a fonte única.
 *
 * Isto é validação de UI — serve pra dar mensagem decente antes do request. A
 * regra que vale de verdade é a do painel do Supabase (Authentication →
 * Policies): comprimento mínimo + "Leaked password protection", que checa a
 * senha contra o HaveIBeenPwned. Essa alcança todos os caminhos, inclusive os
 * que não passam por tela nossa. Mantenha os dois números iguais.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_HINT = `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`;

export const PASSWORD_TOO_SHORT = `Tá curto demais. Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;

/** `true` quando a senha atende ao mínimo. */
export const isPasswordLongEnough = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH;
