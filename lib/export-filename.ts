/**
 * `{style-number-or-name}-techpack.{ext}`, sanitised for a filename — shared
 * by the PDF and Excel export routes so the two downloads sit side by side.
 */
export function exportFilename(
  styleNumber: string | null,
  name: string,
  extension: "pdf" | "xlsx",
): string {
  const base = (styleNumber?.trim() || name)
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "product"}-techpack.${extension}`;
}
