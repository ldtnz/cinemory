"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

/**
 * The app's dropdown, replacing every native <select>.
 *
 * `appearance-none` and a drawn chevron only ever fixed the closed state: the
 * list a native select opens is the operating system's, and no CSS reaches it.
 * On a dark page that meant a white macOS menu, or a full-height iOS wheel,
 * appearing out of nowhere — so the list is drawn here too.
 *
 * It is portalled to the body and positioned with fixed coordinates rather
 * than absolutely inside the trigger, because two of its callers sit in
 * scrolling boxes (the filter sheet, the setup wizard) that would otherwise
 * clip it. That also means it has to close on scroll: a panel pinned to
 * viewport coordinates would sit still while the page moved underneath it.
 */
export default function Select({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Readonly so an `as const` list (LANGUAGES, REGIONS) passes as it is. */
  options: readonly SelectOption[];
  /** Named by a visible label in most places; supplied where there is none. */
  ariaLabel?: string;
  /** Layout only — width and flex behaviour from the caller. Everything
   *  else (height, colour, radius) is the component's own, so the eight
   *  dropdowns in the app cannot drift apart. */
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const selected = options.find((o) => o.value === value);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  // Where the panel goes, measured when it opens: below the trigger, or above
  // it when the space below is too tight to be useful.
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    above: boolean;
  } | null>(null);

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 6;
    const MARGIN = 8;
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    // Enough room for a few rows, or it is not worth opening downwards.
    const useAbove = below < 160 && above > below;
    setBox({
      left: r.left,
      top: useAbove ? r.top - GAP : r.bottom + GAP,
      width: r.width,
      maxHeight: Math.max(120, Math.min(288, useAbove ? above : below)),
      above: useAbove,
    });
  }

  function openList() {
    if (disabled) return;
    place();
    setActive(selectedIndex);
    setOpen(true);
  }

  // Keep the highlighted row in view when it is moved by the keyboard, and
  // start on the current value rather than at the top of a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: Event) {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    }
    // Fixed coordinates do not follow a scrolling page, so the panel closes
    // instead of drifting away from the field it belongs to. Scrolling inside
    // the list is not that: a list too long to fit is meant to be scrolled,
    // and closing it on the first wheel turn made the longer ones (languages,
    // regions, genres) unusable. Only movement outside it counts.
    function onDismiss(e: Event) {
      const t = e.target as Node | null;
      if (t && listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [open]);

  function commit(i: number) {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        // Type-ahead, the one native behaviour worth keeping: a single letter
        // jumps to the next option starting with it.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const from = active + 1;
          const order = [...options.slice(from), ...options.slice(0, from)];
          const hit = order.find((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
          if (hit) setActive(options.indexOf(hit));
        }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex h-10 items-center justify-between gap-2 rounded-xl border border-white/5 bg-surface-2 px-3 text-left text-sm text-foreground transition-colors outline-none hover:bg-surface-3 focus-visible:border-white/30 disabled:opacity-50 ${className}`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          className={`h-4 w-4 flex-none text-muted transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.8}
        />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={`${id}-opt-${active}`}
            style={{
              left: box.left,
              top: box.above ? undefined : box.top,
              bottom: box.above ? window.innerHeight - box.top : undefined,
              width: box.width,
              maxHeight: box.maxHeight,
            }}
            className="tooltip-in fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-surface/95 p-1 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur"
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                id={`${id}-opt-${i}`}
                type="button"
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-white/10 text-foreground" : "text-muted"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && (
                  <Check className="h-3.5 w-3.5 flex-none text-accent-2" strokeWidth={2.4} />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
