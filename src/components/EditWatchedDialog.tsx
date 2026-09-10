"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Title } from "@prisma/client";
import PlatformPicker from "@/components/PlatformPicker";
import { toDateInputValue, fromDateInputValue } from "@/lib/date-input";

/** Corrects an already-watched title's platform or watched date — for an
 *  import that guessed wrong, or a manual add where the date did not
 *  matter at the time. Edit mode only; a watchlist entry has neither value
 *  to correct yet (that's what "mark as watched" is for). */
export default function EditWatchedDialog({
  title,
  onConfirm,
  onCancel,
}: {
  title: Title;
  onConfirm: (platform: string, lastWatchedAt: Date | null) => void;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState(title.platform);
  const [dateValue, setDateValue] = useState(
    title.lastWatchedAt ? toDateInputValue(title.lastWatchedAt) : "",
  );
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
        aria-label={`Edit ${title.title}`}
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(94vw,460px)] flex-col gap-5 rounded-3xl border border-white/10 bg-surface p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
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
              onConfirm(platform, fromDateInputValue(dateValue));
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
