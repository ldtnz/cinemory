"use client";

import { useEffect, useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import LoginTerminal from "@/components/LoginTerminal";

const REDIRECT_SECONDS = 5;

/**
 * 404 page, in the same frame as the sign-in and error screens, with the
 * animated background in yellow. It redirects to the home page automatically
 * after a few seconds.
 */
export default function NotFoundGate() {
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (seconds <= 0) {
      // A full load, not router.replace: if this screen was reached from "/"
      // itself (a simulated or real notFound() on the home page), a client
      // navigation to "/" changes nothing and the screen stays.
      window.location.replace("/");
      return;
    }
    const timeout = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timeout);
  }, [seconds]);

  return (
    <AuthLayout background={<LoginTerminal tint="#f59e0b" />}>
      <div className="flex w-[min(90vw,380px)] flex-col items-center gap-8 rounded-3xl bg-surface bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.07),transparent_65%)] p-8 pb-10 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/60 sm:p-10">
        <div className="w-full space-y-3 text-left">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            Page not found.
          </h1>
          <p className="text-sm leading-snug text-foreground/65">
            This page does not exist. Going back to the catalog in {seconds}s...
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Reload even when the current URL is already the home page. */}
        <a
          href="/"
          className="flex w-full items-center justify-center rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Back to the catalog now
        </a>
      </div>
    </AuthLayout>
  );
}
