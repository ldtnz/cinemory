import { RotateCcw } from "lucide-react";

/**
 * Overlay that covers the app when the phone is turned to landscape.
 *
 * It holds no logic: it is always mounted and the media query in globals.css
 * shows or hides it. That way there is no flash on startup and it appears the
 * instant the phone rotates, without waiting for React.
 */
export default function LandscapeNotice() {
  return (
    <div className="landscape-notice fixed inset-0 z-[100] items-center justify-center bg-background/70 p-6 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
          <RotateCcw className="h-6 w-6 text-foreground" strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Rotate your device</p>
          <p className="text-sm text-muted">Cinemory is portrait only.</p>
        </div>
      </div>
    </div>
  );
}
