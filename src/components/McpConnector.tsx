"use client";

import { useState } from "react";
import { Check, Copy, PencilLine, Plug, Trash2, TriangleAlert } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";
import ConfirmDialog from "@/components/ConfirmDialog";
import { mcpBaseUrl, mcpUrl } from "@/lib/mcp-url";

/**
 * One labelled value with a copy button.
 *
 * Outside the component on purpose: declared inside, it would be a new
 * component type on every keystroke of state and React would remount all
 * three rows rather than update them.
 */
function Field({
  label,
  value,
  name,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  name: string;
  copied: string | null;
  onCopy: (name: string, value: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted/80">{label}</p>
        <p className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-foreground">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => onCopy(name, value)}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="mt-3 inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-surface-3 text-muted transition-colors hover:text-foreground"
      >
        {copied === name ? (
          <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
        )}
      </button>
    </div>
  );
}

/**
 * Switching the MCP endpoint on, and handing over the credential.
 *
 * Shown once, when it is minted: only a digest is kept, so this component is
 * the single moment the token exists anywhere the reader can copy it from.
 * Losing it costs a regeneration, not a recovery — which is also what makes a
 * leaked connector revocable.
 *
 * Two forms of the same one credential. The header is what is offered first:
 * the address stays a plain URL, and the secret stays out of history and logs.
 * The URL with the token in it is the fallback for a client with nowhere to
 * put a header — same token, same digest, so switching between them is free.
 */
export default function McpConnector({ enabled, createdAt }: { enabled: boolean; createdAt: string | null }) {
  const [on, setOn] = useState(enabled);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [writable, setWritable] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(scope: "read" | "write") {
    setBusy(true);
    setError(null);
    setWritable(scope === "write");
    setFallback(false);
    try {
      const res = await fetch("/api/mcp-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok) throw new Error("Could not generate the token.");
      const { token } = (await res.json()) as { token: string };
      setToken(token);
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
      setToken(null);
      setOn(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch it off.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(what: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      setError("Could not reach the clipboard — select the text and copy it by hand.");
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <SettingsSection
      title="Connect to Claude"
      icon={<Plug className="h-4 w-4 text-accent-ai" strokeWidth={1.8} />}
      description="Lets Claude read your catalog in an ordinary chat, and optionally add to it."
    >
      {token ? (
        <div className="space-y-3">
          <div className="space-y-3 rounded-xl bg-surface-2 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
              Shown once. Copy it now — only a digest is stored.
            </p>
            <Field copied={copied} onCopy={copy} label="Server URL" name="url" value={mcpBaseUrl(origin)} />
            <Field copied={copied} onCopy={copy} label="Authorization header" name="header" value={`Bearer ${token}`} />
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            On claude.ai: Customize &rarr; Connectors &rarr; Add custom connector, and put the header
            under Advanced settings. It is a password — it can{" "}
            {writable ? "read your catalog and add to it" : "read your catalog"}.
          </p>
          {fallback ? (
            <div className="rounded-xl bg-surface-2 p-3">
              <Field copied={copied} onCopy={copy} label="URL with the token in it" name="fallback" value={mcpUrl(origin, token)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFallback(true)}
              className="text-[11px] text-muted underline underline-offset-2 transition-colors hover:text-foreground"
            >
              No field for a header? Use a URL instead
            </button>
          )}
          <div>
            <button
              type="button"
              onClick={() => setToken(null)}
              className="inline-flex h-9 items-center rounded-xl bg-surface-2 px-4 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
            {on ? "Replace the connector with one that can" : "Generate a connector that can"}
          </p>
          {/* One credential at a time, never two: generating either replaces
              whatever is active. The choice is what that connector may do. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => generate("read")}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold transition-colors hover:bg-surface-3 disabled:opacity-50"
            >
              <Plug className="h-4 w-4" strokeWidth={1.8} />
              Read only
            </button>
            <button
              type="button"
              onClick={() => generate("write")}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold transition-colors hover:bg-surface-3 disabled:opacity-50"
            >
              <PencilLine className="h-4 w-4" strokeWidth={1.8} />
              Read and add titles
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
          </div>
          {on && (
            <p className="text-[11px] text-muted">
              A connector is already set up
              {createdAt ? `, since ${new Date(createdAt).toLocaleDateString()}` : ""}. Generating
              replaces it — what you added on claude.ai stops working, so swap it for the new one.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="Switch off the connector?"
          description="Claude will stop being able to read this catalog, and what you added there will stop working."
          confirmLabel="Switch off"
          danger
          onConfirm={revoke}
          onCancel={() => setConfirming(false)}
        />
      )}
    </SettingsSection>
  );
}
