import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, signAccountSession, readAccountSession } from "../api/lib/accountSecurity";

describe("account security", () => {
  it("salts passwords and rejects wrong passwords or invalid hashes", () => {
    const first = hashPassword("example-password");
    expect(hashPassword("example-password")).not.toBe(first);
    expect(verifyPassword("example-password", first)).toBe(true);
    expect(verifyPassword("wrong-password", first)).toBe(false);
    expect(verifyPassword("example-password", "scrypt:bad:bad")).toBe(false);
  });
  it("binds sessions to an account and expiry and rejects tampering", () => {
    const now = Date.now();
    const value = { userId: "50800000-0000-4000-8000-000000000001", version: 1, expiresAt: now + 1000 };
    const token = signAccountSession(value, "test-secret");
    expect(readAccountSession(token, "test-secret", now)).toEqual(value);
    expect(readAccountSession(token, "other-secret", now)).toBeNull();
    expect(readAccountSession(token + ".extra", "test-secret", now)).toBeNull();
    expect(readAccountSession(token, "test-secret", now + 1000)).toBeNull();
    expect(readAccountSession(token + "0", "test-secret", now)).toBeNull();
  });
});
