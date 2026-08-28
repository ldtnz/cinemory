"use client";

import { useEffect } from "react";

/** Disables the right-click context menu across the site. */
export default function DisableContextMenu() {
  useEffect(() => {
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  return null;
}
