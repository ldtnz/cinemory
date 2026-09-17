"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Title } from "@prisma/client";
import { Minus, Plus } from "lucide-react";
import PlatformPicker from "@/components/PlatformPicker";
import { toDateInputValue, fromDateInputValue } from "@/lib/date-input";
import { hasSeasonTotal } from "@/lib/season-counts";

export type SeasonEdit = { watchedSeasons: number; totalSeasons: number | null };

/** One −/value/+ row, which the two season counts both are. */
function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  unknownLabel,
}: {
  label: string;
  value: number | null;
  onChange: (next: number) => void;
  min: number;
  max?: number;
  /** What to show in place of a number when there is none. */
  unknownLabel?: string;
}) {
  const shown = value ?? min;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(shown - 1)}
          disabled={value == null || shown <= min}
          aria-label={`One fewer: ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground transition-opacity disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <span className="w-10 text-center text-sm font-semibold tabular-nums">
          {value == null ? (unknownLabel ?? min) : value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value == null ? min : shown + 1)}
          disabled={max !== undefined && value != null && shown >= max}
          aria-label={`One more: ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground transition-opacity disabled:opacity-30"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/** Corrects an already-watched title: platform, watched date, and for a series
 *  how many seasons are watched out of how many exist — for an import that
 *  guessed wrong, or a manual add where the date did not matter at the time.
 *  Edit mode only; a watchlist entry has none of these to correct yet (that's
 *  what "mark as watched" is for). */
export default function EditWatchedDialog({
  title,
  onConfirm,
  onCancel,
}: {
  title: Title;
  onConfirm: (platform: string, lastWatchedAt: Date | null, seasons: SeasonEdit | null) => void;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState(title.platform);
  const [dateValue, setDateValue] = useState(
    title.lastWatchedAt ? toDateInputValue(title.lastWatchedAt) : "",
  );
  const [saving, setSaving] = useState(false);
  const series = title.mediaType === "Series";
  const [watched, setWatched] = useState(title.watchedSeasons ?? 0);
  // Null is "unknown", which is both a total nobody has asked TMDB for and one
  // TMDB had no answer to; neither is a number to show.
  const [total, setTotal] = useState<number | null>(
    hasSeasonTotal(title.totalSeasons) ? title.totalSeasons : null,
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${title.title}`}
        onClick={(e) => e.stopPropagation()}
        className="dialog-in flex w-[min(94vw,460px)] flex-col gap-5 rounded-3xl border border-white/10 bg-surface p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
      >
        <div className="flex gap-4">
          <div className="relative h-36 w-24 flex-none overflow-hidden rounded-xl bg-surface-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]">
            {title.posterUrl ? (
              <Image
                src={title.posterUrl}
                alt={title.title}
                fill
                unoptimized
                sizes="96px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 self-center">
            <p className="line-clamp-3 text-base font-semibold leading-snug">{title.title}</p>
            <p className="mt-1 text-xs text-muted">
              {[title.mediaType, title.year].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="edit-watched-date" className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
            When did you watch it?
          </label>
          <input
            id="edit-watched-date"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm text-foreground outline-none [color-scheme:dark] focus:ring-2 focus:ring-white/20"
          />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
            Where did you watch it?
          </span>
          <PlatformPicker value={platform} onChange={setPlatform} />
        </div>

        {/* Only a series has seasons, and only here can the total be corrected
            by hand — TMDB fills it in, but it is wrong or missing often enough
            to be worth a control. Watched can never exceed the total: the plus
            stops at it, and lowering the total pulls watched down with it, so
            the pair cannot be left contradicting itself. */}
        {series && (
          <div className="space-y-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
              Seasons
            </span>
            <div className="space-y-2 rounded-2xl bg-surface-2/60 p-3">
              <Stepper
                label="Watched"
                value={watched}
                min={0}
                max={hasSeasonTotal(total) ? (total as number) : undefined}
                onChange={setWatched}
              />
              <Stepper
                label="Out in total"
                value={total}
                min={1}
                unknownLabel="?"
                onChange={(next) => {
                  setTotal(next);
                  if (next < watched) setWatched(next);
                }}
              />
              {!hasSeasonTotal(total) && (
                <p className="pt-1 text-[11px] leading-relaxed text-muted">
                  How many exist is not known — set it here, or let Settings fetch it from TMDB.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-surface-2 py-2.5 text-sm font-medium text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!platform || saving}
            onClick={() => {
              setSaving(true);
              onConfirm(
                platform,
                fromDateInputValue(dateValue),
                series ? { watchedSeasons: watched, totalSeasons: total } : null,
              );
            }}
            className="flex-1 rounded-2xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
