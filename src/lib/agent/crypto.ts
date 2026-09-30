/**
 * Envelope encryption for provider credentials (spec §1: "envelope-encrypted
 * tokens, key held outside the database").
 *
 * Scheme (AES-256-GCM, WebCrypto — available in the Worker and in bun tests):
 *   payload = "v1." + b64(dekNonce) + "." + b64(wrappedDek) + "."
 *           + b64(dataNonce) + "." + b64(ciphertext)
 *
 *   - DEK: random 32 bytes per secret (never stored raw)
 *   - wrappedDek: DEK encrypted with the master key (env-only, never in DB)
 *   - ciphertext: secret encrypted with the DEK
 *
 * GCM auth tags make tampering detectable: decryption throws instead of
 * returning corrupted key material.
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();

export function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  // btoa is available in Workers + browsers; bun implements it too.
  return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
}

export function b64decode(s: string): Uint8Array {
  const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

async function importAesGcm(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== 32) {
    throw new CryptoError("Master key must be exactly 32 bytes (base64 of 256 bits)");
  }
  return crypto.subtle.importKey("raw", raw as unknown as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Parse the master key env value (base64 or base64url of 32 bytes). */
export async function masterKeyFromEnv(value: string): Promise<CryptoKey> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return importAesGcm(b64decode(padded));
}

async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<{ nonce: Uint8Array; ct: Uint8Array }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as unknown as BufferSource }, key, plaintext as unknown as BufferSource),
  );
  return { nonce, ct };
}

async function aesDecrypt(key: CryptoKey, nonce: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as unknown as BufferSource },
      key,
      ct as unknown as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    throw new CryptoError("Decryption failed — ciphertext tampered or wrong master key");
  }
}

/** Envelope-encrypt a secret string. Returns the storable payload. */
export async function encryptSecret(masterKey: CryptoKey, plaintext: string): Promise<string> {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const dekKey = await importAesGcm(dek);
  const wrapped = await aesEncrypt(masterKey, dek);
  const data = await aesEncrypt(dekKey, ENC.encode(plaintext));
  return [
    "v1",
    b64encode(wrapped.nonce),
    b64encode(wrapped.ct),
    b64encode(data.nonce),
    b64encode(data.ct),
  ].join(".");
}

/** Decrypt an envelope-encrypted payload produced by {@link encryptSecret}. */
export async function decryptSecret(masterKey: CryptoKey, payload: string): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new CryptoError("Unknown ciphertext format");
  }
  const dek = await aesDecrypt(masterKey, b64decode(parts[1]), b64decode(parts[2]));
  const dekKey = await importAesGcm(dek);
  const plaintext = await aesDecrypt(dekKey, b64decode(parts[3]), b64decode(parts[4]));
  return DEC.decode(plaintext);
}

/** Generate a new master key (for setup tooling — printed once, never stored). */
export function generateMasterKey(): string {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(key).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
