/**
 * Where the MCP endpoint lives.
 *
 * Its own file, with nothing imported, because both sides need it: the
 * settings page builds these in the browser, and src/lib/mcp-token.ts —
 * which reaches for node:crypto — must not be dragged into the client bundle
 * to supply two strings. Same reasoning as src/lib/title-key.ts.
 */

/** The endpoint's stable address. The token goes in a header, so this string
 *  is not a secret and never changes. */
export function mcpBaseUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/mcp`;
}

/** The same endpoint with the token in the path, for clients that cannot send
 *  a header. This one is the credential. */
export function mcpUrl(origin: string, token: string): string {
  return `${mcpBaseUrl(origin)}/${token}`;
}
