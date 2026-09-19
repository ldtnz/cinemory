import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadMissingWatchProviders, watchProviderKey, PROVIDER_TTL_MS,
  type ProviderCache, type ProviderResults, type ProviderTitle,
} from "@/lib/watch-providers";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const titles = (n: number) => Array.from({ length: n }, (_, i) => ({ tmdbId: i + 1, mediaType: "Movie" }));
const signal = () => new AbortController().signal;
function replies(region: string, calls: ProviderTitle[][]) {
  globalThis.fetch = (async (_url, init) => {
    const { items } = JSON.parse(init?.body as string) as { items: ProviderTitle[] };
    calls.push(items);
    return Response.json({ region, providers: Object.fromEntries(items.map(t => [watchProviderKey(region, t), []])) });
  }) as typeof fetch;
}

test("a growing grid beyond 120 only requests new titles, in bounded batches", async () => {
  const calls: ProviderTitle[][] = [];
  replies("IT", calls);
  const cache: ProviderCache = new Map();
  const results: ProviderResults = {};
  const publish = (rows: ProviderResults) => Object.assign(results, rows);
  await loadMissingWatchProviders(titles(60), "IT", cache, publish, signal());
  await loadMissingWatchProviders(titles(120), "IT", cache, publish, signal());
  await loadMissingWatchProviders(titles(245), "IT", cache, publish, signal());
  assert.deepEqual(calls.map(batch => batch.length), [60, 60, 60, 60, 5]);
  assert.equal(new Set(calls.flat().map(t => t.tmdbId)).size, 245);
  assert.equal(calls.flat().length, 245);
  assert.deepEqual(results["IT:Movie:245"], []);
});

test("failed batches remain retryable, while successful empty results are cached", async () => {
  const cache: ProviderCache = new Map();
  const results: ProviderResults = {};
  const publish = (rows: ProviderResults) => Object.assign(results, rows);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await loadMissingWatchProviders(titles(1), "IT", cache, publish, signal());
  assert.equal(results["IT:Movie:1"], null);
  assert.equal(cache.size, 0);
  const calls: ProviderTitle[][] = [];
  replies("IT", calls);
  await loadMissingWatchProviders(titles(1), "IT", cache, publish, signal());
  await loadMissingWatchProviders(titles(1), "IT", cache, publish, signal());
  assert.deepEqual(results["IT:Movie:1"], []);
  assert.equal(calls.length, 1);
});

test("region and media type each have independent cache entries", async () => {
  const calls: ProviderTitle[][] = [];
  const cache: ProviderCache = new Map();
  const both = [...titles(1), { tmdbId: 1, mediaType: "Series" }];
  replies("IT", calls);
  await loadMissingWatchProviders(both, "IT", cache, () => {}, signal());
  replies("US", calls);
  await loadMissingWatchProviders(both, "US", cache, () => {}, signal());
  assert.equal(cache.size, 4);
  assert.equal(calls.flat().length, 4);
});

test("expired answers are refreshed", async () => {
  const cache: ProviderCache = new Map([["IT:Movie:1", { names: ["Old provider"], at: Date.now() - PROVIDER_TTL_MS }]]);
  const calls: ProviderTitle[][] = [];
  replies("IT", calls);
  await loadMissingWatchProviders(titles(1), "IT", cache, () => {}, signal());
  assert.equal(calls.length, 1);
  assert.deepEqual(cache.get("IT:Movie:1")?.names, []);
});

test("an abandoned request cannot publish or populate the cache", async () => {
  const controller = new AbortController();
  const cache: ProviderCache = new Map();
  let published = false;
  globalThis.fetch = async () => {
    controller.abort();
    return Response.json({ region: "IT", providers: { "IT:Movie:1": ["Netflix"] } });
  };
  await loadMissingWatchProviders(titles(1), "IT", cache, () => { published = true; }, controller.signal);
  assert.equal(published, false);
  assert.equal(cache.size, 0);
});

test("a response for a different region is never cached under the requested one", async () => {
  replies("US", []);
  const cache: ProviderCache = new Map();
  const results: ProviderResults = {};
  await loadMissingWatchProviders(titles(1), "IT", cache, rows => Object.assign(results, rows), signal());
  assert.equal(cache.size, 0);
  assert.equal(results["IT:Movie:1"], null);
});
