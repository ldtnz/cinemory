import { prisma } from "@/lib/prisma";
import NotFoundGate from "@/components/NotFoundGate";

export default async function NotFound() {
  // The poster grid is decoration. This page is prerendered at build time, so
  // a database that is empty, not yet migrated or unreachable must not take
  // the build down with it: fall back to a plain background.
  let posters: string[] = [];
  try {
    const preview = await prisma.title.findMany({
      where: { posterUrl: { not: null } },
      select: { posterUrl: true },
      orderBy: { lastWatchedAt: "desc" },
      take: 60,
    });
    posters = preview.map((t) => t.posterUrl as string);
  } catch {
    posters = [];
  }

  return <NotFoundGate posterUrl={posters} />;
}
