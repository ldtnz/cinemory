import type { ReactNode } from "react";

/**
 * The shape every block on the settings page takes.
 *
 * They had drifted: most were a rounded card, two were bare text under a
 * horizontal rule, and one had its heading outside the card its body drew for
 * itself — so the page read as four different designs stacked up. The shell,
 * the heading and the spacing under it are defined once here; sections supply
 * only their own body.
 */
export default function SettingsSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  /** The line under the heading. Sections whose state decides the wording
   *  (how many posters are missing, say) pass a node rather than a string. */
  description?: ReactNode;
  /** Only where it carries meaning — the sparkle that marks what Claude does. */
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
