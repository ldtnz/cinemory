/**
 * The MCP endpoint's credential.
 *
 * This is the whole of what stands between a URL and someone's viewing
 * history, so it is worth pinning down: the token has to be unguessable, the
 * stored form must not be usable as a credential, and the comparison has to
 * refuse everything that is not an exact match — including the shapes that
 * would otherwise throw rather than return false.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerToken, generateMcpToken, hashMcpToken, isValidMcpToken, scopeOf } from "@/lib/mcp-token";
import { mcpBaseUrl, mcpUrl } from "@/lib/mcp-url";

test("a generated token is long, URL-safe and never repeats", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const token = generateMcpToken();
    // A three-character scope prefix and 32 bytes of base64url, unpadded.
    assert.equal(token.length, 46);
    assert.match(token, /^[A-Za-z0-9_-]+$/, "must survive being put in a URL path");
    assert.ok(!seen.has(token), "generated the same token twice");
    seen.add(token);
  }
});

test("what is stored is a digest, not the token", () => {
  const token = generateMcpToken();
  const hash = hashMcpToken(token);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]+$/);
  assert.notEqual(hash, token);
  // The digest must not be accepted in place of the token it stores, or
  // reading the database would be as good as holding the credential.
  assert.equal(isValidMcpToken(hash, hash), false);
});

test("hashing is stable, so a stored digest keeps matching", () => {
  const token = generateMcpToken();
  assert.equal(hashMcpToken(token), hashMcpToken(token));
});

test("the right token is accepted", () => {
  const token = generateMcpToken();
  assert.equal(isValidMcpToken(token, hashMcpToken(token)), true);
});

test("a wrong token is refused", () => {
  const stored = hashMcpToken(generateMcpToken());
  assert.equal(isValidMcpToken(generateMcpToken(), stored), false);
});

test("a token that differs by one character is refused", () => {
  const token = generateMcpToken();
  const stored = hashMcpToken(token);
  const almost = (token[0] === "a" ? "b" : "a") + token.slice(1);
  assert.equal(isValidMcpToken(almost, stored), false);
});

test("nothing is accepted while the endpoint is switched off", () => {
  // A null digest is the off state; no token may open it, empty least of all.
  assert.equal(isValidMcpToken(generateMcpToken(), null), false);
  assert.equal(isValidMcpToken("", null), false);
  assert.equal(isValidMcpToken(undefined, null), false);
});

test("an empty or missing token is refused even when one is set", () => {
  const stored = hashMcpToken(generateMcpToken());
  assert.equal(isValidMcpToken("", stored), false);
  assert.equal(isValidMcpToken(undefined, stored), false);
});

test("a malformed stored value is refused rather than throwing", () => {
  // timingSafeEqual throws on a length mismatch, so the guard has to come
  // first: a truncated or junk column must read as "no match", not as a 500.
  const token = generateMcpToken();
  for (const junk of ["", "not-hex", "abc", "z".repeat(64), hashMcpToken(token).slice(0, 40)]) {
    assert.equal(isValidMcpToken(token, junk), false, `accepted or threw on ${junk.slice(0, 12)}`);
  }
});

test("the address without a token is stable and carries no secret", () => {
  assert.equal(mcpBaseUrl("https://cinemory.example"), "https://cinemory.example/api/mcp");
  assert.equal(mcpBaseUrl("https://cinemory.example/"), "https://cinemory.example/api/mcp");
});

test("the fallback URL is the endpoint's path with the token on the end", () => {
  const token = generateMcpToken();
  assert.equal(mcpUrl("https://cinemory.example", token), `https://cinemory.example/api/mcp/${token}`);
  // A trailing slash on the origin must not produce a double slash, which
  // would be a different path and would not route.
  assert.equal(mcpUrl("https://cinemory.example/", token), `https://cinemory.example/api/mcp/${token}`);
});

// --- scope -----------------------------------------------------------------

test("a token reads as read-only unless it was minted to write", () => {
  assert.equal(scopeOf(generateMcpToken()), "read");
  assert.equal(scopeOf(generateMcpToken("read")), "read");
  assert.equal(scopeOf(generateMcpToken("write")), "write");
});

test("both scopes still authenticate normally", () => {
  for (const scope of ["read", "write"] as const) {
    const token = generateMcpToken(scope);
    assert.equal(isValidMcpToken(token, hashMcpToken(token)), true);
  }
});

test("the scope cannot be widened by editing the token", () => {
  // The prefix is part of what was hashed, so promoting a read token to a
  // write one stops it matching at all rather than granting anything. This is
  // the whole reason the scope can live in the credential without a server.
  const readToken = generateMcpToken("read");
  const stored = hashMcpToken(readToken);
  const promoted = "rw_" + readToken.slice(3);

  assert.equal(scopeOf(promoted), "write", "the edit does claim more");
  assert.equal(isValidMcpToken(promoted, stored), false, "but it no longer authenticates");
});

test("a token from before scopes existed reads as read-only", () => {
  // Anything unrecognised has to fall to the narrower scope, not the wider.
  assert.equal(scopeOf("MPTMMGvAVQfLbnDArnbDvXCWFFuWPMbpuxgDrTMLbQo"), "read");
  assert.equal(scopeOf(""), "read");
});

// --- the header form -------------------------------------------------------

test("a Bearer header yields the token, however it is spelled", () => {
  const token = generateMcpToken();
  assert.equal(bearerToken(`Bearer ${token}`), token);
  // RFC 9110 makes the scheme case-insensitive, and clients do vary.
  assert.equal(bearerToken(`bearer ${token}`), token);
  assert.equal(bearerToken(`BEARER  ${token}  `), token);
});

test("anything that is not a Bearer token yields nothing", () => {
  const token = generateMcpToken();
  for (const header of [
    null,
    undefined,
    "",
    token, // the bare token, with no scheme
    `Basic ${token}`,
    `Token ${token}`,
    "Bearer",
    "Bearer ",
    `Bearer ${token} extra`, // two values is not one credential
  ]) {
    assert.equal(bearerToken(header), undefined, `accepted ${String(header).slice(0, 16)}`);
  }
});

test("a header token is validated exactly like one from a URL", () => {
  // The two forms differ in how the token arrives and in nothing else — the
  // same digest has to open both, or revoking one would not revoke the other.
  const token = generateMcpToken("write");
  const stored = hashMcpToken(token);
  const fromHeader = bearerToken(`Bearer ${token}`);

  assert.equal(fromHeader, token);
  assert.equal(isValidMcpToken(fromHeader, stored), true);
  assert.equal(scopeOf(fromHeader!), "write");
});
