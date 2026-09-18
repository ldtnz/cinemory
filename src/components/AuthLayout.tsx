import Image from "next/image";
import type { ReactNode } from "react";

/** Shared sign-in and setup frame, scrollable when the content is taller than the screen. */
export default function AuthLayout({ background, children, showBrand = true }: { background: ReactNode; children: ReactNode; showBrand?: boolean }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {background}
      <div className="absolute inset-0 bg-background/45" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,var(--background)_95%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(9,9,10,0.3),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(12rem+env(safe-area-inset-top))] bg-[radial-gradient(ellipse_at_top,rgba(9,9,10,0.75),transparent_70%)]" />

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
