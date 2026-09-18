"use client";

import { CloudOff } from "lucide-react";
import { useOnline } from "@/lib/offline";

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
  if (online) return null;

  return (
    <div
      role="status"
      className="tooltip-in pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
    >
      <p className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface/95 px-3 py-2 text-[11px] font-medium text-muted shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur">
        <CloudOff className="h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
        Offline — this is your saved catalog. Changes cannot be saved.
      </p>
    </div>
  );
}
