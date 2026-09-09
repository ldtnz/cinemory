import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { needsSetup } from "@/lib/settings";
import { computeStats, type Bucket } from "@/lib/stats";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

/**
 * A horizontal bar chart, in CSS. A charting library would be several times
 * the size of everything else on the page for four rows of rectangles.
 */
function Bars({
  title,
  buckets,
  empty,
}: {
  title: string;
  buckets: Bucket[];
  empty: string;
}) {
  return (
    <section className="rounded-2xl bg-surface p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
        {title}
      </h2>
      {buckets.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {buckets.map((b) => (
            <li key={b.label} className="flex items-center gap-3">
              <span className="w-28 flex-none truncate text-xs text-muted sm:w-40">
                {b.label}
              </span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent-2/80"
                  // Percentages of the widest bar, so the smallest one is
                  // still visible instead of rounding down to nothing.
                  style={{ width: `${Math.max(2, b.share * 100)}%` }}
                />
              </span>
              <span className="w-10 flex-none text-right text-xs tabular-nums text-foreground">
                {b.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A single watched-then/now highlight: which title, and when. */
function Milestone({ label, title, date }: { label: string; title: string; date: Date }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted/80">{label}</p>
      <p className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug">{title}</p>
      <p className="mt-0.5 text-xs text-muted">{formatDate(date)}</p>
    </div>
  );
}

export default async function StatsPage() {
  if (await needsSetup()) {
    redirect("/");
  }
  if (!(await isAuthenticated())) {
    redirect("/");
  }

  const titles = await prisma.title.findMany();
  const stats = computeStats(titles);

  // Movies vs. series, as one split bar rather than two more Figure tiles —
  // the two numbers are already up top; what's interesting here is the
  // ratio between them.
  const movieShare = stats.total > 0 ? stats.movies / stats.total : 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-3 pb-16 pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-5">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back to the catalog
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Statistics</h1>
      </div>

      {stats.total === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          Nothing watched yet. Import your history or add a title, and the
          numbers will show up here.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Figure value={String(stats.total)} label="titles watched" />
            <Figure value={String(stats.movies)} label="movies" />
            <Figure value={String(stats.series)} label="series" />
            <Figure
              value={String(stats.seasons)}
              label={stats.seasons === 1 ? "season watched" : "seasons watched"}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Figure
              value={stats.averageRating != null ? stats.averageRating.toFixed(1) : "—"}
              label={
                stats.averageRating != null
                  ? `average TMDB rating, over ${stats.ratedCount} rated`
                  : "no TMDB ratings yet"
              }
            />
            <Figure value={String(stats.watchlist)} label="waiting on the watchlist" />
          </div>

          {stats.movies > 0 && stats.series > 0 && (
            <section className="rounded-2xl bg-surface p-4">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                Movies vs. series
              </h2>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="bg-accent-2/80"
                  style={{ width: `${movieShare * 100}%` }}
                  aria-hidden
                />
                <span className="flex-1 bg-sky-400/70" aria-hidden />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span>{Math.round(movieShare * 100)}% movies</span>
                <span>{Math.round((1 - movieShare) * 100)}% series</span>
              </div>
            </section>
          )}

          {(stats.firstWatchedTitle || stats.lastWatchedTitle) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              {stats.firstWatchedAt && stats.firstWatchedTitle && (
                <Milestone
                  label="First on record"
                  title={stats.firstWatchedTitle}
                  date={stats.firstWatchedAt}
                />
              )}
              {stats.lastWatchedAt && stats.lastWatchedTitle && (
                <Milestone
                  label="Most recently watched"
                  title={stats.lastWatchedTitle}
                  date={stats.lastWatchedAt}
                />
              )}
            </div>
          )}

          <Bars
            title="Where you watched"
            buckets={stats.platforms}
            empty="No platforms recorded."
          />
          <Bars
            title="Top genres"
            buckets={stats.genres}
            empty="No genres yet — they arrive with the TMDB data."
          />
          <Bars
            title="Titles per year watched"
            buckets={stats.perYear}
            empty="No watch dates recorded."
          />
          <Bars
            title="Titles per month watched"
            buckets={stats.monthly}
            empty="No watch dates recorded."
          />
          <Bars
            title="TMDB rating distribution"
            buckets={stats.ratingBands}
            empty="No TMDB ratings yet."
          />
          <Bars
            title="When they came out"
            buckets={stats.decades}
            empty="No release years yet."
          />

          {stats.topRated.length > 0 && (
            <section className="rounded-2xl bg-surface p-4">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                Best rated in your catalog
              </h2>
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
                {stats.topRated.map((t) => (
                  <li key={t.id}>
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2">
                      {t.posterUrl && (
                        <Image
                          src={t.posterUrl}
                          alt={t.title}
                          fill
                          unoptimized
                          sizes="(max-width: 640px) 30vw, 110px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-foreground">
                      {t.title}
                    </p>
                    <p className="text-[10px] font-semibold text-amber-400">
                      ★ {t.tmdbRating?.toFixed(1)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
