import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  isAnthropicConfigured,
  getStoredRecommendations,
  canRefreshNow,
  nextRefreshAt,
  generateRecommendations,
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

// Never called on page load — only from the explicit "Generate" button in
// Settings. The cooldown is re-checked here, not just reflected in the UI:
// this is what actually caps how often the Claude API gets called.
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
  }
}
