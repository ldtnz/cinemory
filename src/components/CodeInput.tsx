"use client";

import { useState } from "react";

const LENGTH = 6;

/**
 * The six-digit code, drawn as one box per digit.
 *
 * One real input behind six boxes, rather than six inputs: pasting a code,
 * the one-time-code autofill iOS and Android offer, and the numeric keyboard
 * all work on a single field and all have to be re-implemented across six.
 * The input is transparent and covers the boxes, so a tap anywhere lands on
 * it; the boxes are decoration and hidden from screen readers, which are left
 * with the labelled field itself.
 *
 * The form still posts to /api/login the way it always did — this only
 * changes what the field looks like.
 *
 * Which box is lit follows the input's own focus through CSS
 * (:focus-within on the wrapper), rather than an onFocus handler: the field is focused on arrival, before
 * React has attached anything to it, so a handler would not run until the
 * reader clicked away and back — and the box would sit dark while they typed
 * into it.
 */
export default function CodeInput({ autoFocus = false, autoSubmit = true, readOnly = false, invalid = false, describedBy, onCodeChange }: {
  autoFocus?: boolean;
  autoSubmit?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onCodeChange?: (code: string) => void;
}) {
  const [code, setCode] = useState("");

  // The box the next digit will go in, which is the last one once it is full.
  const active = Math.min(code.length, LENGTH - 1);

  return (
    <div className="group relative w-full">
      <input
        name="code"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={LENGTH}
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        required
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label="Six-digit code from your authenticator app"
        value={code}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
          setCode(digits);
          onCodeChange?.(digits);
          // The last digit of a code is the whole of the intent: waiting for a
          // separate press on Sign in is a step nobody wants at this point.
          if (autoSubmit && digits.length === LENGTH) e.target.form?.requestSubmit();
        }}
        // Over the boxes rather than beside them: one field to focus, and the
        // caret would only compete with the box that is already lit.
        className="absolute inset-0 z-10 h-full w-full cursor-default rounded-xl text-transparent caret-transparent opacity-0 outline-none"
      />

      <div aria-hidden className="grid w-full grid-cols-[repeat(3,minmax(0,1fr))_0.35fr_repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-2">
        {Array.from({ length: LENGTH }, (_, i) => {
          const filled = i < code.length;
          return (
            <div
              key={i}
              style={{ gridColumn: i < 3 ? i + 1 : i + 2 }}
              className={`flex aspect-square min-w-0 items-center justify-center rounded-lg border transition-colors ${
                invalid ? "border-red-400/60 bg-red-400/5" : filled ? "border-white/15 bg-surface-2" : "border-white/10 bg-surface-2/60"
              } ${
                i === active && !invalid
                  ? "group-focus-within:border-accent-select/60 group-focus-within:bg-accent-select/10"
                  : ""
              }`}
            >
              {filled && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
