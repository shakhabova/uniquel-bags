import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "uniquel_admin";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type AdminUser = { email: string };
type SessionPayload = { email: string; expiresAt: number };

function adminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET || "";
  return secret.length >= 32 ? secret : null;
}

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyAdminCredentials(email: string, password: string) {
  const expectedEmail = adminEmail();
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  return Boolean(
    sessionSecret() &&
    expectedEmail &&
    expectedPassword &&
    safeEqual(email.trim().toLowerCase(), expectedEmail) &&
    safeEqual(password, expectedPassword),
  );
}

export function createAdminSession() {
  const secret = sessionSecret();
  const email = adminEmail();
  if (!secret || !email)
    throw new Error("Авторизация администратора не настроена");

  const payload = Buffer.from(
    JSON.stringify({ email, expiresAt: Date.now() + SESSION_MAX_AGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function readAdminSession(token: string | undefined): AdminUser | null {
  const secret = sessionSecret();
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSignature = sign(payload, secret);
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Date.now() ||
      typeof session.email !== "string" ||
      !safeEqual(session.email, adminEmail())
    ) {
      return null;
    }
    return { email: session.email };
  } catch {
    return null;
  }
}

export async function getAdminUser() {
  const store = await cookies();
  return readAdminSession(store.get(COOKIE_NAME)?.value);
}

export function adminSessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function adminLogoutCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
