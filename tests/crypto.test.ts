import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  openTokens,
  sealTokens,
  type EncryptedPayload,
} from "../src/convex/lib/crypto";

const HEX_KEY = "0123456789abcdef".repeat(4); // 64 hex chars = 32 bytes
const saved = process.env.TOKEN_ENCRYPTION_KEY;

function restoreKey() {
  if (saved === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = saved;
}

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = HEX_KEY;
});

afterEach(restoreKey);

describe("key configuration", () => {
  test("reports missing configuration instead of silently weakening crypto", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() =>
      decryptSecret({ ciphertext: "", iv: "", authTag: "" }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  test("accepts a 64-char hex key", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  test("accepts a passphrase by hashing it to 32 bytes", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a long human passphrase";
    expect(isEncryptionConfigured()).toBe(true);
    const payload = encryptSecret("hello");
    expect(decryptSecret(payload)).toBe("hello");
  });
});

describe("encryptSecret / decryptSecret", () => {
  test("round-trips unicode and long secrets", () => {
    const secret = `ya29.${"x".repeat(2000)}-🔐-ünïcode`;
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  test("uses a fresh IV per call so ciphertext never repeats", () => {
    const a = encryptSecret("same plaintext");
    const b = encryptSecret("same plaintext");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptSecret(a)).toBe("same plaintext");
    expect(decryptSecret(b)).toBe("same plaintext");
  });

  test("rejects tampered ciphertext through the GCM auth tag", () => {
    const payload = encryptSecret("token-value");
    const flipped = Buffer.from(payload.ciphertext, "base64");
    flipped[0] = flipped[0] ^ 0xff;
    const tampered: EncryptedPayload = {
      ...payload,
      ciphertext: flipped.toString("base64"),
    };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  test("rejects a payload encrypted with a different key", () => {
    const payload = encryptSecret("token-value");
    process.env.TOKEN_ENCRYPTION_KEY = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptSecret(payload)).toThrow();
  });

  test("never stores the plaintext in the payload", () => {
    const payload = encryptSecret("super-secret-access-token");
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain("super-secret-access-token");
  });
});

describe("sealTokens / openTokens", () => {
  test("round-trips the full token record", () => {
    const tokens = {
      accessToken: "access-abc",
      refreshToken: "refresh-def",
      expiresAt: Date.UTC(2026, 0, 1, 12, 0),
      scope: "tweet.write users.read",
      extra: { pageId: "123" },
    };
    expect(openTokens(sealTokens(tokens))).toEqual(tokens);
  });

  test("round-trips a minimal record without a refresh token", () => {
    const tokens = { accessToken: "only-access" };
    expect(openTokens(sealTokens(tokens))).toEqual(tokens);
  });
});
