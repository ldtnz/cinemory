import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { isTmdbConfigured } from "@/lib/tmdb";
import { mergeSummary } from "@/lib/seasons";
import MissingPostersPanel from "@/components/MissingPostersPanel";
import ImportHistory from "@/components/ImportHistory";
import EditModeToggle from "@/components/EditModeToggle";
import SeriesSeasons from "@/components/SeriesSeasons";

export const dynamic = "force-dynamic";

export default async function GestisciPage() {
  if (!(await isAuthenticated())) {
    redirect("/");
  }

  const seriesWithoutSeasons = await prisma.title.count({
    where: { mediaType: "Series", totalSeasons: null, tmdbId: { gt: 0 } },
  });
  const toMerge = await mergeSummary();

  const missing = await prisma.title.findMany({
    where: {
      posterUrl: null,
      NOT: { tmdbId: -1 },
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      mediaType: true,
      platform: true,
      year: true,
    },
  });

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
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Settings
        </h1>
      </div>

      {!isTmdbConfigured() ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-red-400">
          TMDB_API_KEY or TMDB_ACCESS_TOKEN is not configured: import and
          search are unavailable.
        </p>
      ) : (
        <>
          <ImportHistory />

          <SeriesSeasons missing={seriesWithoutSeasons} toMerge={toMerge} />

          <section>
            <h2 className="text-sm font-semibold">Missing posters</h2>
            <p className="mt-1 mb-4 text-xs text-muted">
              {missing.length === 0
                ? "Every title has a poster."
                : `${missing.length} titles without a poster. Search for the right one and link it, or ignore the title.`}
            </p>
            <MissingPostersPanel initialTitles={missing} />
          </section>
        </>
      )}

      <EditModeToggle />
    </main>
  );
}
