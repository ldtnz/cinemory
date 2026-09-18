/**
 * What the sign-in screen draws behind its card.
 *
 * The poster wall is the catalog itself, drifting: it needs enough artwork to
 * fill the screen, or the columns show more gaps than posters and the effect
 * reads as a loading state. Below that threshold — a fresh install, or one
 * whose import has not run yet — the terminal animation stands in, which
 * needs nothing from the database at all.
 *
 * The choice can be forced either way from Settings, for the two cases the
 * count cannot know about: wanting the animation on a full catalog, or
 * wanting the handful of posters there are.
 */
export const LOGIN_BACKGROUNDS = ["auto", "posters", "terminal"] as const;

export type LoginBackground = (typeof LOGIN_BACKGROUNDS)[number];

/** Below this many titles with artwork, the wall has nothing to show. */
export const POSTER_WALL_MINIMUM = 50;

export function isLoginBackground(value: unknown): value is LoginBackground {
  return typeof value === "string" && (LOGIN_BACKGROUNDS as readonly string[]).includes(value);
}

/** The one actually drawn: what was chosen, or what the catalog can support. */
export function resolveLoginBackground(
  setting: string | null | undefined,
  postersAvailable: number,
): "posters" | "terminal" {
  if (setting === "posters") return "posters";
  if (setting === "terminal") return "terminal";
  return postersAvailable >= POSTER_WALL_MINIMUM ? "posters" : "terminal";
}
