"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

/**
 * A small centred confirmation modal, styled to match the rest of the app
 * instead of the browser's native confirm(). Closes on Escape or a click on
 * the backdrop, same as the other modals (AddTitleCard, LoginGate).
 */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for destructive actions like deleting a title. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(90vw,360px)] flex-col items-center gap-4 rounded-3xl border border-white/10 bg-surface p-6 text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
      >
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
            danger ? "bg-red-500/15 text-red-400" : "bg-white/10 text-foreground"
          }`}
        >
          <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <h2 id="confirm-dialog-title" className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted">{description}</p>
        </div>
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-surface-2 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2/70"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
              danger ? "bg-red-500 text-white" : "bg-foreground text-background"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
