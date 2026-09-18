// A watched date, read strictly, wherever one is written into the catalog.
//
// Its own module because all three ways in need it — the app's own routes,
// the MCP tools, and nothing else should have to import the MCP server to
// parse a date — and because the rule it encodes is the same everywhere: a
// date that is not one must be refused, not guessed at.

/**
 * A watched date, strictly.
 *
 * `new Date()` is far too willing: V8 reads "some time in 2021" as the first
 * of January 2021, so a model's hedge would be stored as a fact and nothing
 * would look wrong afterwards. A date being written into the catalog has to be
 * the shape the tools ask for, YYYY-MM-DD, or an optional full timestamp.
 *
 * Bare dates become local midnight, the same convention the app's own date
 * field uses (src/lib/date-input.ts), so "the 14th" means the same day
 * whether it was typed in the app or said in a chat.
 *
 * Deliberately stricter than the from/to of a search, where a loose reading
 * of "2024" costs a slightly wider answer rather than a wrong row.
 */
export function parseWatchedDate(value: string): Date | null {
  const bare = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (bare) {
    const [, y, m, d] = bare;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    // Rejects 2024-02-31, which the constructor would roll into March.
    return date.getFullYear() === Number(y) &&
      date.getMonth() === Number(m) - 1 &&
      date.getDate() === Number(d)
      ? date
      : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(value.trim())) {
    const date = new Date(value.trim());
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}
