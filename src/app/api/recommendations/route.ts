import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  isAnthropicConfigured,
  getStoredRecommendations,
  canRefreshNow,
  nextRefreshAt,
  generateRecommendations,
  claimGenerationLock,
  releaseGenerationLock,
} from "@/lib/recommendations";

// The manual refresh below calls Claude plus a TMDB match per pick, well
// past the default limit on a catalog of any size — the same wall the
// import routes hit.
export const maxDuration = 60;

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const stored = await getStoredRecommendations();
  return NextResponse.json({
    titles: stored?.titles ?? [],
    generatedAt: stored?.generatedAt ?? null,
    canRefresh: canRefreshNow(stored?.generatedAt ?? null),
    nextRefreshAt: stored ? nextRefreshAt(stored.generatedAt).toISOString() : null,
  });
}

// Recommendations also refresh automatically every REFRESH_INTERVAL_DAYS
// (see ensureFreshRecommendationsInBackground, called from the home page).
// This route is the manual "force a refresh now" action from Settings — it
// deliberately does NOT check the interval, only the lock below, so it
// always calls Claude unless a refresh is already in flight.
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  let claimed = false;
  try {
    claimed = await claimGenerationLock();
    if (!claimed) {
      // The automatic background refresh (or another request) already has
      // this — report whatever is current instead of racing it.
      const latest = await getStoredRecommendations();
      return NextResponse.json({
        titles: latest?.titles ?? [],
        generatedAt: latest?.generatedAt ?? null,
        canRefresh: false,
        nextRefreshAt: latest ? nextRefreshAt(latest.generatedAt).toISOString() : null,
        skipped: true,
      });
    }

    const fresh = await generateRecommendations();
    return NextResponse.json({
      titles: fresh.titles,
      generatedAt: fresh.generatedAt,
      canRefresh: false,
      nextRefreshAt: nextRefreshAt(fresh.generatedAt).toISOString(),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not generate recommendations." }, { status: 500 });
  } finally {
    if (claimed) await releaseGenerationLock();
  }
}
