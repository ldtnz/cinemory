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
import { generateMcpToken, hashMcpToken, isValidMcpToken } from "@/lib/mcp-token";
import { mcpUrl } from "@/lib/mcp-url";

test("a generated token is long, URL-safe and never repeats", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const token = generateMcpToken();
    // 32 bytes of base64url, unpadded.
    assert.equal(token.length, 43);
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

test("the URL is the endpoint's path with the token on the end", () => {
  const token = generateMcpToken();
  assert.equal(mcpUrl("https://cinemory.example", token), `https://cinemory.example/api/mcp/${token}`);
  // A trailing slash on the origin must not produce a double slash, which
  // would be a different path and would not route.
  assert.equal(mcpUrl("https://cinemory.example/", token), `https://cinemory.example/api/mcp/${token}`);
});
