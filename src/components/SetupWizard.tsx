"use client";

import Image from "next/image";
import AuthLayout from "@/components/AuthLayout";
import LoginTerminal from "@/components/LoginTerminal";
import CodeInput from "@/components/CodeInput";
import ImportHistory from "@/components/ImportHistory";
import Select from "@/components/Select";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, Copy, LoaderCircle } from "lucide-react";
import { LANGUAGES, REGIONS } from "@/lib/locales";

type Step = "welcome" | "preferences" | "totp" | "import";

/**
 * First-run wizard, shown once instead of LoginGate: pick the TMDB content
 * language/region, then scan a QR code (or enter its code by hand) into an
 * authenticator app and prove it by typing back the 6-digit code it produces.
 * Only that last step writes the TOTP secret to the database — see
 * /api/setup/totp/confirm.
 */
export default function SetupWizard({ initialStep = "welcome" }: { initialStep?: Step } = {}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);

  const [language, setLanguage] = useState("en-US");
  const [region, setRegion] = useState("US");
  const [savingPreferences, setSavingPreferences] = useState(false);

  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);

  /** The server's own reason, when it gave one. Setting this up is the one
   *  moment where what went wrong is usually a deployment detail — a missing
   *  SESSION_SECRET, an install already configured — and only the server knows
   *  which. A generic "could not" here leaves the reader with nothing to act
   *  on and the answer sitting unread in the response body. */
  async function reason(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? fallback;
  }

  async function startTotp() {
    if (savingPreferences) return;
    setSavingPreferences(true);
    setError(null);
    try {
      const prefsRes = await fetch("/api/setup/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, region }),
      });
      if (!prefsRes.ok) throw new Error(await reason(prefsRes, "Could not save preferences."));

      const totpRes = await fetch("/api/setup/totp/start", { method: "POST" });
      if (!totpRes.ok) throw new Error(await reason(totpRes, "Could not start TOTP setup."));
      const data = (await totpRes.json()) as { secret: string; qr: string; token: string };
      setSecret(data.secret);
      setQrLoaded(false);
      setQrFailed(false);
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
    if (confirming || !token || code.length !== 6) return;
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
      setConfirming(false);
      setStep("import");
    } catch {
      setError("Something went wrong.");
      setConfirming(false);
    }
  }

  async function finishSetup() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/complete", { method: "POST" });
      if (!res.ok) throw new Error(await reason(res, "Could not finish setup."));
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup.");
      setFinishing(false);
    }
  }

  return (
    <AuthLayout background={<LoginTerminal />} showBrand={step !== "welcome"}>
      <div key={step} aria-busy={savingPreferences || confirming} className="auth-step-in flex w-[min(90vw,420px)] flex-col items-center gap-6 rounded-3xl bg-surface bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.07),transparent_65%)] p-8 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/60 sm:p-10">
        {step !== "welcome" && (
          <p className="w-full text-xs font-medium text-accent-select">
            Step {step === "preferences" ? "1" : step === "totp" ? "2" : "3"} of 3
          </p>
        )}
        {step === "welcome" ? (
          <div className="flex w-full flex-col items-center gap-8 py-2 text-center">
            <Image src="/logo.png" alt="" width={96} height={96} preload className="h-24 w-24 object-contain" />
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold leading-tight tracking-tight">Welcome to Cinemory.</h1>
              <p className="text-sm leading-relaxed text-foreground/65">
                A home for everything you watch.<br />
                Keep your movies and series together, and find what to watch next.
              </p>
            </div>
            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={() => setStep("preferences")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                Get started
              </button>
              <p className="text-xs text-muted">Three quick steps to make it yours.</p>
            </div>
          </div>
        ) : step === "preferences" ? (
          <>
            <div className="w-full space-y-3 text-left">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Make it yours.</h1>
              <p className="text-sm leading-relaxed text-foreground/65">
                Pick the language and region used for posters, ratings and genres. You can change
                this later from Settings.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-medium text-red-400">
                <AlertCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                {error}
              </div>
            )}

            <div className="w-full space-y-3 text-left">
              <div className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                  Content language
                </span>
                <Select
                  value={language}
                  onChange={setLanguage}
                  disabled={savingPreferences}
                  options={LANGUAGES}
                  ariaLabel="Content language"
                  className="h-11 w-full"
                />
              </div>

              <div className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                  Region
                </span>
                <Select
                  value={region}
                  onChange={setRegion}
                  disabled={savingPreferences}
                  options={REGIONS}
                  ariaLabel="Region"
                  className="h-11 w-full"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={startTotp}
              disabled={savingPreferences}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingPreferences && <LoaderCircle aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              <span role="status">{savingPreferences ? "Preparing your setup…" : "Continue"}</span>
            </button>
          </>
        ) : step === "totp" ? (
          <>
            <div className="w-full space-y-3 text-left">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Secure your collection.</h1>
              <p className="text-sm leading-relaxed text-foreground/65">
                Scan this QR code with an authenticator app (1Password, Aegis, Google
                Authenticator...), or enter the code below by hand.
              </p>
            </div>

            {qr && (
              <div className="relative rounded-2xl bg-white p-3" aria-busy={!qrLoaded && !qrFailed}>
                {!qrLoaded && (
                  <div className="absolute inset-3 flex flex-col items-center justify-center gap-3 rounded-lg bg-zinc-100 text-center text-xs text-zinc-600" role="status">
                    {qrFailed ? "QR code unavailable. Use the setup key below." : (
                      <>
                        <LoaderCircle aria-hidden className="h-6 w-6 animate-spin motion-reduce:animate-none" />
                        Loading QR code…
                      </>
                    )}
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, next/image cannot optimise it */}
                <img
                  src={qr}
                  alt="Setup QR code"
                  width={200}
                  height={200}
                  onLoad={() => setQrLoaded(true)}
                  onError={() => setQrFailed(true)}
                  className={`h-[200px] w-[200px] transition-opacity duration-300 motion-reduce:transition-none ${qrLoaded ? "opacity-100" : "opacity-0"}`}
                />
              </div>
            )}

            {secret && (
              <button
                type="button"
                onClick={copySecret}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 min-w-0 text-xs font-mono break-all text-foreground hover:bg-surface-2/70"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                ) : (
                  <Copy className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                )}
                <span className="min-w-0 break-all">{secret}</span>
              </button>
            )}

            {error && (
              <div
                role="alert"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-medium text-red-400">
                <AlertCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
                {error}
              </div>
            )}

            <CodeInput
              autoFocus
              autoSubmit={false}
              readOnly={confirming}
              invalid={Boolean(error)}
              onCodeChange={(value) => {
                setCode(value);
                setError(null);
              }}
            />

            <button
              type="button"
              onClick={confirmTotp}
              disabled={confirming || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {confirming && <LoaderCircle aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              <span role="status">{confirming ? "Verifying…" : "Verify and continue"}</span>
            </button>
          </>
        ) : (
          <>
            <div className="w-full space-y-3 text-left">
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
                Bring your history with you.
              </h1>
              <p className="text-sm leading-relaxed text-foreground/65">
                Import what you have already watched from a streaming service. Pick yours and
                the steps will guide you through it.
              </p>
            </div>

            <div className="w-full">
              <ImportHistory
                embedded
                onImported={() => void finishSetup()}
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-400">{error}</p>
            )}

            <button
              type="button"
              onClick={() => void finishSetup()}
              disabled={finishing}
              className="inline-flex items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              {finishing && <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
              <span role="status">{finishing ? "Opening your catalog…" : "Continue without importing"}</span>
            </button>

          </>
        )}
      </div>
    </AuthLayout>
  );
}
