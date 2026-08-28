import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

// Avoids creating several PrismaClient instances across Next.js hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Absolute URL of the local SQLite file.
 *
 * An absolute DATABASE_URL is taken as given — that is how the Docker image
 * points at the database on its volume, and nothing should second-guess it.
 *
 * A relative one is rewritten, for two reasons. Prisma resolves "file:./dev.db"
 * to an absolute path at `prisma generate` time, using whatever the cwd was
 * then; on a serverless platform the build runs in a different directory from
 * the function at runtime, so that path no longer exists. And a relative
 * "file:./dev.db" means prisma/dev.db to the Prisma CLI (which resolves against
 * the schema) but ./dev.db to the client (which resolves against the cwd) —
 * settling it here keeps the CLI, the app and the scripts on one file.
 */
export function resolveLocalDatabaseUrl(): string | undefined {
  const configured = process.env.DATABASE_URL;
  if (configured?.startsWith("file:")) {
    const filePath = configured.slice("file:".length);
    if (path.isAbsolute(filePath)) return configured;
  }

  const dbPath = path.join(process.cwd(), "prisma", "dev.db");
  if (fs.existsSync(dbPath)) {
    return `file:${dbPath}`;
  }
  return configured;
}

// A bundled SQLite file is read-only on a serverless platform, so hosted
// deployments keep the real database on Turso (hosted libSQL, compatible
// with the same SQLite schema) and reach it through Prisma's libSQL adapter
// whenever TURSO_DATABASE_URL is set. Without that variable the local
// dev.db file is used instead, which is what self-hosted installs and the
// offline import/seed scripts rely on.
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl) {
    const libsql = createClient({ url: tursoUrl, authToken: tursoAuthToken });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter });
  }

  return new PrismaClient({
    datasources: { db: { url: resolveLocalDatabaseUrl() } },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
