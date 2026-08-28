"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { LANGUAGES, REGIONS } from "@/lib/locales";

/** Lets the content language/region picked during setup be changed later. */
export default function PreferencesEditor({
  initialLanguage,
  initialRegion,
}: {
  initialLanguage: string;
  initialRegion: string;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [region, setRegion] = useState(initialRegion);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = language !== initialLanguage || region !== initialRegion;

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/setup/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, region }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl bg-surface p-4">
      <h2 className="text-sm font-semibold">Content language &amp; region</h2>
      <p className="mt-1 mb-4 text-xs text-muted">
        Language TMDB answers in (posters, overviews, genres) and the region used to guess a
        title&apos;s streaming platform on import.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-10 flex-1 rounded-xl border border-white/5 bg-surface-2 px-3 text-sm text-foreground outline-none focus:border-white/30"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="h-10 flex-1 rounded-xl border border-white/5 bg-surface-2 px-3 text-sm text-foreground outline-none focus:border-white/30"
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex h-10 flex-none items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 text-xs font-medium text-background disabled:opacity-50"
        >
          {saved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </div>
    </section>
  );
}
