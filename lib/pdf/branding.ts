/**
 * The ONE place the exported PDF's brand identity lives: product name, share
 * base, and the document chrome palette every PDF page (canvas, cover, BOM)
 * draws with. Copy/branding changes happen here, never inline in a renderer.
 */

export const PDF_BRAND_NAME = "GarSpec";

/** Base for the "View online" share links in every footer.
 *  Custom link/domain pending final confirmation. */
export const SHARE_BASE_URL = "https://app.garspec.com/view/";

/** Display form of the share host+path, without the scheme. */
const SHARE_BASE_DISPLAY = SHARE_BASE_URL.replace(/^https?:\/\//, "");

export function shareUrl(token: string): string {
  return `${SHARE_BASE_URL}${token}`;
}

/** The short clickable label shown in footers: host + truncated token. */
export function shareDisplay(token: string): string {
  return `${SHARE_BASE_DISPLAY}${token.slice(0, 8)}…`;
}

// ---- Document chrome palette --------------------------------------------------
// Shared by the canvas-page renderer (which established these values) and the
// cover/BOM pages, so the whole document reads as one design.

export const INK = "#1C1917";
export const MUTED = "#78716C";
export const HAIRLINE = "#D6D3D1";
export const BOX_BG = "#FAFAF9";
export const LINK_BLUE = "#2563EB";
