"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Title } from "@prisma/client";
import type { TmdbCandidate } from "@/lib/tmdb";

/** A TMDB search result in the "To watch" grid: click (or tap) to put it on
 *  the watchlist. The "+" only shows on hover on desktop; on touch there is
 *  no hover, but the whole tile is the button, so a tap adds it anyway. */
export default function DiscoverCard({
  candidate,
  alreadyOnWatchlist,
  priority = false,
  onAdded,
}: {
  candidate: TmdbCandidate;
  alreadyOnWatchlist: boolean;
  priority?: boolean;
  onAdded: (title: Title) => void;
}) {
  const [state, setState] = useState<"idle" | "adding" | "added" | "error">(
    alreadyOnWatchlist ? "added" : "idle",
  );

  const done = state === "added";

  async function add() {
    if (done || state === "adding") return;
    setState("adding");
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate, watchlist: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          title: Title & { lastWatchedAt: string | null; createdAt: string; updatedAt: string };
        };
        onAdded({
          ...data.title,
          lastWatchedAt: data.title.lastWatchedAt ? new Date(data.title.lastWatchedAt) : null,
          createdAt: new Date(data.title.createdAt),
          updatedAt: new Date(data.title.updatedAt),
        });
        setState("added");
        return;
      }
      // 409 means it is already in the catalog — treat it as done rather than
      // as a failure, the outcome the user wanted is already true.
      setState(res.status === 409 ? "added" : "error");
    } catch {
      setState("error");
    }
  }

  const subtitle = [candidate.mediaType, candidate.year].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={add}
      disabled={done}
      aria-label={done ? `${candidate.title} is on your watchlist` : `Add ${candidate.title} to your watchlist`}
      className="group relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 text-left disabled:cursor-default"
    >
      {candidate.posterUrl ? (
        <Image
          src={candidate.posterUrl}
          alt={candidate.title}
          fill
          unoptimized
          sizes="(max-width: 640px) 30vw, (max-width: 1024px) 16vw, 10vw"
          className="pointer-events-none object-cover"
          priority={priority}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-3 text-center">
          <span className="line-clamp-4 text-[10.5px] leading-tight text-muted">
            {candidate.title}
          </span>
        </div>
      )}

      {/* Already on the watchlist: a permanent, quieter marker instead of the
          hover affordance, so it reads as "done" and not as "click me". */}
      {done ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70">
          <Check className="h-6 w-6 text-accent-2" strokeWidth={2.2} />
          <span className="px-2 text-center text-[10px] font-medium text-white/80">
            On your watchlist
          </span>
        </span>
      ) : (
        <span
          className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity duration-150 ${
            state === "adding" ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
        >
          {state === "adding" ? (
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          ) : (
            <Plus className="h-8 w-8 text-white" strokeWidth={2} />
          )}
        </span>
      )}

      {/* Title strip: these are unfamiliar titles, so it stays readable
          under the hover overlay rather than only appearing with it. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2.5 pt-7">
        <span className="line-clamp-2 block text-[11px] font-medium leading-tight text-white">
          {candidate.title}
        </span>
        <span className="mt-0.5 flex items-center justify-between text-[10px] text-neutral-300">
          <span className="truncate">{subtitle}</span>
          {candidate.tmdbRating ? (
            <span className="ml-1 flex-none font-semibold text-amber-400">
              ★ {candidate.tmdbRating.toFixed(1)}
            </span>
          ) : null}
        </span>
      </span>

      {state === "error" && (
        <span className="absolute inset-x-1.5 top-1.5 rounded-lg bg-red-500/90 px-2 py-1 text-center text-[10px] font-medium text-white">
          Could not add
        </span>
      )}
    </button>
  );
}
