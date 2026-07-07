/**
 * The tech pack's COVER page — a restrained briefing/identity sheet, not a
 * poster. Landscape A4 in the established chrome (Helvetica, ink/muted,
 * hairline rules, shared footer): brand logo (or name), product identity,
 * the Product Setup description / intended-use paragraphs, the product's
 * hero image (contain-fitted, never cropped), a key-fabrics summary strip,
 * and a colour palette grouped by colourway variant.
 *
 * EVERY block is conditional — a sparse product gets a clean minimal cover
 * (no empty headings, no placeholder boxes), a rich one gets the full
 * showcase. Composition never overflows: the palette band's height is
 * measured up front (palette-blocks.tsx) and the assembler only puts the
 * palette on the cover when it fits — otherwise it becomes the dedicated
 * Colour Palette page — and the description's line budget flexes around
 * whichever blocks are present.
 */

import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { HAIRLINE, INK, MUTED } from "@/lib/pdf/branding";
import { containFit, type PdfImage } from "@/lib/pdf/image-fit";
import {
  PaletteSections,
  paletteHeight,
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
  type PdfFooterData,
} from "@/lib/pdf/render-techpack-page";

/** One key material on the cover's fabrics strip, e.g.
 *  "Main shell — 4-Way Stretch Woven · 88% Poly / 12% Elastane". */
export type PdfCoverFabric = {
  /** The pin's placement ("Main shell") — the strip's row label when set. */
  label: string | null;
  name: string;
  /** Composition / GSM line, already joined; null shows the name alone. */
  detail: string | null;
};

export type PdfCoverData = {
  brandName: string;
  /** Brand logo (fetched/memoised server-side, natural size resolved); null
   *  renders the brand name as text instead. */
  logo: PdfImage | null;
  productName: string;
  styleNumber: string | null;
  collectionName: string | null;
  seasonName: string | null;
  statusLabel: string;
  designerName: string | null;
  versionLabel: string;
  dateLabel: string;
  /** Product Setup's description / intended-use paragraphs (identity section
   *  data) — the briefing text block. */
  description: string | null;
  endUse: string | null;
  /** The chosen hero asset (or the page-1 fallback); null gives the clean
   *  text-only cover. */
  heroImage: PdfImage | null;
  /** Key fabrics from the fabric pins (already capped/deduped); empty omits
   *  the strip entirely. */
  fabrics: PdfCoverFabric[];
  /** Colourway variants for the cover's palette band. The ASSEMBLER passes
   *  these only when the measured palette fits the cover — an oversized
   *  palette arrives empty here and renders as the dedicated palette page. */
  colourways: PdfCoverColourway[];
  footer: PdfFooterData;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: INK,
    backgroundColor: "#FFFFFF",
  },
});

/** Small uppercase field label, matching the slot/notes label style. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 6.5,
        fontFamily: "Helvetica-Bold",
        color: MUTED,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 3,
      }}
    >
      {children}
    </Text>
  );
}

/** One label/value row of the identity meta grid. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3.5 }}>
      <Text
        style={{
          width: 74,
          fontSize: 6.5,
          color: MUTED,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginTop: 0.5,
        }}
      >
        {label}
      </Text>
      {/* Single line, enforced — the column budget (leftColumnReserved)
          charges each meta row exactly one line. */}
      <Text
        style={{ flex: 1, fontSize: 8.5, maxLines: 1, textOverflow: "ellipsis" }}
      >
        {value}
      </Text>
    </View>
  );
}

// ---- Composition geometry ------------------------------------------------------

const BODY_TOP = MARGIN + HEADER_H + 18;
const BODY_BOTTOM = PAGE_H - MARGIN - FOOTER_H - 10;
const BODY_H = BODY_BOTTOM - BODY_TOP;
const LEFT_COL_W = 300;
const COL_GAP = 28;
/** Full usable width — the palette band and no-hero identity column span it. */
const FULL_W = PAGE_W - MARGIN * 2;

// Palette band chrome: top hairline + padding + the "Colour palette" label.
const PALETTE_BAND_CHROME = 26;
const PALETTE_BAND_GAP = 14;
/** Even on a light cover the palette band never takes more than this — a
 *  bigger palette belongs on its own page, not dominating the cover. */
const PALETTE_BAND_MAX_H = 240;

// Conservative per-block heights for the identity column's budget — each ≥
// the real rendered height, so the estimate can never under-reserve (same
// discipline as the callout-column budget).
const DESC_LINE_H = 8.5 * 1.5;
const H_NAME_BLOCK = 72; // product name (≤2 lines) + style line (1 line)
const H_META_ROW = 13; // one enforced line (8.5×1.1) + 3.5 margin
const H_META_CHROME = 25; // border, padding, margins around the meta grid
const H_TEXT_BLOCK_CHROME = 34; // a labelled block's border/label/margins
const ENDUSE_MAX_LINES = 3;
const H_ENDUSE_BLOCK = 23 + ENDUSE_MAX_LINES * DESC_LINE_H; // no top border
const H_FABRIC_ROW = 11;
const DESC_MIN_LINES = 3;

/** The cover-content inputs the palette fit decision needs — everything the
 *  identity column will render besides the description's flexible lines. */
export type PdfCoverContent = Pick<
  PdfCoverData,
  "collectionName" | "seasonName" | "description" | "endUse" | "fabrics"
>;

/** The identity column's height with every block at its budgeted size,
 *  EXCLUDING the description block (whose line count is the flex space). */
function leftColumnReserved(content: PdfCoverContent): number {
  const metaRows =
    3 + (content.collectionName ? 1 : 0) + (content.seasonName ? 1 : 0);
  let reserved = H_NAME_BLOCK + H_META_CHROME + metaRows * H_META_ROW;
  if (content.endUse) reserved += H_ENDUSE_BLOCK;
  if (content.fabrics.length > 0) {
    reserved += H_TEXT_BLOCK_CHROME + content.fabrics.length * H_FABRIC_ROW;
  }
  return reserved;
}

/** The palette band's full height (sections + label/rule chrome). */
function paletteBandHeight(colourways: PdfCoverColourway[]): number {
  if (colourways.length === 0) return 0;
  return paletteHeight(colourways, FULL_W) + PALETTE_BAND_CHROME;
}

/**
 * Whether the palette fits ON THE COVER alongside everything else — the
 * assembler's switch between the cover band and the dedicated Colour Palette
 * page. A GLOBAL budget, not just the band's own size: the identity column
 * must still fit its blocks with at least the minimum description lines
 * above the band, so the cover can never cram or clip. Light covers host
 * multi-variant palettes; a fully-loaded briefing cover promotes the palette
 * to its own page.
 */
export function coverPaletteFits(
  colourways: PdfCoverColourway[],
  content: PdfCoverContent,
): boolean {
  const bandH = paletteBandHeight(colourways);
  if (bandH > PALETTE_BAND_MAX_H) return false;
  const columnsH = BODY_H - bandH - PALETTE_BAND_GAP;
  const need =
    leftColumnReserved(content) +
    (content.description
      ? H_TEXT_BLOCK_CHROME + DESC_MIN_LINES * DESC_LINE_H
      : 0);
  return columnsH >= need;
}

export function CoverPage({ data }: { data: PdfCoverData }) {
  const styleLine = [
    data.styleNumber ?? "—",
    data.collectionName,
    data.seasonName,
  ]
    .filter((v): v is string => !!v)
    .join(" · ");

  // Palette band (bottom, full width) — only when the assembler passed
  // variants, which it does only when coverPaletteFits said they fit.
  const paletteBandH = paletteBandHeight(data.colourways);
  const columnsH =
    BODY_H - (paletteBandH > 0 ? paletteBandH + PALETTE_BAND_GAP : 0);

  const heroW = PAGE_W - MARGIN * 2 - LEFT_COL_W - COL_GAP;

  // The description's line budget: whatever the column has left once the
  // fixed blocks (name, meta grid, intended use, fabrics strip) are
  // reserved — the same reservation the palette fit decision used, so the
  // floor of DESC_MIN_LINES is guaranteed to fit whenever a band is present.
  const descMaxLines = Math.max(
    DESC_MIN_LINES,
    Math.floor(
      (columnsH - leftColumnReserved(data) - H_TEXT_BLOCK_CHROME) /
        DESC_LINE_H,
    ),
  );

  return (
    <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
      {/* Top band — logo left, document label right, hairline rule beneath
          (same band proportions as the inner pages' header). */}
      <View
        style={{
          position: "absolute",
          left: MARGIN,
          top: MARGIN,
          width: FULL_W,
          height: HEADER_H,
          borderBottomWidth: 1,
          borderBottomColor: HAIRLINE,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {data.logo ? (
          <Image src={data.logo.src} style={containFit(data.logo, 140, 40)} />
        ) : (
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>
            {data.brandName}
          </Text>
        )}
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Helvetica-Bold",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Tech Pack
          </Text>
          <Text style={{ fontSize: 7, color: MUTED, marginTop: 3 }}>
            {data.versionLabel} · {data.dateLabel}
          </Text>
        </View>
      </View>

      {/* Identity + briefing column (full width when there is no hero). */}
      <View
        style={{
          position: "absolute",
          left: MARGIN,
          top: BODY_TOP,
          width: data.heroImage ? LEFT_COL_W : FULL_W,
          height: columnsH,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontFamily: "Helvetica-Bold",
            maxLines: 2,
            textOverflow: "ellipsis",
          }}
        >
          {data.productName}
        </Text>
        <Text
          style={{
            fontSize: 9,
            color: MUTED,
            marginTop: 4,
            maxLines: 1,
            textOverflow: "ellipsis",
          }}
        >
          {styleLine}
        </Text>

        <View
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
          }}
        >
          <MetaRow label="Brand" value={data.brandName} />
          <MetaRow label="Status" value={data.statusLabel} />
          {data.collectionName && (
            <MetaRow label="Collection" value={data.collectionName} />
          )}
          {data.seasonName && <MetaRow label="Season" value={data.seasonName} />}
          <MetaRow label="Designer" value={data.designerName ?? "—"} />
        </View>

        {data.description && (
          <View
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: HAIRLINE,
            }}
          >
            <FieldLabel>Description</FieldLabel>
            <Text
              style={{
                fontSize: 8.5,
                lineHeight: 1.5,
                maxLines: descMaxLines,
                textOverflow: "ellipsis",
              }}
            >
              {data.description}
            </Text>
          </View>
        )}

        {data.endUse && (
          <View style={{ marginTop: 12 }}>
            <FieldLabel>Intended Use</FieldLabel>
            <Text
              style={{
                fontSize: 8.5,
                lineHeight: 1.5,
                maxLines: ENDUSE_MAX_LINES,
                textOverflow: "ellipsis",
              }}
            >
              {data.endUse}
            </Text>
          </View>
        )}

        {/* Key fabrics — a tidy labelled strip from the fabric pins; absent
            entirely when the product has none. */}
        {data.fabrics.length > 0 && (
          <View
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: HAIRLINE,
            }}
          >
            <FieldLabel>Key Fabrics</FieldLabel>
            {data.fabrics.map((fabric, i) => (
              <Text
                key={i}
                style={{
                  fontSize: 8,
                  lineHeight: 1.35,
                  maxLines: 1,
                  textOverflow: "ellipsis",
                }}
              >
                {fabric.label ? (
                  <>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>
                      {fabric.label}
                    </Text>
                    {" — "}
                  </>
                ) : null}
                {fabric.name}
                {fabric.detail ? (
                  <Text style={{ color: MUTED }}>{` · ${fabric.detail}`}</Text>
                ) : null}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Hero image — large, centred, contain-fitted (never cropped). Absent
          entirely (no placeholder box) on a text-only cover. */}
      {data.heroImage && (
        <View
          style={{
            position: "absolute",
            left: MARGIN + LEFT_COL_W + COL_GAP,
            top: BODY_TOP,
            width: heroW,
            height: columnsH,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            src={data.heroImage.src}
            style={containFit(data.heroImage, heroW, columnsH)}
          />
        </View>
      )}

      {/* Colour palette band — variants with Pantone-style swatch cards,
          pinned to the bottom of the body, full width. */}
      {paletteBandH > 0 && (
        <View
          style={{
            position: "absolute",
            left: MARGIN,
            top: BODY_BOTTOM - paletteBandH,
            width: FULL_W,
            height: paletteBandH,
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
            paddingTop: 10,
          }}
        >
          <FieldLabel>Colour Palette</FieldLabel>
          <PaletteSections colourways={data.colourways} />
        </View>
      )}

      <Footer data={data.footer} />
    </Page>
  );
}
