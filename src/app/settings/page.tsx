import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { getSettings, needsSetup } from "@/lib/settings";
import { isTmdbConfigured } from "@/lib/tmdb";
import { mergeSummary } from "@/lib/seasons";
import {
  isAnthropicConfigured,
  getStoredRecommendations,
  canRefreshNow,
  nextRefreshAt,
} from "@/lib/recommendations";
import MissingPostersPanel from "@/components/MissingPostersPanel";
import ImportHistory from "@/components/ImportHistory";
import EditModeToggle from "@/components/EditModeToggle";
import SeriesSeasons from "@/components/SeriesSeasons";
import PreferencesEditor from "@/components/PreferencesEditor";
import RecommendationsPanel from "@/components/RecommendationsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (await needsSetup()) {
    redirect("/");
  }
  if (!(await isAuthenticated())) {
    redirect("/");
  }

  const settings = await getSettings();

  const seriesWithoutSeasons = await prisma.title.count({
    where: { mediaType: "Series", totalSeasons: null, tmdbId: { gt: 0 } },
  });
  const toMerge = await mergeSummary();
  const storedRecommendations = await getStoredRecommendations();

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

      <PreferencesEditor initialLanguage={settings.language} initialRegion={settings.region} />

      {isAnthropicConfigured() && (
        <RecommendationsPanel
          initialTitles={storedRecommendations?.titles ?? []}
          initialGeneratedAt={storedRecommendations?.generatedAt ?? null}
          initialCanRefresh={canRefreshNow(storedRecommendations?.generatedAt ?? null)}
          initialNextRefreshAt={
            storedRecommendations ? nextRefreshAt(storedRecommendations.generatedAt).toISOString() : null
          }
        />
      )}

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

      <section className="mt-10 border-t border-white/5 pt-6">
        <h2 className="text-sm font-semibold">Export your catalog</h2>
        <p className="mt-1 text-xs text-muted">
          Downloads every title as JSON — a full backup independent of the
          database itself, in case you ever need to move it or restore from
          something other than your host&apos;s own backups.
        </p>
        <a
          href="/api/export"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-2/70"
        >
          <Download className="h-4 w-4" strokeWidth={1.8} />
          Export catalog (JSON)
        </a>
      </section>

      <EditModeToggle />
    </main>
  );
}
