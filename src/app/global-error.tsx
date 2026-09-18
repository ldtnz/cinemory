"use client";

/**
 * The last resort: an error in the root layout itself, where error.tsx cannot
 * help because the layout it lives inside is the thing that failed. It has to
 * bring its own <html> and <body>, and it cannot rely on anything the layout
 * sets up — not the fonts, not the stylesheet — so the few colours it needs
 * are written out here rather than taken from the theme.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090a",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1rem", fontWeight: 600 }}>Cinemory could not start</h1>
          <p style={{ fontSize: "0.8rem", lineHeight: 1.6, color: "#a1a1aa" }}>
            Something failed before the app could draw itself. Your catalog is in the database and
            is not affected.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.7rem", color: "#71717a" }}>Reference: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              height: "2.5rem",
              padding: "0 1rem",
              borderRadius: "0.75rem",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "#18181b",
              color: "#fafafa",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
