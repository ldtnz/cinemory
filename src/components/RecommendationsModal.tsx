"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EnrichedRecommendation } from "@/lib/recommendations";

export default function RecommendationsModal({
  titles,
  onClose,
}: {
  titles: EnrichedRecommendation[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <h2 className="text-sm font-semibold">Recommended for you</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          {titles.map((rec) => (
            <li key={rec.tmdbId} className="flex gap-3 rounded-2xl bg-surface-2 p-2.5">
              <div className="relative h-24 w-16 flex-none overflow-hidden rounded-lg bg-surface">
                {rec.posterUrl && (
                  <Image
                    src={rec.posterUrl}
                    alt={rec.title}
                    fill
                    unoptimized
                    sizes="64px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1 py-0.5">
                <p className="text-sm font-medium text-foreground">{rec.title}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span>{rec.mediaType}</span>
                  {rec.year && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{rec.year}</span>
                    </>
                  )}
                  {rec.tmdbRating ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-amber-400">★ {rec.tmdbRating.toFixed(1)}</span>
                    </>
                  ) : null}
                </div>
                <p className="text-[11px] leading-snug text-muted/80">{rec.reason}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
