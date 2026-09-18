import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { getSettings, needsSetup } from "@/lib/settings";
import { isTmdbConfigured } from "@/lib/tmdb";
import { mergeSummary } from "@/lib/seasons";
import { MISSING_POSTER } from "@/lib/posters";
import {
  isAnthropicConfigured,
  getStoredRecommendations,
  canRefreshNow,
  nextRefreshAt,
} from "@/lib/recommendations";
import MissingPostersPanel from "@/components/MissingPostersPanel";
import SettingsSection from "@/components/SettingsSection";
import McpConnector from "@/components/McpConnector";
import RestoreBackup from "@/components/RestoreBackup";
import ImportHistory from "@/components/ImportHistory";
import FetchMissingDetails from "@/components/FetchMissingDetails";
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
  // Titles no TMDB match was ever found for: what an interrupted import
  // leaves behind, and what /api/import/enrich works through.
  const withoutDetails = await prisma.title.count({ where: { tmdbId: null } });
  const storedRecommendations = await getStoredRecommendations();

  const missing = await prisma.title.findMany({
    where: MISSING_POSTER,
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

      {/* One gap between sections, set here rather than as a bottom margin on
          each of them — which is how they had come to differ by section. */}
      <div className="space-y-4">
        <PreferencesEditor initialLanguage={settings.language} initialRegion={settings.region} />

        {!isTmdbConfigured() ? (
          <p className="rounded-2xl bg-surface p-4 text-sm text-red-400">
            TMDB_API_KEY or TMDB_ACCESS_TOKEN is not configured: import and
            search are unavailable.
          </p>
        ) : (
          <>
            <ImportHistory />

            {withoutDetails > 0 && <FetchMissingDetails pending={withoutDetails} />}

            {/* Posters before seasons: both are import leftovers, and a title
                with no artwork is the one you actually notice in the grid. */}
            <MissingPostersPanel initialTitles={missing} />

            <SeriesSeasons missing={seriesWithoutSeasons} toMerge={toMerge} />
          </>
        )}

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

        <McpConnector
          enabled={Boolean(settings.mcpTokenHash)}
          createdAt={settings.mcpTokenCreatedAt ? settings.mcpTokenCreatedAt.toISOString() : null}
        />

        <SettingsSection
          title="Export your catalog"
          description="Downloads every title as JSON — a full backup independent of the database itself, in case you ever need to move it or restore from something other than your host's own backups."
        >
          <a
            href="/api/export"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-3"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} />
            Export catalog (JSON)
          </a>
        </SettingsSection>

        <RestoreBackup />

        <EditModeToggle />
      </div>
    </main>
  );
}
