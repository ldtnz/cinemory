import Image from "next/image";

/**
 * Shown while the catalog is being loaded from the server.
 *
 * It repeats the centred icon of the native splash screens (the manifest on
 * Android, apple-touch-startup-image on iOS): launching the app from the home
 * screen shows one single thing from startup to catalog, with no intermediate
 * step that looks different.
 */
export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <Image
        src="/logo.png"
        alt="Cinemory"
        width={96}
        height={96}
        priority
        className="h-24 w-24 animate-pulse"
      />
    </div>
  );
}
