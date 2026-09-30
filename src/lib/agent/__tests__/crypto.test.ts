import { describe, expect, test } from "bun:test";
import {
  b64encode,
  decryptSecret,
  encryptSecret,
  generateMasterKey,
  masterKeyFromEnv,
} from "../crypto";

describe("envelope crypto", () => {
  test("round-trips a secret", async () => {
    const key = await masterKeyFromEnv(generateMasterKey());
    const ct = await encryptSecret(key, "-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END RSA PRIVATE KEY-----");
    expect(ct.startsWith("v1.")).toBe(true);
    expect(await decryptSecret(key, ct)).toBe("-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END RSA PRIVATE KEY-----");
  });

  test("unique ciphertexts per encryption (random DEK)", async () => {
    const key = await masterKeyFromEnv(generateMasterKey());
    const a = await encryptSecret(key, "same-secret");
    const b = await encryptSecret(key, "same-secret");
    expect(a).not.toBe(b);
    expect(await decryptSecret(key, a)).toBe(await decryptSecret(key, b));
  });

  test("tampered ciphertext is detected (GCM tag)", async () => {
    const key = await masterKeyFromEnv(generateMasterKey());
    const ct = await encryptSecret(key, "whsec_super_secret_value");
    const parts = ct.split(".");
    // Flip a byte in the data ciphertext
    const bytes = b64encode(String.fromCharCode(255) + atob(parts[4].slice(0, 8)) + atob(parts[4].slice(8)));
    const tampered = [parts[0], parts[1], parts[2], parts[3], bytes].join(".");
    expect(decryptSecret(key, tampered)).rejects.toThrow();
  });

  test("wrong master key fails", async () => {
    const keyA = await masterKeyFromEnv(generateMasterKey());
    const keyB = await masterKeyFromEnv(generateMasterKey());
    const ct = await encryptSecret(keyA, "secret");
    expect(decryptSecret(keyB, ct)).rejects.toThrow();
  });

  test("master key must be 32 bytes", async () => {
    expect(masterKeyFromEnv(b64encode(new Uint8Array(16)))).rejects.toThrow();
  });
});
