"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { KeyRound, LogOut } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";

type Pending = { secret: string; qr: string; token: string };

const codeInputClass =
  "w-full max-w-xs rounded-2xl border border-white/5 bg-surface-2 py-3 text-center text-xl tracking-[0.5em] text-foreground outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20";

const buttonClass =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50";

/**
 * The two things you can do with the way you sign in: move it to another
 * authenticator, and end the session.
 *
 * Replacing the authenticator asks for a code from the one in use before it
 * will hand out a new secret, and for a code from the new one before it
 * writes it. Neither is ceremony: there is no password and no email here, so
 * a secret written without proof that someone can produce codes from it would
 * lock the catalog away for good.
 */
export default function SignInSettings({ backgroundPicker }: { backgroundPicker: ReactNode }) {
  const [step, setStep] = useState<"idle" | "current" | "new">("idle");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);

  function reset() {
    setStep("idle");
    setCode("");
    setPending(null);
    setError(null);
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw new Error((data?.error as string) ?? "That did not work.");
    return data;
  }

  async function startReplacement() {
    setBusy(true);
    setError(null);
    try {
      const data = (await post("/api/totp/start", { code })) as unknown as Pending;
      setPending(data);
      setCode("");
      setStep("new");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReplacement() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/totp/confirm", { token: pending.token, code });
      setReplaced(true);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      // The service worker keeps the last catalog so it can be read without a
      // network; leaving it there would mean signing out left it readable.
      // Caches live in the browser, so no response from the server can do it.
      if ("caches" in window) {
        const names = await caches.keys().catch(() => [] as string[]);
        await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
      }
    } finally {
      // A full load rather than a router push: the whole catalog is held in
      // memory by the page, and dropping it is half of what signing out
      // means. The lint rule asking for useRouter() is about ordinary
      // navigation, which this is not.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    }
  }

  return (
    <SettingsSection
      title="Signing in"
      description="A six-digit code from your authenticator app is the only way in — there is no password and no email to fall back on."
    >
      {step === "idle" && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex max-w-full flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => setStep("current")}>
              <KeyRound className="h-4 w-4" strokeWidth={1.8} />
              Use a different authenticator
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              Sign out
            </button>
          </div>
          <div className="w-full max-w-full sm:ml-auto sm:w-auto">{backgroundPicker}</div>
        </div>
      )}

      {step === "current" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            First, a code from the authenticator you use now. Without it a stolen session could
            move the sign-in somewhere else and leave you outside.
          </p>
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={codeInputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy || code.length !== 6}
              onClick={() => void startReplacement()}
            >
              {busy ? "Checking…" : "Continue"}
            </button>
            <button type="button" className={buttonClass} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "new" && pending && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Scan this with the new app, then type the code it shows. The old authenticator keeps
            working until you do — nothing has changed yet.
          </p>
          <div className="w-fit rounded-2xl bg-white p-2">
            <Image src={pending.qr} alt="QR code for the new authenticator" width={180} height={180} unoptimized />
          </div>
          <p className="font-mono text-[11px] break-all text-muted">
            Or type it in by hand: {pending.secret}
          </p>
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={codeInputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy || code.length !== 6}
              onClick={() => void confirmReplacement()}
            >
              {busy ? "Saving…" : "Use this authenticator"}
            </button>
            <button type="button" className={buttonClass} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {replaced && step === "idle" && (
        <p className="mt-3 text-xs text-accent-2">
          Done — sign in with the new authenticator from now on. You can delete the old entry.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </SettingsSection>
  );
}
