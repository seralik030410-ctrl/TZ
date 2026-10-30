import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, digest, extra] = encoded.split(":");
  if (algorithm !== "scrypt" || extra || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(digest ?? "")) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, "hex"));
}

type Session = { userId: string; version: number; expiresAt: number };
export function signAccountSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function readAccountSession(token: string, secret: string, now = Date.now()): Session | null {
  const [payload, provided, extra] = token.split(".");
  if (extra || !payload || payload.length > 1024 || !/^[a-f0-9]{64}$/.test(provided ?? "")) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (!timingSafeEqual(expected, Buffer.from(provided, "hex"))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof value.userId !== "string" || !/^[a-f0-9-]{36}$/.test(value.userId) || !Number.isInteger(value.version) || value.version < 0 || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 31 * 86400000) return null;
    return { userId: value.userId, version: value.version, expiresAt: value.expiresAt };
  } catch { return null; }
}
