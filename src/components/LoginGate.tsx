import Image from "next/image";
import { KeyRound, AlertCircle } from "lucide-react";

/**
 * Sign-in screen, shown when there is no valid session. Behind it, a grid of
 * the real posters (images only, no titles or data) blurred by an overlay; on
 * top, the card for entering the 6-digit OTP code from your authenticator app.
 */
export default function LoginGate({
  posterUrl,
  error,
}: {
  posterUrl: string[];
  error?: string;
}) {
  const errorMessage =
    error === "locked"
      ? "Too many attempts. Try again in a few seconds."
      : error === "code"
        ? "Invalid code."
        : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-3 opacity-90 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4 sm:p-5">
        {posterUrl.map((url, i) => (
          <div key={i} className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2">
            <Image src={url} alt="" fill sizes="190px" className="object-cover" />
          </div>
        ))}
      </div>

      <div className="absolute inset-0 bg-background/45 backdrop-blur-xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_75%)]" />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <form
          method="POST"
          action="/api/login"
          className="flex w-[min(90vw,360px)] flex-col items-center gap-5 rounded-3xl border border-white/10 bg-surface/95 p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] sm:p-10"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-foreground">
            <KeyRound className="h-5 w-5" strokeWidth={1.8} />
          </div>

          <h1 className="text-xl font-semibold tracking-tight">Cinemory</h1>

          {errorMessage && (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-medium text-red-400">
              <AlertCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
              {errorMessage}
            </div>
          )}

          <input
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
            className="w-full rounded-2xl border border-white/5 bg-surface-2 py-3.5 text-center text-2xl tracking-[0.6em] text-foreground outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20"
          />

          <button
            type="submit"
            className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Entra
          </button>
        </form>
      </div>
    </div>
  );
}
