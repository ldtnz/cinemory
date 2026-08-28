"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, Copy, KeyRound, Languages } from "lucide-react";
import { LANGUAGES, REGIONS } from "@/lib/locales";

type Step = "preferences" | "totp";

/**
 * First-run wizard, shown once instead of LoginGate: pick the TMDB content
 * language/region, then scan a QR code (or enter its code by hand) into an
 * authenticator app and prove it by typing back the 6-digit code it produces.
 * Only that last step writes the TOTP secret to the database — see
 * /api/setup/totp/confirm.
 */
export default function SetupWizard({ posterUrl }: { posterUrl: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("preferences");

  const [language, setLanguage] = useState("en-US");
  const [region, setRegion] = useState("US");
  const [savingPreferences, setSavingPreferences] = useState(false);

  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function startTotp() {
    setSavingPreferences(true);
    setError(null);
    try {
      const prefsRes = await fetch("/api/setup/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, region }),
      });
      if (!prefsRes.ok) throw new Error("Could not save preferences.");

      const totpRes = await fetch("/api/setup/totp/start", { method: "POST" });
      if (!totpRes.ok) throw new Error("Could not start TOTP setup.");
      const data = (await totpRes.json()) as { secret: string; qr: string; token: string };
      setSecret(data.secret);
      setQr(data.qr);
      setToken(data.token);
      setStep("totp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the code is still shown as text.
    }
  }

  async function confirmTotp() {
    if (!token || code.length !== 6) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Invalid code.");
        setConfirming(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-3 opacity-90 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4 sm:p-5">
        {posterUrl.map((url, i) => (
          <div key={i} className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2">
            <Image src={url} alt="" fill unoptimized sizes="190px" className="object-cover" />
          </div>
        ))}
      </div>

      <div className="absolute inset-0 bg-background/45 backdrop-blur-xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_75%)]" />

      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4">
        <div className="flex w-[min(92vw,420px)] flex-col items-center gap-5 rounded-3xl border border-white/10 bg-surface/95 p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] sm:p-10">
          {step === "preferences" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-foreground">
                <Languages className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Welcome to Cinemory</h1>
                <p className="mt-1.5 text-xs text-muted">
                  Pick the language and region TMDB uses for posters, ratings and genres. You can
                  change this later from Settings.
                </p>
              </div>

              {error && (
                <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-medium text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                  {error}
                </div>
              )}

              <div className="w-full space-y-3 text-left">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                    Content language
                  </span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-11 w-full rounded-xl border border-white/5 bg-surface-2 px-3 text-sm text-foreground outline-none focus:border-white/30"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                    Region
                  </span>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="h-11 w-full rounded-xl border border-white/5 bg-surface-2 px-3 text-sm text-foreground outline-none focus:border-white/30"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={startTotp}
                disabled={savingPreferences}
                className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingPreferences ? "Continuing..." : "Continue"}
              </button>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-foreground">
                <KeyRound className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Set up sign-in</h1>
                <p className="mt-1.5 text-xs text-muted">
                  Scan this QR code with an authenticator app (1Password, Aegis, Google
                  Authenticator...), or enter the code below by hand.
                </p>
              </div>

              {qr && (
                <div className="rounded-2xl bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, next/image cannot optimise it */}
                  <img src={qr} alt="Setup QR code" width={200} height={200} />
                </div>
              )}

              {secret && (
                <button
                  type="button"
                  onClick={copySecret}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs font-mono tracking-wider text-foreground hover:bg-surface-2/70"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                  ) : (
                    <Copy className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                  )}
                  {secret}
                </button>
              )}

              {error && (
                <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-medium text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                  {error}
                </div>
              )}

              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-2xl border border-white/5 bg-surface-2 py-3.5 text-center text-2xl tracking-[0.6em] text-foreground outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20"
              />

              <button
                type="button"
                onClick={confirmTotp}
                disabled={confirming || code.length !== 6}
                className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {confirming ? "Confirming..." : "Confirm and finish"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
