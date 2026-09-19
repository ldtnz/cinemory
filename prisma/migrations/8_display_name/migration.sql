-- What the app calls its user, chosen in the setup wizard and shown on the
-- sign-in screen. Empty until one is chosen.
ALTER TABLE "Settings" ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '';
