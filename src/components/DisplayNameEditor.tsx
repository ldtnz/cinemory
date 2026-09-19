"use client";

import { useState } from "react";
import SettingsSection from "@/components/SettingsSection";
import { Check } from "lucide-react";
import { DISPLAY_NAME_MAX } from "@/lib/settings-limits";

/** Lets the name chosen during setup be changed later, or cleared. */
export default function DisplayNameEditor({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.replace(/\s+/g, " ").trim();
  const dirty = trimmed !== savedName;

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/setup/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save your name.");
      }
      setSavedName(trimmed);
      setName(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection title="Your name" description="What the app calls you. Leave it empty to go without.">
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty && !saving) void save();
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="given-name"
          placeholder="Your name"
          aria-label="Your name"
          className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-4 text-sm text-foreground outline-none transition-shadow placeholder:text-muted focus:ring-1 focus:ring-foreground/30"
        />
        <button
          type="submit"
          disabled={!dirty || saving}
          className="inline-flex h-10 w-full flex-none items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 text-xs font-medium text-background disabled:opacity-50 sm:w-auto"
        >
          {saved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
