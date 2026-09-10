"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The positioning/portal/dismissal shell shared by every custom right-click
 * / long-press menu in the catalog: clamped to the viewport once its real
 * size is known (starting flush with the cursor would let it render
 * off-screen for a frame), closed on an outside click, Escape, scroll, or
 * resize. Callers supply only their own menu items as children.
 */
export default function ContextMenuShell({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, visible: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, innerWidth - rect.width - 8);
    const top = Math.min(y, innerHeight - rect.height - 8);
    setPosition({ left: Math.max(8, left), top: Math.max(8, top), visible: true });
  }, [x, y]);

  useEffect(() => {
    function onPointerDown(e: Event) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: position.left, top: position.top }}
      // Width follows the longest item, with that width kept as the floor so
      // a short menu doesn't shrink below it.
      className={`fixed z-50 flex min-w-[152px] flex-col gap-0.5 rounded-2xl border border-white/10 bg-surface/95 p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur transition-opacity ${
        position.visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}
