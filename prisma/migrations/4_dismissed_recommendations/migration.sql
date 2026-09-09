-- "Not interested" on an AI recommendation: kept forever, not per-batch, so
-- it stays excluded across every future generation.
CREATE TABLE "DismissedRecommendation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "dismissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DismissedRecommendation_key_key" ON "DismissedRecommendation"("key");
