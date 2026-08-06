import "server-only";

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE = "snail_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;
const KEY_LEN = 64;

function secret(): string {
  return (
    process.env.AUTH_SECRET ??
    process.env.ROUND_SECRET ??
    "snailgame-dev-auth-secret-please-set-AUTH_SECRET"
  );
}

export function newUid(): string {
  return randomUUID();
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, KEY_LEN).toString("hex") };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== KEY_LEN) return false;
  const candidate = scryptSync(password, salt, KEY_LEN);
  return timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(uid: string): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + MAX_AGE_SEC * 1000 })).toString(
    "base64url"
  );
  return `${payload}.${sign(payload)}`;
}

function readSessionToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: string;
      exp?: number;
    };
    if (!data.uid || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export function uidFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return readSessionToken(decodeURIComponent(rest.join("=")));
  }
  return null;
}

function cookieAttributes(maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(MAX_AGE_SEC)}`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE}=; ${cookieAttributes(0)}`;
}
