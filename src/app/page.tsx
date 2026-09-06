import { prisma } from "@/lib/prisma";
import Catalog from "@/components/Catalog";
import LoginGate from "@/components/LoginGate";
import SetupWizard from "@/components/SetupWizard";
import { isAuthenticated } from "@/lib/auth";
import { needsSetup } from "@/lib/settings";
import {
  getStoredRecommendations,
  isAnthropicConfigured,
  ensureFreshRecommendationsInBackground,
} from "@/lib/recommendations";

export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  if (await needsSetup()) {
    const preview = await prisma.title.findMany({
      where: { posterUrl: { not: null } },
      select: { posterUrl: true },
      orderBy: { lastWatchedAt: "desc" },
      take: 60,
    });
    return <SetupWizard posterUrl={preview.map((t) => t.posterUrl as string)} />;
  }

  if (!(await isAuthenticated())) {
    const preview = await prisma.title.findMany({
      where: { posterUrl: { not: null } },
      select: { posterUrl: true },
      orderBy: { lastWatchedAt: "desc" },
      take: 60,
    });
    return (
      <LoginGate
        posterUrl={preview.map((t) => t.posterUrl as string)}
        error={params.error}
      />
    );
  }

  // The whole catalog is loaded at once: filtering, search and sorting all
  // happen client-side (see Catalog.tsx) so the URL stays "/" instead of
  // filling up with query parameters.
  const titles = await prisma.title.findMany({
    orderBy: [{ lastWatchedAt: "desc" }, { title: "asc" }],
  });
  // Gated on the key being configured now, not just on a cached row
  // existing: removing ANTHROPIC_API_KEY should hide the feature outright,
  // even if a previous run left recommendations in the database.
  const recommendations = isAnthropicConfigured() ? await getStoredRecommendations() : null;
  // If it's missing or older than the refresh interval, this schedules a
  // fresh generation to run after the response is sent — this request still
  // renders with whatever is cached now, the new batch lands for next time.
  ensureFreshRecommendationsInBackground(recommendations);

  return <Catalog initialTitles={titles} recommendations={recommendations?.titles ?? []} />;
}
