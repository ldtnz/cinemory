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
 * It travels in an Authorization: Bearer header where the client has one, and
 * in the URL where it does not — a connector that can only store an address
 * has nowhere else to put it. Which makes two things load-bearing: the token
 * is long enough that a URL cannot be guessed, and what it reaches is as small
 * as the job allows.
 *
 * The token also carries its own scope, in a prefix. That is the one part of
 * OAuth worth having here — a credential that can only read — without an
 * authorization server to write and get wrong. The prefix cannot be edited to
 * widen it: it is part of what was hashed, so changing it stops the token
 * matching at all.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes of randomness, base64url. Long past the point where guessing is
 *  the weak link — the risk worth worrying about is the URL being copied. */
const TOKEN_BYTES = 32;

/** What a token is allowed to do. Reading is the default everywhere. */
export type McpScope = "read" | "write";

const PREFIX: Record<McpScope, string> = { read: "ro_", write: "rw_" };

export function generateMcpToken(scope: McpScope = "read"): string {
  return PREFIX[scope] + randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * The scope a token claims.
 *
 * Only meaningful once isValidMcpToken has accepted it: the claim is part of
 * the hashed string, so a token whose prefix has been altered does not match
 * anything and never reaches here. Anything unrecognised reads as read-only —
 * the safe direction for a token from an older version, which had no prefix.
 */
export function scopeOf(token: string): McpScope {
  return token.startsWith(PREFIX.write) ? "write" : "read";
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

/**
 * The token out of an Authorization header, or undefined.
 *
 * Only Bearer: a credential offered under some other scheme was not meant for
 * this endpoint, and guessing at it would accept things the spec does not.
 * The scheme is case-insensitive because RFC 9110 says it is, and Anthropic's
 * fetcher is not the only client that will ever send one.
 */
export function bearerToken(header: string | null | undefined): string | undefined {
  const token = header?.match(/^Bearer +(\S+) *$/i)?.[1];
  return token || undefined;
}
