"use client";

import { useState } from "react";
import { Check, Copy, Plug, Trash2, TriangleAlert } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";
import ConfirmDialog from "@/components/ConfirmDialog";
import { mcpUrl } from "@/lib/mcp-url";

/**
 * Switching the MCP endpoint on, and handing over the URL.
 *
 * The URL is shown once, when it is minted: only a digest is kept, so this
 * component is the single moment the token exists anywhere the reader can copy
 * it from. Losing it costs a regeneration, not a recovery — which is also what
 * makes a leaked URL revocable.
 */
export default function McpConnector({ enabled, createdAt }: { enabled: boolean; createdAt: string | null }) {
  const [on, setOn] = useState(enabled);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-token", { method: "POST" });
      if (!res.ok) throw new Error("Could not generate the token.");
      const { token } = (await res.json()) as { token: string };
      setUrl(mcpUrl(window.location.origin, token));
      setOn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the token.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-token", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not switch it off.");
      setUrl(null);
      setOn(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch it off.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not reach the clipboard — select the URL and copy it by hand.");
    }
  }

  return (
    <SettingsSection
      title="Connect to Claude"
      icon={<Plug className="h-4 w-4 text-accent-ai" strokeWidth={1.8} />}
      description="Lets Claude read your catalog in an ordinary chat. Read-only — nothing reached this way can change a title."
    >
      {url ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
              Shown once. Copy it now — only a digest is stored.
            </p>
            <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-foreground">
              {url}
            </p>
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            Add it on claude.ai under Customize &rarr; Connectors &rarr; Add custom
            connector. Treat it as a password: anyone holding it can read your catalog.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-4 text-xs font-semibold text-background"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
              )}
              {copied ? "Copied" : "Copy the URL"}
            </button>
            <button
              type="button"
              onClick={() => setUrl(null)}
              className="inline-flex h-9 items-center rounded-xl bg-surface-2 px-4 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            <Plug className="h-4 w-4" strokeWidth={1.8} />
            {on ? "Generate a new URL" : "Turn on and get the URL"}
          </button>
          {on && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.8} />
              Switch off
            </button>
          )}
          {on && (
            <span className="text-[11px] text-muted">
              On{createdAt ? ` since ${new Date(createdAt).toLocaleDateString()}` : ""}
            </span>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="Switch off the connector?"
          description="Claude will stop being able to read this catalog, and the URL you added there will stop working."
          confirmLabel="Switch off"
          danger
          onConfirm={revoke}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SettingsSection>
  );
}
