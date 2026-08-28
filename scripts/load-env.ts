/**
 * Loads .env for the command-line scripts.
 *
 * Next.js loads .env by itself, but `tsx scripts/…` is a plain Node process:
 * without this the scripts would only see variables already exported in the
 * shell. Import it first, before anything that reads process.env.
 *
 * Uses Node's built-in loader (Node 20.12+), so there is no dependency to add.
 * A missing .env is not an error: the variables may well come from the
 * environment already, which is how hosted deployments do it.
 */
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
