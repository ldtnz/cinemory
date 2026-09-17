/**
 * Where the MCP endpoint lives.
 *
 * Its own file, with nothing imported, because both sides need it: the
 * settings page builds the URL in the browser, and src/lib/mcp-token.ts —
 * which reaches for node:crypto — must not be dragged into the client bundle
 * to supply one string. Same reasoning as src/lib/title-key.ts.
 */
export function mcpUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/mcp/${token}`;
}
