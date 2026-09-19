import Image from "next/image";

/**
 * Shown while the catalog is being loaded from the server.
 *
 * A smaller, subdued version of the centred app icon keeps page transitions
 * unobtrusive.
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
        className="h-[4.2rem] w-[4.2rem] animate-pulse brightness-[0.4]"
      />
    </div>
  );
}
