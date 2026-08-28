import { prisma } from "@/lib/prisma";
import Catalog from "@/components/Catalog";
import LoginGate from "@/components/LoginGate";
import { isAuthenticated } from "@/lib/auth";

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

  return <Catalog initialTitles={titles} />;
}
