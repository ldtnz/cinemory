"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Title } from "@prisma/client";
import PlatformPicker from "@/components/PlatformPicker";

/** Moving a title off the watchlist needs one more thing than a plain
 *  confirmation: where it was watched. Watchlist entries carry no platform,
 *  and the catalog filters by it, so it has to be picked here. */
export default function MarkWatchedDialog({
  title,
  onConfirm,
  onCancel,
}: {
  title: Title;
  onConfirm: (platform: string) => void;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Mark ${title.title} as watched`}
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(94vw,460px)] flex-col gap-5 rounded-3xl border border-white/10 bg-surface p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
      >
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
            {title.mediaType === "Series" && title.totalSeasons != null && (
              <p className="text-xs text-muted">
                {title.totalSeasons} {title.totalSeasons === 1 ? "season" : "seasons"}
              </p>
            )}
            {title.genres && <p className="text-xs text-muted/80">{title.genres}</p>}
            {title.overview && (
              <p className="line-clamp-4 text-[11px] leading-snug text-muted/80">
                {title.overview}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
            Where did you watch it?
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
              onConfirm(platform);
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
