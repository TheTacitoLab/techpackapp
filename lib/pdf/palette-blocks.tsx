/**
 * The colour-palette building blocks shared by the cover's palette band and
 * the dedicated Colour Palette overflow page: Pantone-style postcard swatches
 * (solid colour block on top, code + name on a white caption strip beneath)
 * grouped under their colourway variant's name.
 *
 * The swatch block is the pin's SAMPLED hex; the Pantone code and colour
 * name are shown exactly as the USER entered them — arbitrary colours are
 * never auto-mapped to official Pantone names (not licensed/derivable).
 * Cards with no hex still render (neutral block + captions); pins with no
 * data at all are dropped upstream, so a card is never empty.
 *
 * All heights are fixed constants so page composition can measure a palette
 * BEFORE rendering (the cover fits it or hands it to the overflow page).
 */

import { Text, View } from "@react-pdf/renderer";

import { BOX_BG, HAIRLINE, INK, MUTED } from "@/lib/pdf/branding";

export type PdfCoverSwatch = {
  /** The sampled colour. Null renders a neutral block (captions still show). */
  hex: string | null;
  /** The user's colour name, verbatim. */
  name: string | null;
  /** The user's Pantone reference, verbatim — never auto-derived. */
  pantone: string | null;
};

export type PdfCoverColourway = {
  name: string;
  swatches: PdfCoverSwatch[];
};

// ---- Fixed card/section metrics (points) --------------------------------------

export const SWATCH_CARD_W = 58;
const SWATCH_BLOCK_H = 40;
const SWATCH_CAPTION_H = 22;
export const SWATCH_CARD_H = SWATCH_BLOCK_H + SWATCH_CAPTION_H;
export const SWATCH_GAP = 8;
export const VARIANT_HEADING_H = 14;
export const VARIANT_GAP = 10;

/** Cards per row for a given row width. */
export function swatchesPerRow(width: number): number {
  return Math.max(1, Math.floor((width + SWATCH_GAP) / (SWATCH_CARD_W + SWATCH_GAP)));
}

/** One variant section's rendered height at a given width. */
export function variantSectionHeight(
  swatchCount: number,
  width: number,
): number {
  const rows = Math.ceil(swatchCount / swatchesPerRow(width));
  return VARIANT_HEADING_H + rows * SWATCH_CARD_H + (rows - 1) * SWATCH_GAP;
}

/** The whole palette's height (variant sections + gaps) at a given width. */
export function paletteHeight(
  colourways: PdfCoverColourway[],
  width: number,
): number {
  if (colourways.length === 0) return 0;
  return (
    colourways.reduce(
      (sum, c) => sum + variantSectionHeight(c.swatches.length, width),
      0,
    ) +
    (colourways.length - 1) * VARIANT_GAP
  );
}

// ---- Components -----------------------------------------------------------------

/** One Pantone-style postcard: colour block over a white caption strip. */
function SwatchCard({ swatch }: { swatch: PdfCoverSwatch }) {
  return (
    <View
      style={{
        width: SWATCH_CARD_W,
        height: SWATCH_CARD_H,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: SWATCH_BLOCK_H,
          backgroundColor: swatch.hex ?? BOX_BG,
          borderBottomWidth: 1,
          borderBottomColor: HAIRLINE,
        }}
      />
      <View style={{ paddingHorizontal: 4, paddingTop: 3 }}>
        {swatch.pantone && (
          <Text
            style={{
              fontSize: 5.5,
              fontFamily: "Helvetica-Bold",
              color: INK,
              maxLines: 1,
              textOverflow: "ellipsis",
            }}
          >
            {swatch.pantone}
          </Text>
        )}
        {swatch.name && (
          <Text
            style={{
              fontSize: 5,
              color: MUTED,
              marginTop: 1,
              maxLines: 1,
              textOverflow: "ellipsis",
            }}
          >
            {swatch.name}
          </Text>
        )}
        {/* Hex as the caption of last resort — a sampled-only swatch still
            reads as a real card, never a bare block. */}
        {!swatch.pantone && !swatch.name && swatch.hex && (
          <Text style={{ fontSize: 5.5, color: MUTED, maxLines: 1 }}>
            {swatch.hex.toUpperCase()}
          </Text>
        )}
      </View>
    </View>
  );
}

/** A colourway's heading + its swatch cards, wrapping into rows. */
export function VariantSection({
  colourway,
}: {
  colourway: PdfCoverColourway;
}) {
  return (
    <View>
      <View
        style={{
          height: VARIANT_HEADING_H,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {/* Single line, enforced — the section's measured height charges the
            heading exactly VARIANT_HEADING_H. */}
        <Text
          style={{
            fontSize: 6.5,
            fontFamily: "Helvetica-Bold",
            color: INK,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            maxLines: 1,
            textOverflow: "ellipsis",
          }}
        >
          {colourway.name}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SWATCH_GAP }}>
        {colourway.swatches.map((swatch, i) => (
          <SwatchCard key={i} swatch={swatch} />
        ))}
      </View>
    </View>
  );
}

/** The full palette: variant sections stacked with their shared gap. */
export function PaletteSections({
  colourways,
}: {
  colourways: PdfCoverColourway[];
}) {
  return (
    <View style={{ gap: VARIANT_GAP }}>
      {colourways.map((colourway, i) => (
        <VariantSection key={i} colourway={colourway} />
      ))}
    </View>
  );
}
