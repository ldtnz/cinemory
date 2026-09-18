"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Clapperboard,
  Copy,
  ExternalLink,
  Upload,
  X,
} from "lucide-react";
import { IMPORT_SOURCES, type ImportSource } from "@/lib/import-sources";
import type { FileOutcome } from "@/components/ImportHistory";
import ServiceMark from "@/components/ServiceMark";
import { useDialogFocus } from "@/lib/use-dialog-focus";

/**
 * Picking a service, then importing from it.
 *
 * The section this opens from used to list Netflix, Prime Video and Disney+ in
 * one paragraph, which only worked while there were two of them and they
 * behaved the same. They do not: one has a download button, one needs a script,
 * and the third has no history at all. So each gets its own page here, with
 * what to click, what the file should look like, and what it will actually do
 * to the catalog.
 *
 * Running the import stays with the caller — the results belong to the section,
 * which keeps showing them after this closes.
 */
export default function ImportDialog({
  phase,
  outcomes,
  added,
  enriched,
  error,
  onImport,
  onClose,
}: {
  phase: "idle" | "importing" | "enriching";
  outcomes: FileOutcome[] | null;
  added: number;
  enriched: number;
  error: string | null;
  onImport: (files: File[]) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>();

  const [source, setSource] = useState<ImportSource | null>(null);
  const [file, setFile] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase !== "idle";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);

  async function copyScript(url: string) {
    try {
      const res = await fetch(url);
      await navigator.clipboard.writeText(await res.text());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the link beside this still works.
      window.open(url, "_blank");
    }
  }

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={source ? `Import from ${source.name}` : "Import watch history"}
        onClick={(e) => e.stopPropagation()}
        className="dialog-in flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          {source && (
            <button
              type="button"
              onClick={() => {
                setSource(null);
                setFile([]);
              }}
              disabled={busy}
              aria-label="Back to the list of services"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
            </button>
          )}
          <h2 className="flex-1 truncate text-sm font-semibold">
            {source ? `Import from ${source.name}` : "Where are you importing from?"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!source ? (
            <div className="space-y-2">
              {IMPORT_SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s)}
                  className="group flex w-full items-start gap-3 rounded-2xl bg-surface-2 p-3 text-left transition-colors hover:bg-surface-3"
                >
                  <ServiceMark id={s.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{s.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{s.tagline}</span>
                  </span>
                </button>
              ))}
              <p className="px-1 pt-2 text-[11px] text-muted">
                Only titles that are not already in the catalog are added, so importing the
                same file twice changes nothing.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <SourceBadge source={source} />

              <ol className="space-y-1.5">
                {source.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-muted">
                    <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">{step}</span>
                  </li>
                ))}
              </ol>

              {(source.script || source.link) && (
                <div className="flex flex-wrap gap-2">
                  {source.script && (
                    <>
                      <button
                        type="button"
                        onClick={() => copyScript(source.script!.url)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-xs font-medium transition-colors hover:bg-surface-3"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-accent-2" strokeWidth={2.4} />
                        ) : (
                          <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
                        )}
                        {copied ? "Copied" : "Copy script"}
                      </button>
                      <a
                        href={source.script.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                        {source.script.label}
                      </a>
                    </>
                  )}
                  {source.link && (
                    <a
                      href={source.link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                      {source.link.label}
                    </a>
                  )}
                </div>
              )}

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                  What the file looks like
                </p>
                <pre className="mt-1.5 overflow-x-auto rounded-xl bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
                  <code>
                    <span className="text-foreground">{source.columns}</span>
                    {source.sample.map((row) => `\n${row}`)}
                  </code>
                </pre>
              </div>

              {source.caveat && (
                <p className="rounded-xl bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
                  {source.caveat}
                </p>
              )}

              <div className="border-t border-white/5 pt-4">
                <input
                  ref={inputRef}
                  id="history-file"
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  disabled={busy}
                  onChange={(e) => setFile(Array.from(e.target.files ?? []))}
                  className="sr-only"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="history-file"
                    className={`inline-flex h-9 flex-none items-center rounded-xl bg-surface-2 px-3 text-xs font-medium ${
                      busy ? "opacity-50" : "cursor-pointer hover:bg-surface-3"
                    }`}
                  >
                    Choose file
                  </label>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {file.length === 0 ? "No file selected" : file.map((f) => f.name).join(", ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => onImport(file)}
                    disabled={busy || file.length === 0}
                    className="inline-flex h-9 flex-none items-center gap-1.5 rounded-xl bg-foreground px-4 text-xs font-medium text-background disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={2} />
                    {phase === "importing" ? "Importing..." : "Import"}
                  </button>
                </div>

                {phase === "enriching" && (
                  <p className="mt-3 text-xs text-muted">
                    Fetching posters and details from TMDB... {enriched} of {added}
                  </p>
                )}
                {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                {outcomes && <Outcomes outcomes={outcomes} added={added} idle={phase === "idle"} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Says where the titles will land, which is the one thing that differs. */
function SourceBadge({ source }: { source: ImportSource }) {
  const watchlist = source.gives === "watchlist";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium">
      {watchlist ? (
        <Bookmark className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
      ) : (
        <Clapperboard className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
      )}
      {watchlist ? "Adds to “To watch”" : "Adds to your watched titles"}
    </span>
  );
}

function Outcomes({
  outcomes,
  added,
  idle,
}: {
  outcomes: FileOutcome[];
  added: number;
  idle: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      {outcomes.map((e) => (
        <div key={e.file} className="rounded-xl bg-surface-2 px-3 py-2 text-xs">
          <p className="truncate font-medium">{e.file}</p>
          {e.error ? (
            <p className="mt-0.5 text-red-400">{e.error}</p>
          ) : (
            <p className="mt-0.5 text-muted">
              {e.read.toLocaleString()} {e.read === 1 ? "title read" : "titles read"} ·{" "}
              {e.alreadyPresent.toLocaleString()} already present ·{" "}
              <span className={e.added > 0 ? "text-accent-2" : undefined}>
                {e.added.toLocaleString()} added
              </span>
            </p>
          )}
        </div>
      ))}
      {added > 0 && idle && (
        <p className="text-xs text-muted">Reload the catalog to see the new titles.</p>
      )}
    </div>
  );
}
