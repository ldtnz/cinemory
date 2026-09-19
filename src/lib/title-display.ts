import type { CatalogTitle } from "@/lib/catalog-title";

/**
 * How a title is spelled out wherever it is shown: the card's hover overlay
 * and the details modal both draw on these, and a platform that reads
 * "Amazon Prime Video" on one and "Prime Video" on the other is the kind of
 * drift that makes two views of the same title look like two records.
 */

/** Dates are stored as UTC midnight, so they are read back in UTC too — in
 *  any other zone half of them land on the day before. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export const PLATFORM_STYLES: Record<string, { color: string; label: string }> = {
  Netflix: { color: "text-red-400", label: "Netflix" },
  "Amazon Prime Video": { color: "text-sky-400", label: "Prime Video" },
  "Disney+": { color: "text-blue-400", label: "Disney+" },
  "Apple TV+": { color: "text-zinc-300", label: "Apple TV+" },
  Max: { color: "text-purple-400", label: "Max" },
  "Paramount+": { color: "text-indigo-400", label: "Paramount+" },
  Peacock: { color: "text-fuchsia-400", label: "Peacock" },
  Hulu: { color: "text-lime-400", label: "Hulu" },
  YouTube: { color: "text-rose-400", label: "YouTube" },
  Crunchyroll: { color: "text-yellow-400", label: "Crunchyroll" },
  "Sky / NOW": { color: "text-cyan-400", label: "Sky / NOW" },
  RaiPlay: { color: "text-orange-400", label: "RaiPlay" },
  "Mediaset Infinity": { color: "text-pink-400", label: "Mediaset Infinity" },
  TIMvision: { color: "text-teal-400", label: "TIMvision" },
  "Rakuten TV": { color: "text-emerald-400", label: "Rakuten TV" },
  Cinema: { color: "text-amber-400", label: "Cinema" },
  TV: { color: "text-slate-400", label: "TV broadcast" },
  Unknown: { color: "text-neutral-500", label: "Not sure" },
};

export function platformStyle(platform: string): { color: string; label: string } {
  return PLATFORM_STYLES[platform] ?? { color: "text-muted", label: platform };
}

/**
 * "2 of 5 seasons", or only the half that is known: TMDB does not always give
 * the total, and an export does not always name the season it covered.
 */
export function seasonsLabel(title: CatalogTitle): string | null {
  if (title.mediaType !== "Series") return null;
  const watched = title.watchedSeasons;
  const total = title.totalSeasons ?? 0;
  if (watched != null && total > 0) return `${watched} of ${total} seasons`;
  if (watched != null) return `${watched} ${watched === 1 ? "season watched" : "seasons watched"}`;
  if (total > 0) return `${total} ${total === 1 ? "season" : "seasons"}`;
  return null;
}
