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

// Recommendations also refresh automatically (see
// ensureFreshRecommendationsInBackground, called from the home page) — this
// is only for an early manual refresh from Settings. The interval is
// re-checked here, not just reflected in the UI, and the same lock the
// automatic refresh uses guards against both calling Claude at once.
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const stored = await getStoredRecommendations();
  if (stored && !canRefreshNow(stored.generatedAt)) {
    return NextResponse.json({
      titles: stored.titles,
      generatedAt: stored.generatedAt,
      canRefresh: false,
      nextRefreshAt: nextRefreshAt(stored.generatedAt).toISOString(),
      skipped: true,
    });
  }

  const claimed = await claimGenerationLock();
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

  try {
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
    await releaseGenerationLock();
  }
}
