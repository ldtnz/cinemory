"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogTitle } from "@/lib/catalog-title";
import PlatformPicker from "@/components/PlatformPicker";
import { toDateInputValue, fromDateInputValue } from "@/lib/date-input";
import { useDialogFocus } from "@/lib/use-dialog-focus";

/** Moving a title off the watchlist needs two more things than a plain
 *  confirmation: where it was watched, and when — watchlist entries carry
 *  neither, and the catalog filters/sorts on both, so they're picked here.
 *  The date defaults to today (not everything gets marked the moment it's
 *  watched) but is editable, the same as the "Add title" flow.
 *
 *  Several titles at once (a shift-click selection) are asked the same two
 *  questions once, on the reasoning that a batch marked together was watched
 *  together — the same assumption the "Add title" flow already makes. */
export default function MarkWatchedDialog({
  titles,
  onConfirm,
  onCancel,
}: {
  titles: CatalogTitle[];
  onConfirm: (platform: string, lastWatchedAt: Date | null) => void;
  onCancel: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>();

  const title = titles[0];
  const batch = titles.length > 1;
  const [platform, setPlatform] = useState("");
  const [watchedDate, setWatchedDate] = useState(() => toDateInputValue(new Date()));
  const [saving, setSaving] = useState(false);
  // The synopsis is not part of the catalog the page hands the client — it
  // would be several hundred characters on every row for four lines shown
  // here, one title at a time. So it is fetched for this one, and the panel
  // simply has no synopsis line until it arrives (or if there is none).
  const [overview, setOverview] = useState<string | null>(null);

  useEffect(() => {
    if (batch || !title) return;
    let current = true;
    void (async () => {
      const res = await fetch(`/api/titles/${title.id}`).catch(() => null);
      if (!res?.ok || !current) return;
      const data = (await res.json().catch(() => null)) as { overview?: string | null } | null;
      if (current) setOverview(data?.overview ?? null);
    })();
    return () => {
      current = false;
    };
  }, [batch, title]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="app-modal-overlay overlay-in fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={batch ? `Mark ${titles.length} titles as watched` : `Mark ${title.title} as watched`}
        onClick={(e) => e.stopPropagation()}
        className="app-modal-panel dialog-in flex w-[min(94vw,460px)] flex-col gap-5 rounded-3xl p-6"
      >
        {batch ? (
          <div className="flex items-center gap-4">
            <div className="flex flex-none -space-x-6">
              {titles.slice(0, 4).map((t) => (
                <div
                  key={t.id}
                  className="relative h-28 w-[4.75rem] overflow-hidden rounded-lg border border-white/10 bg-surface-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]"
                >
                  {t.posterUrl ? (
                    <Image src={t.posterUrl} alt={t.title} fill unoptimized sizes="76px" className="object-cover" />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-lg font-semibold leading-snug">{titles.length} titles</p>
              <p className="line-clamp-3 text-xs text-muted">
                {titles.map((t) => t.title).join(", ")}
              </p>
            </div>
          </div>
        ) : (
        <div className="flex gap-4">
          <div className="relative h-52 w-[8.5rem] flex-none overflow-hidden rounded-xl bg-surface-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]">
            {title.posterUrl ? (
              <Image
                src={title.posterUrl}
                alt={title.title}
                fill
                unoptimized
                sizes="136px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 self-center space-y-1.5">
            <p className="line-clamp-3 text-lg font-semibold leading-snug">{title.title}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              <span>{[title.mediaType, title.year].filter(Boolean).join(" · ")}</span>
              {title.tmdbRating ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-semibold text-amber-400">
                    ★ {title.tmdbRating.toFixed(1)}
                  </span>
                </>
              ) : null}
            </div>
            {title.mediaType === "Series" && (title.totalSeasons ?? 0) > 0 && (
              <p className="text-xs text-muted">
                {title.totalSeasons} {title.totalSeasons === 1 ? "season" : "seasons"}
              </p>
            )}
            {title.genres && <p className="text-xs text-muted/80">{title.genres}</p>}
            {overview && (
              <p className="line-clamp-4 text-[11px] leading-snug text-muted/80">{overview}</p>
            )}
          </div>
        </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor="mark-watched-date"
            className="text-[11px] font-medium uppercase tracking-wide text-muted/80"
          >
            When did you watch {batch ? "them" : "it"}?
          </label>
          <input
            id="mark-watched-date"
            type="date"
            value={watchedDate}
            onChange={(e) => setWatchedDate(e.target.value)}
            max={toDateInputValue(new Date())}
            className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm text-foreground outline-none [color-scheme:dark] focus:ring-2 focus:ring-white/20"
          />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
            Where did you watch {batch ? "them" : "it"}?
          </span>
          <PlatformPicker value={platform} onChange={setPlatform} />
        </div>

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
              onConfirm(platform, fromDateInputValue(watchedDate));
            }}
            className="flex-1 rounded-2xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Mark as watched"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
