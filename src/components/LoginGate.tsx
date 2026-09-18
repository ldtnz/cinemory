import { KeyRound, AlertCircle } from "lucide-react";
import CodeInput from "@/components/CodeInput";
import LoginPosterWall from "@/components/LoginPosterWall";
import LoginTerminal from "@/components/LoginTerminal";

/**
 * Sign-in screen, shown when there is no valid session.
 *
 * Behind the card, the catalog: columns of its own posters drifting slowly in
 * alternate directions — so the app is recognisably itself before anyone
 * signs in, while everything it can actually do stays behind the code. A
 * catalog with too few posters to fill those columns gets the terminal
 * animation instead; Settings can force either (src/lib/login-background.ts).
 *
 * The card is glass rather than a solid panel, which is the whole point of
 * having something worth seeing behind it.
 */
export default function LoginGate({
  posterUrl,
  background,
  error,
}: {
  posterUrl: string[];
  background: "posters" | "terminal";
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
      {background === "posters" ? <LoginPosterWall posterUrl={posterUrl} /> : <LoginTerminal />}

      {/* Enough to read a card over, not enough to hide what is behind it —
          the blur that used to be here made the posters a texture. */}
      <div className="absolute inset-0 bg-background/45" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,var(--background)_95%)]" />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <form
          method="POST"
          action="/api/login"
          className="flex w-[min(90vw,360px)] flex-col items-center gap-5 rounded-3xl border border-white/15 bg-white/[0.06] p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-10"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-foreground">
            <KeyRound className="h-5 w-5" strokeWidth={1.8} />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Cinemory</h1>
            <p className="text-xs text-muted">The 6-digit code from your authenticator app</p>
          </div>

          {errorMessage && (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-400/10 px-3 py-2 text-xs font-medium text-red-400">
              <AlertCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
              {errorMessage}
            </div>
          )}

          <CodeInput autoFocus />

          <button
            type="submit"
            className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
