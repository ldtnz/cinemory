"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import {
  countWatchedEpisodes,
  isEpisodeWatched,
  isSeasonComplete,
  lastEpisodeLabel,
  markEpisode,
  markSeason,
  matchSeasonCount,
  unmarkEpisode,
  unmarkSeason,
  type EpisodeDetail,
  type SeasonSummary,
  type WatchedEpisodes,
} from "@/lib/episodes";

/** "2019-03-03" -> "3 Mar 2019". Empty when TMDB has no date. */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** The round tick used for seasons and episodes alike: full, partial or empty. */
function Tick({ state }: { state: "full" | "partial" | "empty" }) {
  return (
    <span
      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border ${
        state === "empty"
          ? "border-white/35 text-transparent"
          : "border-accent-2 bg-accent-2 text-background"
      }`}
    >
      {state === "full" && <Check className="h-3 w-3" strokeWidth={3} />}
      {state === "partial" && <Minus className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

/**
 * Picks which episodes of a series were watched, season by season.
 *
 * Ticking a season ticks it and every earlier one; ticking an episode ticks
 * everything before it as well — watching episode 4 of season 2 means having
 * watched what came first. Unticking clears only what was clicked. Only
 * released episodes can be ticked. The rules live in src/lib/episodes.ts.
 *
 * Seasons come from one TMDB call; a season's episodes, with their titles,
 * runtimes and synopses, are fetched the first time it is opened.
 */
export default function EpisodePicker({
  tmdbId,
  value,
  onChange,
  seedSeasons = 0,
  onSeed,
}: {
  tmdbId: number;
  value: WatchedEpisodes;
  /** Every change made by ticking or unticking. */
  onChange: (next: WatchedEpisodes) => void;
  /** Seasons already recorded as watched for a series that never tracked
   *  episodes: once TMDB answers they are ticked through `onSeed`, which is
   *  not a change, so the picker opens showing what is already known. */
  seedSeasons?: number;
  onSeed?: (seeded: WatchedEpisodes) => void;
}) {
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Map<number, EpisodeDetail[] | "error">>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/episodes?id=${tmdbId}`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { seasons: SeasonSummary[] };
        setSeasons(data.seasons);
        if (seedSeasons > 0 && countWatchedEpisodes(value) === 0) {
          onSeed?.(matchSeasonCount({}, data.seasons, seedSeasons));
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
    // Seeding is a one-off for the first answer, not something to redo as
    // the value it fills in changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId]);

  useEffect(() => {
    if (open === null || episodes.has(open)) return;
    const season = open;
    const controller = new AbortController();
    void (async () => {
      let result: EpisodeDetail[] | "error" = "error";
      try {
        const res = await fetch(`/api/episodes?id=${tmdbId}&season=${season}`, {
          signal: controller.signal,
        });
        if (res.ok) result = ((await res.json()) as { episodes: EpisodeDetail[] }).episodes;
      } catch {
        if (controller.signal.aborted) return;
      }
      setEpisodes((prev) => new Map(prev).set(season, result));
    })();
    return () => controller.abort();
  }, [open, tmdbId, episodes]);

  if (failed) {
    return (
      <p className="rounded-2xl bg-surface-2/60 p-3 text-xs text-muted">
        Episodes could not be loaded from TMDB.
      </p>
    );
  }

  if (!seasons) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-label="Loading seasons">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    );
  }

  if (seasons.length === 0) {
    return (
      <p className="rounded-2xl bg-surface-2/60 p-3 text-xs text-muted">
        TMDB lists no seasons for this series.
      </p>
    );
  }

  const watchedCount = countWatchedEpisodes(value);
  const airedTotal = seasons.reduce((sum, s) => sum + s.airedCount, 0);
  const last = lastEpisodeLabel(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
        <span>
          {watchedCount} of {airedTotal} episodes watched
          {last ? ` · up to ${last}` : ""}
        </span>
        {watchedCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl">
        {seasons.map((s) => {
          const complete = isSeasonComplete(value, seasons, s.season);
          const seen = value[s.season]?.length ?? 0;
          const state = complete ? "full" : seen > 0 ? "partial" : "empty";
          const expanded = open === s.season;
          const list = episodes.get(s.season);
          const year = s.airDate?.slice(0, 4);
          return (
            <li key={s.season} className="overflow-hidden rounded-xl bg-surface-2">
              <div className="flex items-center gap-1 pr-1">
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      complete
                        ? unmarkSeason(value, s.season)
                        : markSeason(value, seasons, s.season),
                    )
                  }
                  disabled={s.airedCount === 0}
                  aria-pressed={complete}
                  aria-label={
                    complete
                      ? `Unmark ${s.name}`
                      : `Mark ${s.name} and everything before it as watched`
                  }
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left disabled:opacity-45"
                >
                  <Tick state={state} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-sm font-medium text-foreground">
                      {s.name}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {[
                        `${s.episodeCount} ${s.episodeCount === 1 ? "episode" : "episodes"}`,
                        year,
                        s.airedCount === 0
                          ? "not out yet"
                          : s.airedCount < s.episodeCount
                            ? `${s.airedCount} out`
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex-none text-[11px] tabular-nums text-muted">
                    {seen}/{s.airedCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s.season)}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Hide" : "Show"} episodes of ${s.name}`}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                    strokeWidth={2}
                  />
                </button>
              </div>

              {expanded && (
                <div className="border-t border-white/5 px-1.5 py-1.5">
                  {list === undefined ? (
                    <div className="space-y-1 p-1" aria-busy="true">
                      {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-3" />
                      ))}
                    </div>
                  ) : list === "error" ? (
                    <p className="p-2 text-xs text-muted">Episodes could not be loaded.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {list.map((e) => {
                        const watched = isEpisodeWatched(value, s.season, e.episode);
                        const released = e.episode <= s.airedCount;
                        return (
                          <li key={e.episode}>
                            <button
                              type="button"
                              onClick={() =>
                                onChange(
                                  watched
                                    ? unmarkEpisode(value, s.season, e.episode)
                                    : markEpisode(value, seasons, s.season, e.episode),
                                )
                              }
                              disabled={!released}
                              aria-pressed={watched}
                              className="flex w-full items-start gap-3 rounded-lg px-1.5 py-2 text-left hover:bg-white/5 disabled:opacity-45 disabled:hover:bg-transparent"
                            >
                              <span className="mt-0.5">
                                <Tick state={watched ? "full" : "empty"} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-1 block text-[13px] font-medium text-foreground">
                                  <span className="tabular-nums text-muted">E{e.episode}</span>{" "}
                                  {e.name}
                                </span>
                                <span className="block text-[11px] text-muted">
                                  {[
                                    e.runtime ? `${e.runtime} min` : null,
                                    released
                                      ? shortDate(e.airDate)
                                      : e.airDate
                                        ? `Airs ${shortDate(e.airDate)}`
                                        : "Not out yet",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                                {e.overview && (
                                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted/80">
                                    {e.overview}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
