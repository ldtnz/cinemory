/**
 * Turning the MCP endpoint on and off.
 *
 * POST mints a token and returns it **once** — only its digest is stored, so
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
import { generateMcpToken, hashMcpToken } from "@/lib/mcp-token";

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const token = generateMcpToken();
  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: { mcpTokenHash: hashMcpToken(token), mcpTokenCreatedAt: new Date() },
    create: { id: SETTINGS_ID, mcpTokenHash: hashMcpToken(token), mcpTokenCreatedAt: new Date() },
  });

  // The only time this value exists outside the reader's connector.
  return NextResponse.json({ token });
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
