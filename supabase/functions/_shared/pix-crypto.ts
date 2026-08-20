// Cifra do client_secret do Santander — AES-GCM, chave FORA do banco.
//
// A chave é PIX_CRED_KEY (secret do edge, functions-secrets.env): 32 bytes em
// base64. Só o edge cifra/decifra; o banco guarda "iv_b64:ct_b64" opaco. Assim um
// dump do Postgres não abre o segredo, e a chave nunca transita pra dentro do SQL
// (ao contrário de pgcrypto, onde a chave iria como argumento da query).
//
// AES-GCM (não CBC) de propósito: o tag de autenticação detecta adulteração — um
// ciphertext trocado no banco não decifra em silêncio pra lixo, falha.

function keyBytes(): Uint8Array {
  const raw = (Deno.env.get("PIX_CRED_KEY") ?? "").trim();
  if (!raw) throw new Error("PIX_CRED_KEY ausente");
  const bytes = b64ToBytes(raw);
  if (bytes.length !== 32) {
    throw new Error("PIX_CRED_KEY precisa ser 32 bytes em base64 (AES-256)");
  }
  return bytes;
}

export function isCryptoConfigured(): boolean {
  try {
    keyBytes();
    return true;
  } catch {
    return false;
  }
}

async function key(usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", keyBytes(), { name: "AES-GCM" }, false, [usage]);
}

/** Cifra o texto plano. Devolve "iv_b64:ct_b64" (o ct já inclui o tag GCM). */
export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key("encrypt"),
    new TextEncoder().encode(plain),
  );
  return `${bytesToB64(iv)}:${bytesToB64(new Uint8Array(ct))}`;
}

/** Decifra "iv_b64:ct_b64". Lança se a chave está errada ou o dado foi adulterado. */
export async function decryptSecret(stored: string): Promise<string> {
  const [ivB64, ctB64] = String(stored).split(":");
  if (!ivB64 || !ctB64) throw new Error("ciphertext malformado");
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    await key("decrypt"),
    ct,
  );
  return new TextDecoder().decode(pt);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
