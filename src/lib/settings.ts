// The single Settings row: TMDB content language/region and the TOTP secret,
// all set through the first-run wizard (see src/components/SetupWizard.tsx)
// instead of deploy-time environment variables.
import { prisma } from "@/lib/prisma";

const SETTINGS_ID = 1;

export type AppSettings = {
  id: number;
  language: string;
  region: string;
  totpSecret: string | null;
  onboarded: boolean;
};

/**
 * The settings row, created with defaults on first access. Safe to call from
 * every request: the common case after setup is a single indexed read, and
 * the create-on-first-use path only runs once, ever, per install.
 */
export async function getSettings(): Promise<AppSettings> {
  const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

/** True until the setup wizard has been completed once. */
export async function needsSetup(): Promise<boolean> {
  return !(await getSettings()).onboarded;
}

export async function savePreferences(language: string, region: string): Promise<void> {
  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: { language, region },
    create: { id: SETTINGS_ID, language, region },
  });
}
