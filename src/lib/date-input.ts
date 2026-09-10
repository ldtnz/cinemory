/**
 * Shared conversions between `<input type="date">`'s value (always
 * "YYYY-MM-DD") and a real Date — used anywhere a watched date is entered by
 * hand, so an import and a manual edit agree on what "that calendar day"
 * means.
 */

/** Built from the Date's own local calendar fields, not a UTC slice, so the
 *  day shown matches what formatDate() elsewhere on the card already
 *  displays. */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The inverse: local midnight for that calendar day, the same convention
 *  src/lib/history.ts uses for a date parsed out of an import. */
export function fromDateInputValue(value: string): Date | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
