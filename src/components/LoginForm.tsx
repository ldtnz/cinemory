"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import CodeInput from "@/components/CodeInput";

export default function LoginForm({ errorMessage }: { errorMessage: string | null }) {
  const [pending, setPending] = useState(false);
  const [visibleError, setVisibleError] = useState(errorMessage);
  const submitting = useRef(false);

  // A restored page must allow another attempt after browser back navigation.
  useEffect(() => {
    const reset = () => {
      submitting.current = false;
      setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      aria-busy={pending}
      onSubmit={(event) => {
        if (submitting.current) {
          event.preventDefault();
          return;
        }
        submitting.current = true;
        setPending(true);
      }}
      method="POST"
      action="/api/login"
      className="flex w-[min(90vw,380px)] flex-col items-center gap-8 rounded-3xl bg-surface bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.07),transparent_65%)] p-8 pb-10 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/60 sm:p-10"
    >
      <div className="w-full space-y-3 text-left">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Welcome back.</h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          Enter your 6-digit code<br />
          from your authenticator app.
        </p>
      </div>

      <div className="relative flex w-full flex-col gap-2">
        <CodeInput
          autoFocus
          readOnly={pending}
          invalid={Boolean(visibleError)}
          describedBy={visibleError ? "login-error" : undefined}
          onCodeChange={() => setVisibleError(null)}
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
        >
          {pending && <LoaderCircle aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          <span role="status">{pending ? "Verifying…" : "Sign in"}</span>
        </button>
        <div className="absolute inset-x-0 top-full mt-1 flex min-h-8 items-center" id="login-error" role="alert">
          {visibleError && (
            <p className="flex items-center gap-1.5 text-xs leading-4 text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {visibleError}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
