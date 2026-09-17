/**
 * The MCP endpoint proper: a stable address, with the token in an
 * Authorization: Bearer header.
 *
 * The form to prefer — see src/lib/mcp-server.ts. Keeping the secret out of
 * the URL keeps it out of browser history, referrer headers and anything that
 * logs a path.
 */
import { serveMcp } from "@/lib/mcp-server";

export const maxDuration = 60;

async function handle(request: Request) {
  return serveMcp(request);
}

export { handle as GET, handle as POST, handle as DELETE };
