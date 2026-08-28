// OTP verification (TOTP, RFC 6238) and session-cookie signing.
// Shared between the login route (src/app/api/login/route.ts) and the / and
// /settings pages, which read the session to decide what to render.

import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "cinemory_session";
export const ATTEMPTS_COOKIE_NAME = "cinemory_attempts";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 giorni
export const LOCKOUT_WINDOW_SECONDS = 60;
export const MAX_ATTEMPTS = 5;

function base32Decode(input: string): ArrayBuffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const keyData = new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return bufferToHex(signature);
}

async function computeTotpCode(base32Secret: string, timeStep: number): Promise<string> {
  const key = base32Decode(base32Secret);
  const counter = new ArrayBuffer(8);
  const view = new DataView(counter);
  // The first 4 bytes stay zero: the standard TOTP counter fits in 32 bits
  // for any reasonable date.
  view.setUint32(4, timeStep, false);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digestBuffer = await crypto.subtle.sign("HMAC", cryptoKey, counter);
  const digest = new Uint8Array(digestBuffer);

  const offset = digest[digest.length - 1] & 0xf;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binaryCode % 1_000_000).padStart(6, "0");
}

export async function isValidOtpCode(enteredCode: string, base32Secret: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(now / 30);
  // Allow +/-1 step (30s) for clock drift between device and server.
  for (const delta of [0, -1, 1]) {
    const expectedCode = await computeTotpCode(base32Secret, currentStep + delta);
    if (expectedCode === enteredCode) return true;
  }
  return false;
}

export async function createSessionCookie(sessionSecret: string): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const signature = await hmacSha256(sessionSecret, String(expiry));
  return `${expiry}.${signature}`;
}

export async function isValidSession(
  cookieValue: string | undefined,
  sessionSecret: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const [scadenzaStr, signature] = cookieValue.split(".");
  if (!scadenzaStr || !signature) return false;
  const expiry = Number(scadenzaStr);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expectedSignature = await hmacSha256(sessionSecret, scadenzaStr);
  return expectedSignature === signature;
}

/**
 * For use in Server Components and Route Handlers (both can read `cookies()`
 * from "next/headers"): true when the current request carries a valid session.
 */
export async function isAuthenticated(): Promise<boolean> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) return false;
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return isValidSession(sessionCookie, sessionSecret);
}
