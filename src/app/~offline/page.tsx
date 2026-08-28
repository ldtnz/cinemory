import { WifiOff } from "lucide-react";

// Fallback page shown by the service worker when the device is offline and the
// requested page is not already cached (see src/app/sw.ts). It has to stay a
// static page with no database calls: when the device really is offline no
// server code runs, only the HTML precached at build time is served.
export default function Offline() {
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--surface)_0%,var(--background)_70%)]" />

      <div className="relative flex w-[min(90vw,360px)] flex-col items-center gap-5 rounded-3xl border border-white/10 bg-surface/95 p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-foreground">
          <WifiOff className="h-5 w-5" strokeWidth={1.8} />
        </div>

        <div>
          <h1 className="text-xl font-semibold tracking-tight">You are offline</h1>
          <p className="mt-1.5 text-xs text-muted">
            Check your connection. Pages and posters you already visited stay available.
          </p>
        </div>

        {/* A "real" link (not next/link) on purpose: this needs a full reload
            that actually retries the network, not a client navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Try again
        </a>
      </div>
    </div>
  );
}
