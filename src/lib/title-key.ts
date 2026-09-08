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
