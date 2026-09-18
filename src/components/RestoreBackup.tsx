"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";

type Report = {
  read: number;
  added: number;
  alreadyPresent: number;
  unreadable: number;
};

/**
 * Putting a backup from "Export your catalog" back in.
 *
 * Deliberately a plain file button rather than a dialog: unlike the service
 * imports, there is nothing to explain about where the file comes from — it
 * came from here.
 */
export default function RestoreBackup() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/restore", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as (Report & { error?: string }) | null;
      if (!res.ok) throw new Error(data?.error ?? "The restore failed.");
      setReport(data as Report);
      // The catalog behind this page is server-rendered, so the new titles
      // only exist for it once it is asked again.
      if (data && data.added > 0) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The restore failed.");
    } finally {
      setBusy(false);
      // Same file twice in a row still fires the change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <SettingsSection
      title="Restore from a backup"
      description="Reads a JSON file written by the export above. It only adds titles the catalog does not already have — nothing here is overwritten or removed, so restoring twice is harmless."
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void restore(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
      >
        <ArchiveRestore className="h-4 w-4" strokeWidth={1.8} />
        {busy ? "Restoring…" : "Choose a backup file"}
      </button>

      {report && (
        <p className="mt-3 text-xs text-muted">
          {report.read.toLocaleString()} {report.read === 1 ? "title" : "titles"} in the file:{" "}
          {report.added.toLocaleString()} added, {report.alreadyPresent.toLocaleString()} already in
          the catalog
          {report.unreadable > 0 && `, ${report.unreadable.toLocaleString()} unreadable`}.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </SettingsSection>
  );
}
