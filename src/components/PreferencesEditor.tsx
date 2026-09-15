"use client";

import { useState } from "react";
import SettingsSection from "@/components/SettingsSection";
import Select from "@/components/Select";
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
    <SettingsSection
      title="Content language & region"
      description="Language TMDB answers in (posters, overviews, genres) and the region used to guess a title's streaming platform on import."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          value={language}
          onChange={setLanguage}
          options={LANGUAGES}
          ariaLabel="Content language"
          className="flex-1"
        />
        <Select
          value={region}
          onChange={setRegion}
          options={REGIONS}
          ariaLabel="Region"
          className="flex-1"
        />
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
    </SettingsSection>
  );
}
