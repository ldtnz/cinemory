/**
 * The MCP endpoint with the token in the URL.
 *
 * For clients with nowhere to put an Authorization header. Everything else,
 * including why this exists at all, is in src/lib/mcp-server.ts.
 */
import { serveMcp } from "@/lib/mcp-server";

export const maxDuration = 60;

async function handle(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return serveMcp(request, token);
}

export { handle as GET, handle as POST, handle as DELETE };
