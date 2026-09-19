"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, ExternalLink, Loader2, Star, X } from "lucide-react";
import type { CatalogTitle } from "@/lib/catalog-title";
import type { TitleCredits } from "@/lib/tmdb";
import { splitGenres } from "@/lib/genres";
import { formatDate, platformStyle, seasonsLabel } from "@/lib/title-display";
import { useDialogFocus } from "@/lib/use-dialog-focus";

/** The columns the catalog payload leaves behind, fetched for this one
 *  title — see /api/titles/[id]. */
type Extra = { overview: string | null; personalRating: number | null; link: string | null };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-white/5 py-2.5 first:border-t-0">
      <span className="w-28 flex-none text-[11px] font-medium uppercase tracking-wide text-muted/80">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

/**
 * Everything the catalog knows about one title, in one place.
 *
 * The grid only ever shows what fits under a poster, and the rest was
 * reachable only by editing the title or by not being in the app at all. Two
 * of the fields here do not travel with the catalog and two are not stored at
 * all, so this is the one view that has to fetch: the synopsis and the
 * personal rating from /api/titles/[id], and where it is streaming right now
 * from /api/providers, which answers from a half-day cache.
 */
export default function TitleDetailsModal({
  title,
  onTrailer,
  onClose,
}: {
  title: CatalogTitle;
  /** Absent for a title TMDB never matched, which has no trailer to look up. */
  onTrailer?: () => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const [extra, setExtra] = useState<Extra | null>(null);
  // Null while the answer is on its way. A title TMDB never matched has no
  // id to ask about, which is not "still loading" — so that case is derived
  // below rather than written into state from an effect.
  const [fetchedProviders, setFetchedProviders] = useState<string[] | null>(null);
  const [credits, setCredits] = useState<TitleCredits | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let current = true;
    void (async () => {
      const res = await fetch(`/api/titles/${title.id}`).catch(() => null);
      if (!res?.ok || !current) return;
      const data = (await res.json().catch(() => null)) as Extra | null;
      if (current && data) setExtra(data);
    })();
    return () => {
      current = false;
    };
  }, [title.id]);

  const tmdbId = title.tmdbId;
  const canAskProviders = tmdbId != null && tmdbId > 0;
  const providers = canAskProviders ? fetchedProviders : [];

  useEffect(() => {
    if (!canAskProviders) return;
    let current = true;
    void (async () => {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ tmdbId, mediaType: title.mediaType }] }),
      }).catch(() => null);
      if (!res?.ok || !current) return;
      const data = (await res.json().catch(() => null)) as {
        providers?: Record<number, string[]>;
      } | null;
      if (current) setFetchedProviders(data?.providers?.[tmdbId as number] ?? []);
    })();
    return () => {
      current = false;
    };
  }, [canAskProviders, tmdbId, title.mediaType]);

  useEffect(() => {
    if (!canAskProviders) return;
    let current = true;
    const params = new URLSearchParams({
      id: String(tmdbId),
      type: title.mediaType,
    });
    void (async () => {
      const res = await fetch(`/api/title-credits?${params}`).catch(() => null);
      if (!res?.ok || !current) return;
      const data = (await res.json().catch(() => null)) as TitleCredits | null;
      if (current && data) setCredits(data);
    })();
    return () => {
      current = false;
    };
  }, [canAskProviders, tmdbId, title.mediaType]);

  const genres = splitGenres(title.genres);
  const seasons = seasonsLabel(title);
  const platform = platformStyle(title.platform);
  const watchedOn = title.lastWatchedAt ? formatDate(title.lastWatchedAt) : "";

  return createPortal(
    <div
      className="app-modal-overlay overlay-in fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${title.title} details`}
        onClick={(e) => e.stopPropagation()}
        className="app-modal-panel dialog-in flex max-h-[85dvh] w-[min(92vw,34rem)] flex-col overflow-hidden rounded-3xl"
      >
        <div className="flex items-start gap-3 p-4 pb-3">
          {title.posterUrl && (
            <div className="relative h-24 w-16 flex-none overflow-hidden rounded-xl bg-surface-2">
              <Image src={title.posterUrl} alt="" fill unoptimized sizes="64px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight tracking-tight">{title.title}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {[title.mediaType, title.year].filter(Boolean).join(" · ")}
            </p>
            {title.tmdbRating ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-amber-400">
                <Star className="h-3.5 w-3.5 flex-none fill-current" strokeWidth={0} />
                {title.tmdbRating.toFixed(1)}
                <span className="font-normal text-muted">on TMDB</span>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <Row label={title.inWatchlist ? "Status" : "Watched"}>
            {title.inWatchlist ? (
              <span className="text-muted">Waiting on your watchlist</span>
            ) : (
              <>
                <span className={`font-semibold ${platform.color}`}>{platform.label}</span>
                {watchedOn ? <span className="text-muted"> · {watchedOn}</span> : null}
              </>
            )}
          </Row>

          {seasons && <Row label="Seasons">{seasons}</Row>}

          {genres.length > 0 && (
            <Row label="Genre">
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <span key={g} className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] leading-none">
                    {g}
                  </span>
                ))}
              </div>
            </Row>
          )}

          {credits?.directors.length ? (
            <Row label={credits.directors.length === 1 ? "Director" : "Directors"}>
              {credits.directors.join(" · ")}
            </Row>
          ) : null}

          {credits?.creators.length ? (
            <Row label="Created by">{credits.creators.join(" · ")}</Row>
          ) : null}

          {credits?.writers.length ? (
            <Row label={credits.writers.length === 1 ? "Writer" : "Writers"}>
              {credits.writers.join(" · ")}
            </Row>
          ) : null}

          {canAskProviders && (
            <Row label="Cast">
              {credits === null ? (
                <span className="text-muted">Loading...</span>
              ) : credits.cast.length > 0 ? (
                credits.cast.join(" · ")
              ) : (
                <span className="text-muted">Cast unavailable</span>
              )}
            </Row>
          )}

          {/* Where it can be streamed now. Worth knowing for a watchlist
              entry above all, but a watched title is often worth a rewatch,
              so it is not hidden there. */}
          <Row label="Where to watch">
            {providers === null ? (
              <span className="text-muted">Checking...</span>
            ) : providers.length > 0 ? (
              <span className="font-semibold text-accent-2">{providers.join(" · ")}</span>
            ) : (
              <span className="text-muted">Not on any service here right now</span>
            )}
          </Row>

          {extra?.personalRating != null && (
            <Row label="Your rating">
              <span className="font-semibold text-amber-400">
                {extra.personalRating.toFixed(1)}
              </span>
            </Row>
          )}

          <Row label="Description">
            {extra === null ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                Loading...
              </span>
            ) : extra.overview ? (
              extra.overview
            ) : (
              <span className="text-muted">No synopsis for this one.</span>
            )}
          </Row>
        </div>

        {(onTrailer || extra?.link) && (
          <div className="flex flex-none gap-2 border-t border-white/5 p-4">
            {onTrailer && (
              <button
                type="button"
                onClick={onTrailer}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl bg-foreground text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                <Clapperboard className="h-4 w-4" strokeWidth={1.8} />
                Trailer
              </button>
            )}
            {extra?.link && (
              <a
                href={extra.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-none items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
                Open
              </a>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
