/**
 * The credential that gates the MCP endpoint.
 *
 * The app's own login is a TOTP code and a signed session cookie, which is no
 * use here: a custom connector is fetched by Anthropic's servers, not by the
 * reader's browser, so there is no cookie to send and nobody to type a code.
 * The endpoint therefore has a credential of its own — deliberately separate,
 * so that revoking it costs nothing and losing it gives up read access to the
 * catalog rather than the account.
 *
 * It travels in the URL, because that is what the connector stores. Which
 * makes two things load-bearing: the token is long enough that the URL cannot
 * be guessed, and everything it reaches is read-only.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes of randomness, base64url. Long past the point where guessing is
 *  the weak link — the risk worth worrying about is the URL being copied. */
const TOKEN_BYTES = 32;

export function generateMcpToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Whether a token matches the stored digest.
 *
 * Compared byte by byte in constant time. The digests are a fixed 64 hex
 * characters, so a length mismatch means the input was not a digest at all and
 * the comparison is skipped rather than allowed to throw.
 */
export function isValidMcpToken(token: string | undefined, storedHash: string | null): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashMcpToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
