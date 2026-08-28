"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";

const REDIRECT_SECONDS = 5;

/**
 * 404 page, in the same style as the login screen: a grid of real posters
 * blurred into the background, with a centred card matching the app palette.
 * It redirects to the home page automatically after a few seconds.
 */
export default function NotFoundGate({ posterUrl }: { posterUrl: string[] }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (seconds <= 0) {
      router.replace("/");
      return;
    }
    const timeout = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timeout);
  }, [seconds, router]);

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
        <div className="flex w-[min(90vw,360px)] flex-col items-center gap-5 rounded-3xl border border-white/10 bg-surface/95 p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-foreground">
            <Compass className="h-5 w-5" strokeWidth={1.8} />
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
            <p className="mt-1.5 text-xs text-muted">
              This page does not exist. Going back to the catalog in {seconds}s...
            </p>
          </div>

          <Link
            href="/"
            className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Back to the catalog now
          </Link>
        </div>
      </div>
    </div>
  );
}
