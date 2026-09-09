"use client";

import { PLATFORMS } from "@/lib/platforms";

/**
 * The row of platform pills, shared by the filter bar, "mark as watched" and
 * "add title" — used to be `flex flex-wrap` copy-pasted into each, which
 * with as many platforms as there now are wrapped onto four or five rows and
 * made every picker feel tall. This instead fills exactly two rows and
 * scrolls sideways for the rest: a CSS grid in column-major order
 * (grid-flow-col + grid-rows-2) does the layout, no JS involved.
 */
export default function PlatformPicker({
  value,
  onChange,
  className = "",
  clearable = false,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Clicking the already-active pill clears the selection instead of doing
   *  nothing — for a filter, where "no platform" is a valid state, unlike a
   *  "mark as watched" or "add title" picker, which always needs one. */
  clearable?: boolean;
}) {
  return (
    <div
      className={`grid grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 ${className}`}
    >
      {PLATFORMS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(clearable && active ? "" : opt.value)}
            className={`flex-none whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium leading-none transition-colors ${
              active
                ? "bg-foreground text-background"
                : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
