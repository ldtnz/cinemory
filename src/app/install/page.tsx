"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";

// The "beforeinstallprompt" event (Chrome/Edge/Android) is not in the standard
// DOM types yet, so it is typed here.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "other";

function detectPlatform(): Platform {
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  return "other";
}

function isAlreadyInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari/iOS exposes this flag once the app has been added to the Home screen.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function Install() {
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installAccepted, setInstallAccepted] = useState(false);

  useEffect(() => {
    setInstalled(isAlreadyInstalled());
    setPlatform(detectPlatform());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstallAccepted(true);
    setPromptEvent(null);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--surface)_0%,var(--background)_70%)]" />

      <div className="relative flex w-[min(92vw,400px)] flex-col items-center gap-6 rounded-3xl border border-white/10 bg-surface/95 p-8 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] sm:p-10">
        <Image src="/icon-512.png" alt="Cinemory" width={64} height={64} className="rounded-2xl" priority />

        <div>
          <h1 className="text-xl font-semibold tracking-tight">Install Cinemory</h1>
          <p className="mt-1.5 text-xs text-muted">
            Add it to your Home screen to open it like an app — posters you have already seen work offline too.
          </p>
        </div>

        {installed || installAccepted ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-2xl bg-surface-2 px-4 py-5">
            <CheckCircle2 className="h-6 w-6 text-foreground" strokeWidth={1.8} />
            <p className="text-sm font-medium">Cinemory is already installed on this device.</p>
          </div>
        ) : platform === "ios" ? (
          <ol className="w-full space-y-3 text-left text-sm">
            <li className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                1
              </span>
              <span className="flex items-center gap-2">
                Tap the <Share className="h-4 w-4 flex-none" strokeWidth={1.8} /> &ldquo;Share&rdquo; icon in the Safari toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                2
              </span>
              <span className="flex items-center gap-2">
                Choose <SquarePlus className="h-4 w-4 flex-none" strokeWidth={1.8} /> &ldquo;Add to Home Screen&rdquo;.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                3
              </span>
              <span>Confirm with &ldquo;Add&rdquo;: the Cinemory icon appears on your Home screen.</span>
            </li>
          </ol>
        ) : promptEvent ? (
          <button
            type="button"
            onClick={install}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} />
            Install app
          </button>
        ) : (
          <div className="w-full space-y-2 rounded-2xl bg-surface-2 px-4 py-4 text-left text-sm text-muted">
            <p>
              Open your browser menu (usually top right) and look for &ldquo;Install app&rdquo; or &ldquo;Add to
              Home Screen&rdquo;.
            </p>
          </div>
        )}

        <Link href="/" className="text-xs font-medium text-muted hover:text-foreground">
          Back to the catalog
        </Link>
      </div>
    </div>
  );
}
