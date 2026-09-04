"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";

const MENU_WIDTH = 152;

/**
 * The custom right-click / long-press menu for a catalog card. Same DOM
 * event on desktop (right-click) and touch (long-press) — see
 * DisableContextMenu, which still blocks the native menu everywhere this
 * component isn't listening.
 */
export default function TitleContextMenu({
  x,
  y,
  editing,
  onToggleEdit,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  editing: boolean;
  onToggleEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Clamped after the first paint, once the menu's real height is known —
  // starting flush with the cursor would let it render off-screen for a frame.
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
      style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
      className={`fixed z-50 flex flex-col gap-0.5 rounded-2xl border border-white/10 bg-surface/95 p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur transition-opacity ${
        position.visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onToggleEdit();
          onClose();
        }}
        className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground hover:bg-white/5"
      >
        <Pencil className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.8} />
        {editing ? "Exit edit mode" : "Edit"}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
        Delete
      </button>
    </div>,
    document.body,
  );
}
