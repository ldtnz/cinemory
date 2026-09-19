"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CloudAlert, RotateCcw } from "lucide-react";
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
      <div className="flex w-[min(90vw,380px)] flex-col items-center gap-5 rounded-3xl border border-white/10 bg-surface/95 p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-foreground">
          <CloudAlert className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-base font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-xs leading-relaxed text-muted">
            The page stopped where it was. Your catalog is untouched — nothing on this screen
            writes to it.
          </p>
          {error.digest && (
            <p className="font-mono text-[10px] text-muted/70">Reference: {error.digest}</p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-3"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-xl bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-3"
          >
            Back to the catalog
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
