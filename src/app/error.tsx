"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import LoginTerminal from "@/components/LoginTerminal";

/**
 * What a crash looks like.
 *
 * There was no error boundary anywhere in the app, which in production meant
 * Next's bare "Application error: a client-side exception has occurred" — no
 * styling, no explanation, and no way back other than retyping the address.
 * The catalog is safe in either case (nothing here writes), so the useful
 * thing to offer is the two ways out.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The browser console is the only log a self-hosted instance has; on
    // Vercel this also reaches the function logs.
    console.error(error);
  }, [error]);

  return (
    <AuthLayout background={<LoginTerminal tint="#e5484d" />}>
      <div className="flex w-[min(90vw,380px)] flex-col items-center gap-8 rounded-3xl bg-surface bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.07),transparent_65%)] p-8 pb-10 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/60 sm:p-10">
        <div className="w-full space-y-3 text-left">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            Something went wrong.
          </h1>
          <p className="text-sm leading-snug text-foreground/65">
            The page stopped where it was. Your catalog is untouched.
          </p>
          {error.digest && (
            <p className="font-mono text-[10px] text-muted/70">Reference: {error.digest}</p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} />
            Try again
          </button>
          {/* A plain anchor, not <Link>: when the crash happened on "/" itself a
              client-side navigation to "/" changes nothing and the boundary
              stays put. A full load starts the page over. */}
          <a
            href="/"
            className="flex w-full items-center justify-center rounded-xl bg-surface-2 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-3"
          >
            Back to the catalog
          </a>
        </div>
      </div>
    </AuthLayout>
  );
}
