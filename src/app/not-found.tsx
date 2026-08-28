import { prisma } from "@/lib/prisma";
import NotFoundGate from "@/components/NotFoundGate";

export default async function NotFound() {
  const preview = await prisma.title.findMany({
    where: { posterUrl: { not: null } },
    select: { posterUrl: true },
    orderBy: { lastWatchedAt: "desc" },
    take: 60,
  });

  return <NotFoundGate posterUrl={preview.map((t) => t.posterUrl as string)} />;
}
