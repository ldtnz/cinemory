"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogTitle } from "@/lib/catalog-title";
import { Minus, Plus } from "lucide-react";
import PlatformPicker from "@/components/PlatformPicker";
import { toDateInputValue, fromDateInputValue } from "@/lib/date-input";
import { hasSeasonTotal } from "@/lib/season-counts";
import { useDialogFocus } from "@/lib/use-dialog-focus";

export type SeasonEdit = { watchedSeasons: number };

/** The −/value/+ row for how many seasons are watched. */
function Stepper({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  /** The total, when TMDB has one. Absent means no ceiling. */
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= 0}
          aria-label={`One fewer: ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground transition-opacity disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <span className="w-10 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={max !== undefined && value >= max}
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
 *  how many seasons of it are watched — for an import that guessed wrong, or a
 *  manual add where the date did not matter at the time.
 *  Edit mode only; a watchlist entry has none of these to correct yet (that's
 *  what "mark as watched" is for). */
export default function EditWatchedDialog({
  title,
  onConfirm,
  onCancel,
}: {
  title: CatalogTitle;
  onConfirm: (platform: string, lastWatchedAt: Date | null, seasons: SeasonEdit | null) => void;
  onCancel: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>();

  const [platform, setPlatform] = useState(title.platform);
  const [dateValue, setDateValue] = useState(
    title.lastWatchedAt ? toDateInputValue(title.lastWatchedAt) : "",
  );
  const [saving, setSaving] = useState(false);
  const series = title.mediaType === "Series";
  const [watched, setWatched] = useState(title.watchedSeasons ?? 0);
  // Read, never set: how many seasons exist is TMDB's answer, and the app
  // fetches it by itself. Here it is only the ceiling.
  const total = hasSeasonTotal(title.totalSeasons) ? (title.totalSeasons as number) : null;

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
        ref={dialogRef}
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

        {/* Only a series has progress to correct. How many seasons exist is
            not editable on purpose: TMDB is the source of it and the app asks
            for it on its own, so a number typed here would only be a second
            answer to disagree with. It is shown because it is the ceiling —
            the plus stops on it. */}
        {series && (
          <div className="space-y-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
              Seasons
            </span>
            <div className="space-y-2 rounded-2xl bg-surface-2/60 p-3">
              <Stepper
                label="Watched"
                value={watched}
                max={total ?? undefined}
                onChange={setWatched}
              />
              <p className="text-[11px] leading-relaxed text-muted">
                {total != null
                  ? `${total} ${total === 1 ? "season" : "seasons"} out in total, from TMDB.`
                  : "How many are out is not known yet — it is fetched from TMDB automatically."}
              </p>
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
                series ? { watchedSeasons: watched } : null,
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
