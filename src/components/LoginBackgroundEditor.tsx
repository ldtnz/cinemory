"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";
import Select from "@/components/Select";
import { POSTER_WALL_MINIMUM, type LoginBackground } from "@/lib/login-background";

const OPTIONS = [
  { value: "auto", label: "Automatic" },
  { value: "posters", label: "Poster wall" },
  { value: "terminal", label: "Terminal animation" },
];

/** What the sign-in screen shows behind its card. */
export default function LoginBackgroundEditor({
  initial,
  postersAvailable,
}: {
  initial: LoginBackground;
  postersAvailable: number;
}) {
  const [background, setBackground] = useState<string>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function save(value: string) {
    const previous = background;
    setBackground(value);
    setError(false);
    const res = await fetch("/api/settings/login-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background: value }),
    }).catch(() => null);

    if (!res?.ok) {
      // Put the picker back where it was rather than showing a choice that
      // was not saved.
      setBackground(previous);
      setError(true);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const automatic =
    postersAvailable >= POSTER_WALL_MINIMUM
      ? "which is the poster wall, on this catalog"
      : `which is the animation until ${POSTER_WALL_MINIMUM} titles have artwork — ${postersAvailable.toLocaleString()} do so far`;

  return (
    <SettingsSection
      title="Sign-in screen"
      description={`Behind the code field: your own posters drifting in columns, or an animation that needs no catalog. Automatic picks for you, ${automatic}.`}
    >
      <div className="flex items-center gap-3">
        <Select
          value={background}
          onChange={(value) => void save(value)}
          options={OPTIONS}
          ariaLabel="Sign-in screen background"
          className="w-56"
        />
        {saved && (
          <span className="flex items-center gap-1 text-xs text-accent-2">
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
            Saved
          </span>
        )}
        {error && <span className="text-xs text-red-400">Could not save that.</span>}
      </div>
    </SettingsSection>
  );
}
