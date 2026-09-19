"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CloudOff } from "lucide-react";
import { useOnline, WRITE_FAILED_EVENT } from "@/lib/offline";

/**
 * Says so when the catalog on screen is the saved copy.
 *
 * The service worker keeps the last version of the page, so losing the
 * network does not empty the app — it leaves it looking exactly as it did,
 * which is the problem: every button is still there, and none of them can
 * reach the database. This is the one piece of that state the app owes the
 * reader.
 */
export default function OfflineNotice() {
  const online = useOnline();
  const [failure, setFailure] = useState<{ message: string } | null>(null);

  useEffect(() => {
    const showFailure = (event: Event) => {
      setFailure({ message: (event as CustomEvent<string>).detail });
    };
    window.addEventListener(WRITE_FAILED_EVENT, showFailure);
    return () => window.removeEventListener(WRITE_FAILED_EVENT, showFailure);
  }, []);

  useEffect(() => {
    if (!failure) return;
    const timer = window.setTimeout(() => setFailure(null), 4500);
    return () => window.clearTimeout(timer);
  }, [failure]);

  if (online && !failure) return null;
  const Icon = failure ? CircleAlert : CloudOff;

  return (
    <div
      role="status"
      className="offline-notice pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] flex justify-center px-3 sm:px-5"
    >
      <div className="auth-step-in flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-surface/95 px-3 py-2 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        <Icon aria-hidden="true" className={`h-4 w-4 flex-none ${failure ? "text-red-400" : "text-muted"}`} strokeWidth={1.8} />
        <p className="text-xs leading-4 text-muted">
          {failure ? (
            <span className="text-foreground">{failure.message}</span>
          ) : (
            <>
              <span className="font-medium text-foreground">Offline</span>
              <span aria-hidden="true" className="mx-1.5 text-muted/50">·</span>
              Reconnect to save changes.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
