"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` is read after mount rather than during render: the
 * server has no such thing, and rendering "offline" on the server and
 * "online" in the browser is a hydration mismatch. Assuming online until
 * told otherwise is also the right default — this drives a warning, and a
 * warning that flashes on every load would be worse than one that arrives a
 * frame late.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/**
 * fetch that answers with null instead of throwing when the request never
 * left the machine.
 *
 * The catalog is browsable offline — the service worker serves the last copy
 * of the page — so its buttons are all still there to be pressed, and a bare
 * fetch rejects on a dead network. Every caller here treats a failure as
 * "nothing changed" already; without this they never reach that code, and
 * the tap silently does nothing at all.
 */
export async function send(input: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}

/**
 * What to tell someone whose change did not happen: the reason, when the
 * reason is plain, and the caller's own wording otherwise.
 */
export function writeFailed(message: string): string {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "You are offline, so nothing was changed. Try again once you are back."
    : message;
}
