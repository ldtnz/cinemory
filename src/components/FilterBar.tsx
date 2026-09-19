"use client";

import Image from "next/image";
import Select from "@/components/Select";
import Link from "next/link";
import { BarChart3, Settings, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WATCH_MODES, type WatchMode } from "@/lib/watch-mode";
import PlatformPicker from "@/components/PlatformPicker";
import AiSearchHint, { type AiSearchHintState } from "@/components/AiSearchHint";

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

/** The Watched / To watch switch. Not a filter like the others: it picks
 *  which half of the catalog the whole page is about, so it reads as a
 *  segmented control rather than a toggleable chip.
 *
 *  `label` is for the desktop row, where it sits among labelled filter
 *  groups and needs the same signposting; the floating mobile pill is a
 *  control on its own and reads fine without it. */
function WatchModeSwitch({
  mode,
  onModeChange,
  label,
  className = "",
  size = "compact",
}: {
  mode: WatchMode;
  onModeChange: (m: WatchMode) => void;
  label?: string;
  className?: string;
  /** "roomy" is the floating pill on mobile, which is the main way the two
   *  halves are switched there and so is sized to be reached with a thumb,
   *  rather than to sit in a row of desktop filter chips. */
  size?: "compact" | "roomy";
}) {
  const roomy = size === "roomy";
  const tablist = (
    <div
      role="tablist"
      aria-label="Watched or to watch"
      className={`flex items-center gap-1 rounded-2xl ${
        roomy ? "h-12 p-1.5" : "h-9 rounded-xl p-1"
      } ${className}`}
    >
      {WATCH_MODES.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onModeChange(opt.value)}
            className={`flex-1 whitespace-nowrap font-medium leading-none transition-colors ${
              roomy ? "rounded-xl px-6 py-3 text-sm" : "rounded-lg px-2.5 py-1.5 text-xs"
            } ${
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
  );

  if (!label) return tablist;

  return (
    <div className="flex h-9 items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
        {label}
      </span>
      {tablist}
    </div>
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
  mode,
  onModeChange,
  platform,
  onPlatformChange,
  mediaType,
  onMediaTypeChange,
  genre,
  onGenreChange,
  availableGenres,
  sort,
  onSortChange,
  countLabel,
  aiSearchHint = null,
  onAiSearch,
}: {
  total: number;
  filteredTotal: number;
  /** Replaces the "x of y titles" line when that phrasing does not fit —
   *  the watchlist search lists TMDB results, not a slice of the catalog. */
  countLabel?: string;
  q: string;
  onQChange: (v: string) => void;
  mode: WatchMode;
  onModeChange: (m: WatchMode) => void;
  platform: string;
  onPlatformChange: (v: string) => void;
  mediaType: string;
  onMediaTypeChange: (v: string) => void;
  /** Empty string means "any genre" — same convention as platform/mediaType. */
  genre: string;
  onGenreChange: (v: string) => void;
  /** Every genre actually present in the catalog, alphabetized. Not a fixed
   *  list like platforms or media types, since it depends on what's watched. */
  availableGenres: string[];
  sort: string;
  onSortChange: (v: string) => void;
  /** Null hides the "search with AI" tooltip; it hangs off the search field
   *  itself, which is why it is rendered here and not next to the results. */
  aiSearchHint?: AiSearchHintState | null;
  onAiSearch?: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [desktopFilterOpen, setDesktopFilterOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const desktopFilterRef = useRef<HTMLDivElement>(null);
  const mobileRowRef = useRef<HTMLDivElement>(null);
  const [mobileRowWidth, setMobileRowWidth] = useState(0);
  // The watch switch only joins the compact row once there is room for it
  // (tablets). Its width is measured rather than assumed, because it is two
  // words of text: `hidden` below that width makes this 0 on a phone, which
  // is exactly what the arithmetic below wants.
  const watchSwitchRef = useRef<HTMLDivElement>(null);
  const [watchSwitchWidth, setWatchSwitchWidth] = useState(0);

  // "Any genre" is an option like the others now that the list is drawn
  // rather than left to the browser, and the empty value is what clears the
  // filter — same as the <option value=""> it replaces.
  const genreOptions = [
    { value: "", label: "Any genre" },
    ...availableGenres.map((g) => ({ value: g, label: g })),
  ];

  // Close the desktop filter dropdown on an outside click or Escape.
  useEffect(() => {
    if (!desktopFilterOpen) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (desktopFilterRef.current?.contains(target)) return;
      // The genre and sort lists are portalled to the body, so they are
      // outside this panel in the DOM while being part of it on screen.
      if ((target as Element).closest?.("[data-select-panel]")) return;
      setDesktopFilterOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDesktopFilterOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [desktopFilterOpen]);

  // Width of the mobile row, measured so the title and the search field can
  // animate with a transition on "width" in pixels: reliable across browsers,
  // unlike animating flex-grow/flex-basis, which in practice snaps instead of
  // sliding.
  useEffect(() => {
    const element = mobileRowRef.current;
    const watchSwitch = watchSwitchRef.current;
    if (!element) return;
    const measure = () => {
      setMobileRowWidth(element.clientWidth);
      setWatchSwitchWidth(watchSwitch?.offsetWidth ?? 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (watchSwitch) observer.observe(watchSwitch);
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

  const hasActiveFilters = Boolean(platform || mediaType || genre || q);

  // Fixed widths of the mobile row (in pixels, matching the Tailwind classes
  // used below: w-9 = 36px, gap-2 = 8px).
  const BUTTON_WIDTH = 36;
  const GAP = 8;
  const MAX_TITLE_WIDTH = 176; // 11rem
  // Everything to the right of the search field: the four buttons and the
  // gaps between them and it.
  const SEARCH_ROW_RIGHT = BUTTON_WIDTH * 4 + GAP * 4;
  // ...plus the gap that separates the whole right-hand group from what
  // precedes it, and the watch switch when a tablet is wide enough for it.
  const mobileRowFixedSpace =
    SEARCH_ROW_RIGHT + GAP + (watchSwitchWidth > 0 ? watchSwitchWidth + GAP : 0);
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

  // Open the app, press Tab, start typing: the shortcut this page is used
  // with. It used to fire on every Tab, which meant the page had no tab order
  // at all — the cards, the filters, the settings link were unreachable
  // without a pointer, because focus was pulled back to the search field on
  // every press. It now only fires while nothing is focused yet, so it still
  // works as the first thing you do and Tab goes back to being Tab once you
  // are somewhere. "/" does the same from anywhere, the way it does on every
  // site with a search box.
  //
  // A dialog or menu on top of the page is left alone either way: Tab has to
  // keep moving between its own fields rather than being hijacked out to a
  // field nobody can see.
  useEffect(() => {
    function focusSearch() {
      if (window.innerWidth < 640) {
        if (!searchExpanded) setSearchExpanded(true);
        else mobileSearchInputRef.current?.focus();
        return;
      }
      desktopSearchInputRef.current?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;

      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (e.key === "/" && !typing) {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (e.key !== "Tab") return;
      // Something already has focus: this Tab belongs to whoever has it.
      if (active && active !== document.body && active !== document.documentElement) return;
      e.preventDefault();
      focusSearch();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchExpanded]);

  return (
    <div className="catalog-header sticky top-0 z-10 -mx-3 mb-[1.05rem] space-y-3 bg-background/95 px-3 pb-[0.7rem] pt-[calc(0.7rem+env(safe-area-inset-top))] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-5 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="hidden lg:block">
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
            {countLabel ??
              `${filteredTotal.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} titles`}
          </p>
        </div>

        {/* The desktop header, which only exists when the whole of it fits on one
            row. Below that the compact row below takes over — a half-desktop
            header that wraps onto two lines reads as broken rather than as
            adapted. */}
        <div className="hidden lg:flex lg:flex-row lg:items-center lg:gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <WatchModeSwitch
              mode={mode}
              onModeChange={onModeChange}
              label="Status"
              className="bg-surface"
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
                ref={desktopSearchInputRef}
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
              {aiSearchHint && onAiSearch && (
                <AiSearchHint
                  {...aiSearchHint}
                  onSearch={onAiSearch}
                  className="absolute inset-x-0 top-full z-20 mt-2"
                />
              )}
            </div>

            <div ref={desktopFilterRef} className="relative">
              <button
                type="button"
                onClick={() => setDesktopFilterOpen((v) => !v)}
                aria-label="Filter and sort"
                title="Filter and sort"
                className="relative flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} />
                {(platform || genre) && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-2" aria-hidden />
                )}
              </button>

              {desktopFilterOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Filters and sort"
                  className="absolute right-0 top-full z-20 mt-2 w-56 space-y-4 rounded-2xl border border-white/10 bg-surface p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
                >
                  <div className="space-y-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                      Platform
                    </span>
                    <PlatformPicker value={platform} onChange={onPlatformChange} clearable />
                  </div>

                  {availableGenres.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                        Genre
                      </span>
                      <Select
                        value={genre}
                        onChange={onGenreChange}
                        options={genreOptions}
                        ariaLabel="Genre"
                        className="h-9 w-full"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                      Sort by
                    </span>
                    <Select
                      value={sort}
                      onChange={onSortChange}
                      options={SORT_OPTIONS}
                      ariaLabel="Sort by"
                      className="h-9 w-full"
                    />
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/stats"
              aria-label="Statistics"
              title="Statistics"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <BarChart3 className="h-4 w-4" strokeWidth={1.8} />
            </Link>

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
        <div ref={mobileRowRef} className="relative flex h-9 items-center gap-2 lg:hidden">
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
              {countLabel ??
                `${filteredTotal.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} titles`}
            </p>
          </div>

          {/* Search + filters: always anchored to the right of the row.
              Only one element animates its own width (the text field); the
              search/close button stays put, so there are no nested animations
              drifting out of sync. */}
          <div className="ml-auto flex h-9 items-center gap-2">
            {/* Tablets are wide enough to keep the switch in the header, and
                with the same label the desktop row gives it, so the
                thumb-sized pill floating over the grid is only for phones.
                It stays put when search opens: the title gives up its width
                for the field, this does not. */}
            <div ref={watchSwitchRef} className="hidden flex-none md:block">
              <WatchModeSwitch
                mode={mode}
                onModeChange={onModeChange}
                label="Status"
                className="bg-surface"
              />
            </div>

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
                className="h-9 w-full rounded-xl bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
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

            <Link
              href="/stats"
              aria-label="Statistics"
              title="Statistics"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <BarChart3 className="h-4 w-4" strokeWidth={1.8} />
            </Link>

            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Settings className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          </div>

          {/* Hung off the whole row rather than off the field itself, which
              lives in an overflow-hidden box (it animates its width open and
              shut) that would clip anything below it. The row is wider than
              the field by the four buttons on its right, so it is padded back
              down to the field's own span and the bubble centres on that —
              centred under what it belongs to, and still never clipped. */}
          {aiSearchHint && onAiSearch && (
            <AiSearchHint
              {...aiSearchHint}
              onSearch={onAiSearch}
              className="absolute inset-x-0 top-full z-20 mt-2"
              style={
                searchExpanded
                  ? {
                      paddingLeft: Math.max(
                        0,
                        mobileRowWidth - SEARCH_ROW_RIGHT - expandedInputWidth,
                      ),
                      paddingRight: SEARCH_ROW_RIGHT,
                    }
                  : undefined
              }
            />
          )}
        </div>

      </div>

      {/* Mobile: a pill floating just above the bottom of the viewport
          instead of a row in the header. Portalled for the same reason as
          the modal below — the sticky header's backdrop-blur would otherwise
          be the containing block for anything "fixed" inside it. */}
      {mounted && createPortal(
        <div className="watch-mode-pill fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-3 md:hidden">
          <WatchModeSwitch
            mode={mode}
            onModeChange={onModeChange}
            size="roomy"
            // Same glass as the header: opaque enough to read against a
            // poster, and it lets the grid show through as it scrolls under.
            className="border border-white/10 bg-background/95 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.85)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
          />
        </div>,
        document.body,
      )}

      {filtersOpen && mounted && createPortal(
        <div className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm lg:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters and sort"
            className="sheet-in max-h-[85vh] w-full max-w-md space-y-5 overflow-y-auto rounded-t-3xl border border-white/10 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filters and sort</h2>
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
              <PlatformPicker value={platform} onChange={onPlatformChange} clearable />
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                Type
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

            {availableGenres.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                  Genre
                </span>
                <Select
                  value={genre}
                  onChange={onGenreChange}
                  options={genreOptions}
                  ariaLabel="Genre"
                  className="w-full"
                />
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                Sort by
              </span>
              <Select
                value={sort}
                onChange={onSortChange}
                options={SORT_OPTIONS}
                ariaLabel="Sort by"
                className="w-full"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    onQChange("");
                    onPlatformChange("");
                    onMediaTypeChange("");
                    onGenreChange("");
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
                Apply
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
