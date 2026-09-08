// Which half of the catalog is on screen: what has been watched, or what is
// still on the watchlist. Backed by Title.inWatchlist — the one field every
// query filters on (Title.status mirrors it for readability, and the two are
// only ever written together; see src/app/api/titles/route.ts).

export type WatchMode = "watched" | "watchlist";

export const WATCH_MODES: { value: WatchMode; label: string }[] = [
  { value: "watched", label: "Watched" },
  { value: "watchlist", label: "To watch" },
];
