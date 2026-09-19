import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Shared sign-in and setup frame, scrollable when the content is taller than
 * the screen.
 *
 * Sized by an explicit 100dvh rather than by `inset-0`. In the installed PWA
 * on iOS the two are not the same: `inset-0` came out one status bar short,
 * so the frame started under the top safe area and stopped that far above the
 * bottom of the screen, leaving a band of bare page background below the
 * artwork. Every other screen draws on that same background and so never
 * showed it. `100dvh` is the whole screen there, and identical to `inset-0`
 * everywhere else.
 */
export default function AuthLayout({ background, children, showBrand = true }: { background: ReactNode; children: ReactNode; showBrand?: boolean }) {
  return (
    <div className="fixed inset-x-0 top-0 h-[100dvh] overflow-hidden bg-background">
      {background}
      <div className="auth-scrim pointer-events-none absolute inset-0" />

      <div className="absolute inset-0 overflow-y-auto">
        <div className="relative flex min-h-full flex-col items-center px-4 pt-[calc(6.5rem+env(safe-area-inset-top))] pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
          {showBrand && <div className="absolute left-1/2 top-[calc(2rem+env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={34}
              height={34}
              preload
              className="h-[34px] w-[34px] object-contain"
            />
            <span className="text-lg font-semibold tracking-tight">Cinemory</span>
          </div>}
          <div className="my-auto flex w-full shrink-0 justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}
