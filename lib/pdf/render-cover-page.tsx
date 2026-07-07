/**
 * The tech pack's COVER page — a restrained briefing/identity sheet, not a
 * poster. Landscape A4 in the established chrome (Helvetica, ink/muted,
 * hairline rules, shared footer): brand logo (or name), product identity,
 * the Product Setup description / intended-use paragraphs, and the product's
 * hero image (contain-fitted, never cropped). Always page 1 of the document.
 *
 * Graceful degradation, in order: no logo → brand name text; no hero → the
 * identity/description column simply takes the full width (no placeholder
 * box); every text field renders "—" or is omitted when empty.
 */

import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { HAIRLINE, INK, MUTED } from "@/lib/pdf/branding";
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

/** An image ready for the cover: data URI + its NATURAL pixel size. The size
 *  is required because the cover contain-fits with its own geometry —
 *  react-pdf's `objectFit` is ignored for SVG sources (verified), so the box
 *  is always computed here, the same discipline as the slot renderer. */
export type PdfCoverImage = {
  src: string;
  width: number;
  height: number;
};

/** width/height scaled to fit inside a box, never cropping or stretching. */
function containFit(
  image: PdfCoverImage,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const scale = Math.min(boxW / image.width, boxH / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

export type PdfCoverData = {
  brandName: string;
  /** Brand logo (fetched/memoised server-side, natural size resolved); null
   *  renders the brand name as text instead. */
  logo: PdfCoverImage | null;
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
  heroImage: PdfCoverImage | null;
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
      <Text style={{ flex: 1, fontSize: 8.5 }}>{value}</Text>
    </View>
  );
}

const BODY_TOP = MARGIN + HEADER_H + 18;
const BODY_BOTTOM = PAGE_H - MARGIN - FOOTER_H - 10;
const BODY_H = BODY_BOTTOM - BODY_TOP;
const LEFT_COL_W = 300;
const COL_GAP = 28;

export function CoverPage({ data }: { data: PdfCoverData }) {
  const styleLine = [
    data.styleNumber ?? "—",
    data.collectionName,
    data.seasonName,
  ]
    .filter((v): v is string => !!v)
    .join(" · ");

  const heroW = PAGE_W - MARGIN * 2 - LEFT_COL_W - COL_GAP;

  return (
    <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
      {/* Top band — logo left, document label right, hairline rule beneath
          (same band proportions as the inner pages' header). */}
      <View
        style={{
          position: "absolute",
          left: MARGIN,
          top: MARGIN,
          width: PAGE_W - MARGIN * 2,
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
          width: data.heroImage ? LEFT_COL_W : PAGE_W - MARGIN * 2,
          height: BODY_H,
        }}
      >
        <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold" }}>
          {data.productName}
        </Text>
        <Text style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>
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
                maxLines: 14,
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
                maxLines: 5,
                textOverflow: "ellipsis",
              }}
            >
              {data.endUse}
            </Text>
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
            height: BODY_H,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            src={data.heroImage.src}
            style={containFit(data.heroImage, heroW, BODY_H)}
          />
        </View>
      )}

      <Footer data={data.footer} />
    </Page>
  );
}
