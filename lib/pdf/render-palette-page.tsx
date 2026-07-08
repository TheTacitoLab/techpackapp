/**
 * The dedicated Colour Palette page — the cover's overflow home. When a
 * product's palette is too large for the cover's bottom band
 * (`coverPaletteFits`), the whole palette moves here instead of cramming or
 * clipping the cover: the same variant headings + Pantone-style swatch cards
 * (palette-blocks.tsx), full page width, in the established chrome (shared
 * Header titled "Colour Palette", shared Footer, document-wide numbering).
 *
 * Defensive fit: variants render in sequence order until the page's vertical
 * budget is spent; anything past the cut is reported as an explicit "+N more
 * colourways" line rather than clipped (same discipline as the callout
 * column). With realistic products (a handful of colourways) everything fits.
 */

import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { INK, MUTED } from "@/lib/pdf/branding";
import {
  SWATCH_CARD_H,
  SWATCH_GAP,
  VARIANT_GAP,
  VARIANT_HEADING_H,
  VariantSection,
  swatchesPerRow,
  variantSectionHeight,
  type PdfCoverColourway,
} from "@/lib/pdf/palette-blocks";
import {
  FOOTER_H,
  HEADER_H,
  MARGIN,
  PAGE_H,
  PAGE_W,
} from "@/lib/pdf/page-geometry";
import {
  Footer,
  Header,
  type PdfFooterData,
  type PdfHeaderData,
} from "@/lib/pdf/render-techpack-page";

export type PdfPalettePageData = {
  header: PdfHeaderData;
  footer: PdfFooterData;
  colourways: PdfCoverColourway[];
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: INK,
    backgroundColor: "#FFFFFF",
  },
});

const ZONE_TOP = MARGIN + HEADER_H + 14;
const ZONE_BOTTOM = PAGE_H - MARGIN - FOOTER_H - 6;
const ZONE_W = PAGE_W - MARGIN * 2;
/** Room kept for the "+N more" notice so it can never itself be clipped
 *  (real height: 6pt margin + one 6.5pt line ≈ 13.2). */
const MORE_NOTICE_H = 14;

export function PalettePage({ data }: { data: PdfPalettePageData }) {
  // Greedy fit in sequence order — stop before the first variant that would
  // overrun the zone, and say how much was left out. A first variant that
  // is ALONE too tall for the page is sliced to the rows that fit (with the
  // notice reserved) instead of being force-pushed past the clip — nothing
  // is ever cut silently.
  const budget = ZONE_BOTTOM - ZONE_TOP;
  const shown: PdfCoverColourway[] = [];
  let used = 0;
  let hiddenSwatches = 0;
  for (const colourway of data.colourways) {
    const gap = shown.length > 0 ? VARIANT_GAP : 0;
    const h = gap + variantSectionHeight(colourway.swatches.length, ZONE_W);
    const isLast = shown.length + 1 === data.colourways.length;
    const reserve = isLast && hiddenSwatches === 0 ? 0 : MORE_NOTICE_H;
    if (used + h + reserve > budget) {
      if (shown.length > 0) break;
      // Oversized first variant: keep the whole rows that fit beside the
      // heading and the (now mandatory) notice, report the rest.
      const perRow = swatchesPerRow(ZONE_W);
      const rowBudget =
        budget - MORE_NOTICE_H - VARIANT_HEADING_H + SWATCH_GAP;
      const rows = Math.max(
        1,
        Math.floor(rowBudget / (SWATCH_CARD_H + SWATCH_GAP)),
      );
      const keep = Math.min(colourway.swatches.length, rows * perRow);
      hiddenSwatches = colourway.swatches.length - keep;
      shown.push({ ...colourway, swatches: colourway.swatches.slice(0, keep) });
      used += variantSectionHeight(keep, ZONE_W);
      continue;
    }
    shown.push(colourway);
    used += h;
  }
  const hidden = data.colourways.length - shown.length;

  return (
    <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
      <Header data={data.header} title="Colour Palette" />
      <View
        style={{
          position: "absolute",
          left: MARGIN,
          top: ZONE_TOP,
          width: ZONE_W,
          height: budget,
          overflow: "hidden",
        }}
      >
        <View style={{ gap: VARIANT_GAP }}>
          {shown.map((colourway, i) => (
            <VariantSection key={i} colourway={colourway} />
          ))}
        </View>
        {(hidden > 0 || hiddenSwatches > 0) && (
          <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 6 }}>
            {[
              hiddenSwatches > 0 ? `+${hiddenSwatches} more colours` : null,
              hidden > 0
                ? `+${hidden} more colourway${hidden === 1 ? "" : "s"}`
                : null,
            ]
              .filter((v): v is string => !!v)
              .join(" · ")},{" "}
            see the online tech pack for the full palette.
          </Text>
        )}
      </View>
      <Footer data={data.footer} />
    </Page>
  );
}
