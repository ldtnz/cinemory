"use client";

import { useState, type ReactNode } from "react";
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
export default function ImportHistory({
  onImported,
  embedded = false,
  trigger,
}: {
  onImported?: () => void;
  embedded?: boolean;
  /** Draws its own button in place of the default one, given what opens the
   *  dialog. Implies `embedded`: no section around it. */
  trigger?: (open: () => void) => ReactNode;
} = {}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "importing" | "enriching">("idle");
  const [outcomes, setOutcomes] = useState<FileOutcome[] | null>(null);
  const [added, setAdded] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function runImport(file: File[]) {
    if (file.length === 0) return;
    setPhase("importing");
    setError(null);
    setOutcomes(null);
    setProcessed(0);

    let imported = false;
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
      imported = true;

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
        // A title is complete for progress purposes even when TMDB cannot
        // match it. Counting only enriched rows could leave the bar short of
        // 100% after every request had finished.
        total += status.enriched + status.unmatched;
        setProcessed(Math.min(data.added, total));
        cursor = status.cursor;
        if (status.done || status.remaining === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setPhase("idle");
      // Wait for poster enrichment before leaving onboarding. Reloading as
      // soon as the rows were inserted used to abort the remaining requests.
      if (imported) onImported?.();
    }
  }

  const lastAdded = outcomes?.reduce((n, o) => n + o.added, 0) ?? 0;

  const content: ReactNode = (
    <>
      {trigger ? trigger(() => setOpen(true)) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-colors ${
            embedded
              ? "mx-auto flex bg-foreground text-background hover:opacity-90"
              : "inline-flex bg-surface-2 hover:bg-surface-3"
          }`}
        >
          <Upload className="h-4 w-4" strokeWidth={1.8} />
          Import from a service
        </button>
      )}

      {outcomes && !open && !trigger && (
        <p className="mt-3 text-xs text-muted">
          Last import: {lastAdded.toLocaleString("en-US")} {lastAdded === 1 ? "title" : "titles"} added.
          {lastAdded > 0 && " Reload the catalog to see them."}
        </p>
      )}

      {open && (
        <ImportDialog
          phase={phase}
          outcomes={outcomes}
          added={added}
          processed={processed}
          error={error}
          onImport={runImport}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );

  if (embedded || trigger) return content;

  return (
    <SettingsSection
      title="Import watch history"
      description="Bring in what you have already watched from a streaming service. Each one gives it up differently, so pick yours and the steps follow."
    >
      {content}
    </SettingsSection>
  );
}
