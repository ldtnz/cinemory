import type { Prisma } from "@prisma/client";
import { normalizeTitle } from "@/lib/title-key";

export type TitleIdentity = {
  title: string;
  mediaType: string;
  tmdbId?: number | null;
  year?: number | null;
};

export function tmdbIdentity(title: TitleIdentity): string | null {
  return Number.isInteger(title.tmdbId) && (title.tmdbId ?? 0) > 0
    ? `tmdb:${title.mediaType}:${title.tmdbId}`
    : null;
}

export function fallbackIdentity(title: TitleIdentity): string {
  return JSON.stringify([title.mediaType, normalizeTitle(title.title), title.year ?? null]);
}

export function titleIdentityKey(title: TitleIdentity): string {
  return tmdbIdentity(title) ?? `title:${fallbackIdentity(title)}`;
}

/** IDs take precedence. Known years must agree. Without a year, a name
 * matches only one unambiguous work of that type (needed for streaming
 * exports which omit years). Different confirmed IDs never match by name. */
export class TitleIdentityIndex<T extends TitleIdentity = TitleIdentity> {
  private ids = new Map<string, T>();
  private names = new Map<string, T[]>();

  constructor(titles: readonly T[] = []) {
    for (const title of titles) this.add(title);
  }

  add(title: T): void {
    const id = tmdbIdentity(title);
    if (id) this.ids.set(id, title);
    const name = JSON.stringify([title.mediaType, normalizeTitle(title.title)]);
    this.names.set(name, [...(this.names.get(name) ?? []), title]);
  }

  find(title: TitleIdentity): T | undefined {
    const id = tmdbIdentity(title);
    if (id && this.ids.has(id)) return this.ids.get(id);
    const name = JSON.stringify([title.mediaType, normalizeTitle(title.title)]);
    const matches = (this.names.get(name) ?? []).filter((saved) =>
      (!id || !tmdbIdentity(saved)) &&
      (title.year == null || saved.year == null || title.year === saved.year),
    );
    // Re-importing an unresolved row is still idempotent, even if the
    // catalog also contains confirmed homonyms that it cannot identify.
    if (!id) {
      const unresolved = matches.find(saved => !tmdbIdentity(saved) && fallbackIdentity(saved) === fallbackIdentity(title));
      if (unresolved) return unresolved;
    }
    const identities = new Set(matches.map(titleIdentityKey));
    return identities.size === 1 ? matches[0] : undefined;
  }

  has(title: TitleIdentity): boolean { return this.find(title) !== undefined; }
}

/** Database candidates for the same matching rule used by the browser. */
export function duplicateTitleWhere(title: TitleIdentity): Prisma.TitleWhereInput {
  const fallback: Prisma.TitleWhereInput = {
    mediaType: title.mediaType,
    searchTitle: normalizeTitle(title.title),
    ...(title.year != null ? { OR: [{ year: title.year }, { year: null }] } : {}),
  };
  if (!tmdbIdentity(title)) return fallback;
  return {
    mediaType: title.mediaType,
    OR: [
      { tmdbId: title.tmdbId },
      { AND: [fallback, { OR: [{ tmdbId: null }, { tmdbId: { lte: 0 } }] }] },
    ],
  };
}
