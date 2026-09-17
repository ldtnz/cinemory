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

/** Whether a stored total is a real answer rather than "unknown". */
export function hasSeasonTotal(total: number | null | undefined): boolean {
  return total != null && total > 0;
}

/**
 * How many seasons were watched, as it can actually be stored.
 *
 * One home for the rule that you cannot have watched more seasons than exist,
 * because it has to hold on both sides of the wire: the dialog uses it to
 * decide which buttons are dead, and the route runs it again on the way in,
 * where a hand-made request has no buttons to obey.
 *
 * The total is not an argument to be set — it is TMDB's answer, fetched
 * automatically — only a ceiling, and only when TMDB has actually answered.
 * A series nobody has a count for has no ceiling at all, because progress
 * through it is still worth recording.
 *
 * Zero comes back as null: "none watched" and "no idea" have to be the same
 * stored value, or the posters would show "0 of 6" for a series never started.
 */
export function clampWatchedSeasons(
  watched: number | null | undefined,
  totalSeasons: number | null | undefined,
): number | null {
  if (typeof watched !== "number" || !Number.isInteger(watched)) return null;
  let value = Math.max(0, watched);
  if (hasSeasonTotal(totalSeasons)) value = Math.min(value, totalSeasons as number);
  return value > 0 ? value : null;
}
