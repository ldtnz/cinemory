/**
 * Turning the MCP endpoint on and off.
 *
 * POST mints a token — read-only, or able to write when asked — and returns it
 * **once**: only its digest is stored, so
 * there is no second chance to read it and no way for a database dump to yield
 * a working credential. Minting again replaces the old digest, which is also
 * how a leaked URL is revoked.
 *
 * DELETE clears it, switching the endpoint off.
 *
 * Both are gated by the ordinary session: this is the account's own settings
 * page talking, not the connector.
 */
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SETTINGS_ID } from "@/lib/settings";
import { generateMcpToken, hashMcpToken, type McpScope } from "@/lib/mcp-token";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Reading unless writes were asked for: the safe default survives a typo,
  // a stale client, or a request body that never arrived.
  const body = (await request.json().catch(() => null)) as { scope?: string } | null;
  const scope: McpScope = body?.scope === "write" ? "write" : "read";
  const token = generateMcpToken(scope);
  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: { mcpTokenHash: hashMcpToken(token), mcpTokenCreatedAt: new Date() },
    create: { id: SETTINGS_ID, mcpTokenHash: hashMcpToken(token), mcpTokenCreatedAt: new Date() },
  });

  // The only time this value exists outside the reader's connector.
  return NextResponse.json({ token, scope });
}

export async function DELETE() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  await prisma.settings.updateMany({
    where: { id: SETTINGS_ID },
    data: { mcpTokenHash: null, mcpTokenCreatedAt: null },
  });
  return NextResponse.json({ ok: true });
}
