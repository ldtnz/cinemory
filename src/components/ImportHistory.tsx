"use client";

import { useState } from "react";
import SettingsSection from "@/components/SettingsSection";
import { Upload } from "lucide-react";
import ImportDialog from "@/components/ImportDialog";

export type FileOutcome = {
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

/**
 * The import section: a button, and whatever the last import did.
 *
 * Choosing a service and being told how to get its file happens in the dialog
 * (ImportDialog). The request itself stays here, so its result outlives the
 * dialog being closed.
 */
export default function ImportHistory({ onImported }: { onImported?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "importing" | "enriching">("idle");
  const [outcomes, setOutcomes] = useState<FileOutcome[] | null>(null);
  const [added, setAdded] = useState(0);
  const [enriched, setEnriched] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function runImport(file: File[]) {
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
    }
  }

  const lastAdded = outcomes?.reduce((n, o) => n + o.added, 0) ?? 0;

  return (
    <SettingsSection
      title="Import watch history"
      description="Bring in what you have already watched from a streaming service. Each one gives it up differently, so pick yours and the steps follow."
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold transition-colors hover:bg-surface-3"
      >
        <Upload className="h-4 w-4" strokeWidth={1.8} />
        Import from a service
      </button>

      {outcomes && !open && (
        <p className="mt-3 text-xs text-muted">
          Last import: {lastAdded.toLocaleString()} {lastAdded === 1 ? "title" : "titles"} added.
          {lastAdded > 0 && " Reload the catalog to see them."}
        </p>
      )}

      {open && (
        <ImportDialog
          phase={phase}
          outcomes={outcomes}
          added={added}
          enriched={enriched}
          error={error}
          onImport={runImport}
          onClose={() => setOpen(false)}
        />
      )}
    </SettingsSection>
  );
}
