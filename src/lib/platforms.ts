/**
 * Where a title can be watched.
 *
 * One list, shared: the filter bar and the pickers render it, and the API
 * routes validate against it. It used to be copy-pasted into each of those,
 * which is exactly how a fifth platform ends up half-added.
 *
 * The values are stored verbatim in Title.platform, so changing one is a
 * data migration, not a rename. Watchlist entries carry "" instead: they
 * have not been watched anywhere yet. Kept to the mainstream services (and
 * Cinema, for a theatrical watch) rather than every niche one that exists —
 * "Unknown" covers the rest, for an import or a memory that doesn't fit any
 * of them.
 */
export const PLATFORMS: { value: string; label: string }[] = [
  { value: "Netflix", label: "Netflix" },
  { value: "Amazon Prime Video", label: "Prime Video" },
  { value: "Disney+", label: "Disney+" },
  { value: "Apple TV+", label: "Apple TV+" },
  { value: "Max", label: "Max" },
  { value: "Paramount+", label: "Paramount+" },
  { value: "Peacock", label: "Peacock" },
  { value: "Hulu", label: "Hulu" },
  { value: "YouTube", label: "YouTube" },
  { value: "Crunchyroll", label: "Crunchyroll" },
  { value: "Sky / NOW", label: "Sky / NOW" },
  { value: "RaiPlay", label: "RaiPlay" },
  { value: "Mediaset Infinity", label: "Mediaset Infinity" },
  { value: "TIMvision", label: "TIMvision" },
  { value: "Rakuten TV", label: "Rakuten TV" },
  { value: "Cinema", label: "Cinema" },
  { value: "TV", label: "TV broadcast" },
  { value: "Unknown", label: "Not sure" },
];

export function isValidPlatform(value: unknown): value is string {
  return typeof value === "string" && PLATFORMS.some((p) => p.value === value);
}
