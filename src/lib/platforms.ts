/**
 * The four platforms a title can be watched on.
 *
 * One list, shared: the filter bar and the pickers render it, and the API
 * routes validate against it. It used to be copy-pasted into each of those,
 * which is exactly how a fifth platform ends up half-added.
 *
 * The values are stored verbatim in Title.platform, so changing one is a
 * data migration, not a rename. Watchlist entries carry "" instead: they
 * have not been watched anywhere yet.
 */
export const PLATFORMS: { value: string; label: string }[] = [
  { value: "Netflix", label: "Netflix" },
  { value: "Amazon Prime Video", label: "Prime Video" },
  { value: "Disney+", label: "Disney+" },
  { value: "Cinema", label: "Cinema" },
];

export function isValidPlatform(value: unknown): value is string {
  return typeof value === "string" && PLATFORMS.some((p) => p.value === value);
}
