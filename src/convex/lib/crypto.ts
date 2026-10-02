"use node";

/**
 * Token encryption (node-only).
 *
 * Access and refresh tokens are encrypted with AES-256-GCM before they touch
 * the database and are only ever decrypted inside server-side actions. The
 * key comes from the `TOKEN_ENCRYPTION_KEY` Convex environment variable —
 * a 64-char hex string (32 bytes) or any passphrase, which is hashed to 32
 * bytes. The key is never sent to the browser.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function derivedKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) return null;
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  return createHash("sha256").update(value).digest();
}

export function isEncryptionConfigured(): boolean {
  return derivedKey() !== null;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = derivedKey();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = derivedKey();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  extra?: Record<string, string>;
}

export function sealTokens(tokens: StoredTokens): EncryptedPayload {
  return encryptSecret(JSON.stringify(tokens));
}

export function openTokens(payload: EncryptedPayload): StoredTokens {
  return JSON.parse(decryptSecret(payload)) as StoredTokens;
}
