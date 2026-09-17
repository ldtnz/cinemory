/**
 * The two season counts a series carries, and the rule between them.
 *
 * Its own file, with nothing imported, because both sides need it: the edit
 * dialog runs it in the browser to decide which buttons are dead, and the
 * route runs it again on the way in — src/lib/seasons.ts reaches for the
 * database and must not be dragged into the client bundle to supply one rule.
 * Same reasoning as src/lib/title-key.ts.
 */
/**
 * Stored in Title.totalSeasons for a series TMDB has no season count for.
 *
 * Null means "not asked yet", which is what the settings page counts and the
 * fill route works through — so a series TMDB cannot answer for has to be
 * marked as asked, or it stays in that count forever. Negative rather than 0
 * so it can never be mistaken for a real answer, matching the tmdbId of -1
 * that marks a title whose missing poster was deliberately ignored.
 *
 * Anything reading a season count treats it as unknown: the checks are for a
 * number greater than zero, never merely non-null.
 */
export const NO_SEASON_COUNT = -1;

/** Past this a season count is a typo, not a series. */
const MAX_SEASONS = 999;

/** Whether a stored total is a real answer rather than "unknown". */
export function hasSeasonTotal(total: number | null | undefined): boolean {
  return total != null && total > 0;
}

/**
 * The two season counts, reconciled.
 *
 * One home for the rule that you cannot have watched more seasons than exist,
 * because it has to hold from both directions — raising what you watched, and
 * lowering the total underneath it — and on both sides of the wire. The dialog
 * enforces it with disabled buttons; this is what makes it true.
 *
 * A field left out is left alone, so editing a platform cannot silently clear
 * a season count. Clearing a total that was already "asked, no answer" keeps
 * that sentinel rather than demoting it to "never asked", which would put the
 * series back in the queue the settings page works through.
 */
export function normalizeSeasonCounts(
  input: { watchedSeasons?: number | null; totalSeasons?: number | null },
  current: { watchedSeasons: number | null; totalSeasons: number | null },
): { watchedSeasons: number | null; totalSeasons: number | null } {
  let totalSeasons = current.totalSeasons;
  if (input.totalSeasons !== undefined) {
    const wanted = input.totalSeasons;
    totalSeasons =
      typeof wanted === "number" && Number.isInteger(wanted) && wanted > 0
        ? Math.min(wanted, MAX_SEASONS)
        : // Unknown. Which of the two unknowns it is depends on where it came
          // from, and only the sentinel is worth preserving.
          current.totalSeasons === NO_SEASON_COUNT
          ? NO_SEASON_COUNT
          : null;
  }

  let watchedSeasons = current.watchedSeasons;
  if (input.watchedSeasons !== undefined) {
    const wanted = input.watchedSeasons;
    watchedSeasons =
      typeof wanted === "number" && Number.isInteger(wanted) ? Math.max(0, wanted) : null;
  }
  if (watchedSeasons != null) {
    if (hasSeasonTotal(totalSeasons)) watchedSeasons = Math.min(watchedSeasons, totalSeasons!);
    // Zero is stored as "none", so nothing shows on the poster.
    if (watchedSeasons <= 0) watchedSeasons = null;
  }

  return { watchedSeasons, totalSeasons };
}
