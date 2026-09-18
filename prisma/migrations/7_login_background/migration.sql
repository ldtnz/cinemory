-- What the sign-in screen draws behind its card: "auto" (the poster wall once
-- there are enough posters for it, the terminal animation before that),
-- "posters" or "terminal".
ALTER TABLE "Settings" ADD COLUMN "loginBackground" TEXT NOT NULL DEFAULT 'auto';
