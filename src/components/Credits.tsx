const linkClass =
  "font-medium text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline";

/** The maker's credit, linking to their GitHub, plus the data attribution. */
export default function Credits({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Only the maker line, without the TMDB attribution. */
  compact?: boolean;
}) {
  return (
    <div
      className={`space-y-1 text-center text-xs leading-relaxed text-muted ${className}`}
    >
      <p>
        Made by{" "}
        <a
          href="https://github.com/ldtnz"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          ldtnz
        </a>{" "}
        for film lovers
      </p>
      {!compact && (
      <p>
        Film data and images from{" "}
        <a
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          TMDB
        </a>
        . Not endorsed or certified by TMDB.
      </p>
      )}
    </div>
  );
}
