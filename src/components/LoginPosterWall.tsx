import Image from "next/image";

/** Columns across the screen, by width. Kept in step with the grid below. */
const COLUMNS = { base: 3, sm: 5, lg: 7 } as const;

/**
 * The catalog itself, behind the sign-in card: columns of real posters
 * drifting, alternate ones up and down, slowly enough that the movement is
 * noticed rather than watched.
 *
 * Artwork only — no titles, no dates, nothing a stranger at the URL could
 * read off it that the poster does not already say. Rendered on the server
 * with no JavaScript of its own: the drift is two CSS keyframes.
 */
export default function LoginPosterWall({ posterUrl }: { posterUrl: string[] }) {
  if (posterUrl.length === 0) return null;

  // Dealt round-robin rather than sliced, so a short catalog thins every
  // column evenly instead of leaving the last ones empty.
  const columns: string[][] = Array.from({ length: COLUMNS.lg }, () => []);
  posterUrl.forEach((url, i) => columns[i % COLUMNS.lg].push(url));

  return (
    <div
      aria-hidden
      className="absolute inset-0 grid grid-cols-3 gap-3 overflow-hidden sm:grid-cols-5 lg:grid-cols-7"
    >
      {columns.map((column, index) => (
        <div
          key={index}
          className={`relative overflow-hidden ${index >= COLUMNS.base ? "hidden sm:block" : ""} ${
            index >= COLUMNS.sm ? "sm:hidden lg:block" : ""
          }`}
        >
          <div
            className="login-wall-column absolute inset-x-0 top-0"
            data-direction={index % 2 === 1 ? "down" : "up"}
            // Every column a little slower than the last, so they do not march
            // in formation. Minutes, not seconds: this is a background.
            style={{ animationDuration: `${(140 + index * 18) * 6}s` }}
          >
            {[...column, ...column].map((url, i) => (
              <div key={i} className="pb-3">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2">
                  <Image
                    src={url}
                    alt=""
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 15vw"
                    className="object-cover saturate-[0.75]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
