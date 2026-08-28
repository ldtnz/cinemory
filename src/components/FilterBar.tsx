"use client";

import Image from "next/image";
import Link from "next/link";
import { Settings, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PLATFORMS: { value: string; label: string }[] = [
  { value: "Netflix", label: "Netflix" },
  { value: "Amazon Prime Video", label: "Prime Video" },
  { value: "Disney+", label: "Disney+" },
  { value: "Cinema", label: "Cinema" },
];
const MEDIA_TYPES: { value: string; label: string }[] = [
  { value: "Movie", label: "Movie" },
  { value: "Series", label: "Series" },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "recent", label: "Recently watched" },
  { value: "title", label: "Title (A-Z)" },
  { value: "rating", label: "TMDB rating" },
  { value: "year", label: "Release year" },
];

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4 text-muted"
      aria-hidden
    >
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 17L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M5 5L15 15M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 text-muted" aria-hidden>
      <path
        d="M5.5 8L10 12.5L14.5 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex h-9 items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
        {label}
      </span>
      <div className="flex h-9 items-center gap-1 rounded-xl bg-surface p-1">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(active ? "" : opt.value)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium leading-none transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FilterBar({
  total,
  filteredTotal,
  q,
  onQChange,
  platform,
  onPlatformChange,
  mediaType,
  onMediaTypeChange,
  sort,
  onSortChange,
}: {
  total: number;
  filteredTotal: number;
  q: string;
  onQChange: (v: string) => void;
  platform: string;
  onPlatformChange: (v: string) => void;
  mediaType: string;
  onMediaTypeChange: (v: string) => void;
  sort: string;
  onSortChange: (v: string) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileRowRef = useRef<HTMLDivElement>(null);
  const [mobileRowWidth, setMobileRowWidth] = useState(0);

  // Width of the mobile row, measured so the title and the search field can
  // animate with a transition on "width" in pixels: reliable across browsers,
  // unlike animating flex-grow/flex-basis, which in practice snaps instead of
  // sliding.
  useEffect(() => {
    const element = mobileRowRef.current;
    if (!element) return;
    const measure = () => setMobileRowWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The modal has to be portalled out of the sticky/backdrop-blur container:
  // that CSS filter creates a containing block for "fixed" descendants, which
  // would otherwise position against it instead of the viewport.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock scrolling of the page underneath while the filter modal is open.
  useEffect(() => {
    if (!filtersOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [filtersOpen]);

  const hasActiveFilters = Boolean(platform || mediaType || q);

  // Fixed widths of the mobile row (in pixels, matching the Tailwind classes
  // used below: w-9 = 36px, gap-2 = 8px).
  const BUTTON_WIDTH = 36;
  const GAP = 8;
  const MAX_TITLE_WIDTH = 176; // 11rem
  const mobileRowFixedSpace = BUTTON_WIDTH * 2 + GAP * 3; // search button + filters button + 3 gaps
  const expandedInputWidth = Math.max(0, mobileRowWidth - mobileRowFixedSpace);
  const collapsedTitleWidth = Math.min(
    MAX_TITLE_WIDTH,
    Math.max(0, mobileRowWidth - mobileRowFixedSpace),
  );

  function closeMobileSearch() {
    onQChange("");
    setSearchExpanded(false);
  }

  // Move focus to the mobile field when search opens (the input stays mounted
  // the whole time, so autoFocus alone would not fire).
  useEffect(() => {
    if (searchExpanded) {
      const timeout = setTimeout(() => mobileSearchInputRef.current?.focus(), 300);
      return () => clearTimeout(timeout);
    }
  }, [searchExpanded]);

  return (
    <div className="sticky top-0 z-10 -mx-3 mb-6 space-y-3 bg-background/95 px-3 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-5 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="hidden sm:block">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Image
              src="/logo.png"
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 flex-none"
              priority
            />
            Cinemory
          </h1>
          <p className="text-xs text-muted">
            {filteredTotal.toLocaleString()} of{" "}
            {total.toLocaleString()} titles
          </p>
        </div>

        {/* Desktop: tutto in row */}
        <div className="hidden sm:flex sm:flex-col sm:gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <FilterGroup
              label="Platform"
              options={PLATFORMS}
              value={platform}
              onChange={onPlatformChange}
            />
            <FilterGroup
              label="Type"
              options={MEDIA_TYPES}
              value={mediaType}
              onChange={onMediaTypeChange}
            />
          </div>

          <div className="flex h-9 items-center gap-2">
            <div className="relative h-9 w-64">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => onQChange(e.target.value)}
                placeholder="Search for a title..."
                className="h-9 w-full rounded-xl bg-surface pl-9 pr-8 text-sm text-foreground outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => onQChange("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
                >
                  <ClearIcon />
                </button>
              )}
            </div>

            <div className="relative h-9">
              <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value)}
                className="h-9 appearance-none rounded-xl bg-surface pl-3 pr-8 text-sm text-foreground outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                <ChevronIcon />
              </span>
            </div>

            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Settings className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          </div>
        </div>

        {/* Mobile: one compact row; the search button expands into a text
            field, hiding the title and count; filters and sorting live in a
            modal */}
        <div ref={mobileRowRef} className="flex h-9 items-center gap-2 sm:hidden">
          {/* Title + count: shrinks and fades when search opens.
              Width animated in pixels (measured at runtime) rather than with
              flex-grow/flex-basis, which snaps instead of sliding on some
              browsers. */}
          <div
            className={`flex-none overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${
              searchExpanded ? "opacity-0" : "opacity-100"
            }`}
            style={{ width: searchExpanded ? 0 : collapsedTitleWidth }}
          >
            <h1 className="flex items-center gap-1.5 truncate text-base font-semibold tracking-tight">
              <Image
                src="/logo.png"
                alt=""
                width={16}
                height={16}
                className="h-4 w-4 flex-none"
                priority
              />
              Cinemory
            </h1>
            <p className="truncate text-[11px] text-muted">
              {filteredTotal.toLocaleString()} of{" "}
              {total.toLocaleString()} titles
            </p>
          </div>

          {/* Search + filters: always anchored to the right of the row.
              Only one element animates its own width (the text field); the
              search/close button stays put, so there are no nested animations
              drifting out of sync. */}
          <div className="ml-auto flex h-9 items-center gap-2">
            <div
              className={`relative h-9 flex-none overflow-hidden transition-all duration-300 ease-in-out ${
                searchExpanded ? "opacity-100" : "opacity-0"
              }`}
              style={{ width: searchExpanded ? expandedInputWidth : 0 }}
            >
              {/* text-base below sm: under 16px iOS zooms in on its own
                  when the field takes focus. */}
              <input
                ref={mobileSearchInputRef}
                type="search"
                value={q}
                onChange={(e) => onQChange(e.target.value)}
                placeholder="Search for a title..."
                tabIndex={searchExpanded ? 0 : -1}
                className="h-9 w-full rounded-xl bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => onQChange("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
                >
                  <ClearIcon />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => (searchExpanded ? closeMobileSearch() : setSearchExpanded(true))}
              aria-label={searchExpanded ? "Close search" : "Search"}
              title={searchExpanded ? "Close search" : "Search"}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {searchExpanded ? <X className="h-4 w-4" strokeWidth={1.8} /> : <SearchIcon />}
            </button>

            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label="Filters and sorting"
              title="Filters and sorting"
              className="relative flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} />
              {hasActiveFilters && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-2" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {filtersOpen && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:hidden">
          <div className="max-h-[85vh] w-full max-w-md space-y-5 overflow-y-auto rounded-t-3xl border border-white/10 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filtri e ordinamento</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                Platform
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((opt) => {
                  const active = platform === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onPlatformChange(active ? "" : opt.value)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium leading-none transition-colors ${
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
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                Tipo
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MEDIA_TYPES.map((opt) => {
                  const active = mediaType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onMediaTypeChange(active ? "" : opt.value)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium leading-none transition-colors ${
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
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                Sort by
              </span>
              <div className="relative h-10">
                <select
                  value={sort}
                  onChange={(e) => onSortChange(e.target.value)}
                  className="h-10 w-full appearance-none rounded-xl bg-surface-2 pl-3 pr-8 text-base text-foreground outline-none sm:text-sm"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                  <ChevronIcon />
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    onQChange("");
                    onPlatformChange("");
                    onMediaTypeChange("");
                    setFiltersOpen(false);
                  }}
                  className="flex-1 rounded-xl bg-surface-2 py-2.5 text-sm font-medium text-muted hover:text-foreground"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="flex-1 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background hover:opacity-90"
              >
                Applica
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
