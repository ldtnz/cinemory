import { test, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

process.env.TMDB_ACCESS_TOKEN = "test-token";
mock.module("@/lib/settings", { namedExports: { getSettings: async () => { throw new Error("Region must be supplied explicitly"); } } });
let lookup: typeof import("@/lib/tmdb").fetchWatchProviders;
before(async () => { ({ fetchWatchProviders: lookup } = await import("@/lib/tmdb")); });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("subscription, free and ad-supported providers are deduplicated for the requested region", async () => {
  globalThis.fetch = async () => Response.json({ results: {
    IT: { flatrate: [{ provider_name: "Netflix" }], ads: [{ provider_name: "Netflix" }], free: [{ provider_name: "RaiPlay" }], buy: [{ provider_name: "Shop" }] },
    US: { flatrate: [{ provider_name: "Hulu" }] },
  } });
  assert.deepEqual(await lookup(1, "Movie", "IT"), ["Netflix", "RaiPlay"]);
  assert.deepEqual(await lookup(1, "Movie", "US"), ["Hulu"]);
});

test("a successful response without the region is a valid empty answer", async () => {
  globalThis.fetch = async () => Response.json({ results: {} });
  assert.deepEqual(await lookup(1, "Series", "IT"), []);
});

test("HTTP failures, invalid JSON and malformed responses never become empty availability", async () => {
  for (const response of [
    new Response("rate limit", { status: 429 }),
    new Response("unavailable", { status: 503 }),
    new Response("not json"),
    Response.json({}),
    Response.json({ results: { IT: null } }),
    Response.json({ results: { IT: { flatrate: [{}] } } }),
  ]) {
    globalThis.fetch = async () => response;
    await assert.rejects(() => lookup(1, "Movie", "IT"));
  }
});

test("network failure is propagated to the caller", async () => {
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(() => lookup(1, "Movie", "IT"), /offline/);
});
