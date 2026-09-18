/**
 * The normalized form of a title, used for search and de-duplication and
 * stored on every row as Title.searchTitle.
 *
 * It lives in its own module because both the client (the watchlist grid, to
 * hide titles already watched) and the server need it, and the other home for
 * it — src/lib/history.ts — pulls in the CSV parser, which has no business
 * being in the browser bundle.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * The words a query is made of, normalized the same way titles are.
 *
 * The grid used to test the raw query as one substring, which meant the words
 * had to be contiguous and in the stored order: "wars empire" found nothing,
 * and neither did "Amélie", because the query was only lowercased while the
 * titles it is compared against have their accents stripped.
 */
export function searchWords(query: string): string[] {
  return normalizeTitle(query).split(/\s+/).filter(Boolean);
}

/** Every word has to appear somewhere in the title, in any order. */
export function matchesSearchWords(searchTitle: string, words: string[]): boolean {
  return words.every((w) => searchTitle.includes(w));
}
