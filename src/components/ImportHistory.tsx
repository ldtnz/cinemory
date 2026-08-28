"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

type FileOutcome = {
  file: string;
  format: string | null;
  read: number;
  alreadyPresent: number;
  added: number;
  seasonsUpdated: number;
  error?: string;
};

type ImportResponse = {
  outcomes: FileOutcome[];
  added: number;
  seasonsUpdated: number;
  cursor: number;
};
type EnrichResponse = {
  enriched: number;
  unmatched: number;
  cursor: number;
  remaining: number;
  done: boolean;
};

const FORMAT_LABELS: Record<string, string> = {
  netflix: "Netflix",
  amazon: "Prime Video",
};

export default function ImportHistory({ onImported }: { onImported?: () => void } = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File[]>([]);
  const [phase, setPhase] = useState<"idle" | "importing" | "enriching">("idle");
  const [outcomes, setOutcomes] = useState<FileOutcome[] | null>(null);
  const [added, setAdded] = useState(0);
  const [enriched, setEnriched] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

  async function runImport() {
    if (file.length === 0) return;
    setPhase("importing");
    setError(null);
    setOutcomes(null);
    setEnriched(0);

    try {
      const form = new FormData();
      for (const f of file) form.append("file", f);

      const res = await fetch("/api/import", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Import failed.");
      }
      const data = (await res.json()) as ImportResponse;
      setOutcomes(data.outcomes);
      setAdded(data.added);

      if (data.added === 0) {
        setPhase("idle");
        return;
      }
      // The titles are in the catalog from here on; posters and metadata
      // still trickle in below, same as for any other import.
      onImported?.();

      // Posters and metadata come afterwards, in batches: a single request for
      // hundreds of titles would blow past the serverless duration limit.
      setPhase("enriching");
      let cursor = data.cursor;
      let total = 0;
      for (;;) {
        const r = await fetch("/api/import/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        if (!r.ok) {
          // The titles are in the catalog either way: say so rather than
          // leaving the progress half-finished with no explanation.
          setError(
            "Titles were added, but fetching the posters stopped early. " +
              "You can finish them from Missing posters.",
          );
          break;
        }
        const status = (await r.json()) as EnrichResponse;
        total += status.enriched;
        setEnriched(total);
        cursor = status.cursor;
        if (status.done || status.remaining === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setPhase("idle");
      setFile([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="mb-8 rounded-2xl bg-surface p-4">
      <h2 className="text-sm font-semibold">Import watch history</h2>
      <p className="mt-1 text-xs text-muted">
        Upload your Netflix or Prime Video export: only titles that are not
        already in the catalog are added.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* The native control would not follow the rest of the styling:
              it is hidden behind a label, which the browser still treats as the
            file picker button. */}
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
        <label
          htmlFor="history-file"
          className={`inline-flex h-9 flex-none items-center rounded-xl bg-surface-2 px-3 text-xs font-medium ${
            busy ? "opacity-50" : "cursor-pointer hover:bg-surface-2/70"
          }`}
        >
          Choose files
        </label>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {file.length === 0
            ? "No file selected"
            : file.map((f) => f.name).join(", ")}
        </span>
        <button
          type="button"
          onClick={runImport}
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

      {outcomes && (
        <div className="mt-4 space-y-2">
          {outcomes.map((e) => (
            <div key={e.file} className="rounded-xl bg-surface-2 px-3 py-2 text-xs">
              <p className="font-medium">
                {e.file}
                {e.format && (
                  <span className="ml-1.5 font-normal text-muted">
                    · {FORMAT_LABELS[e.format] ?? e.format}
                  </span>
                )}
              </p>
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
          {added > 0 && phase === "idle" && (
            <p className="text-xs text-muted">
              Reload the catalog to see the new titles.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
