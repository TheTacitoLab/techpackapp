/**
 * Canvas-to-PDF spike: ONE annotated canvas page → ONE landscape-A4 PDF page
 * via @react-pdf/renderer, re-expressed in its primitives (never screenshots).
 *
 * Geometry contract (the whole point of the spike): each slot's image rect
 * comes from the IMPORTED `lib/cover-geometry.ts` functions applied in the
 * slot's frozen lock-space box, and pins are 0–1 fractions of that box — both
 * scaled by the single per-slot factor `k` (see `lib/pdf/page-geometry.ts`).
 * Pins and image share one scale; nothing inside a slot scales independently.
 *
 * Hardcoded for the spike (settings surface comes later): header field
 * selection, callout detail line (via the shared `getAnnotationSummary`),
 * footer confidentiality line, colours of the chrome, Helvetica.
 */

import {
  Document,
  Image,
  Line,
  Link,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { getAnnotationSummary } from "@/components/canvas/annotation-summary";
import { readableTextOn, type LayerKey } from "@/components/canvas/layers";
import {
  formatMeasurementValue,
  readMeasurementData,
} from "@/components/canvas/measurement-data";
import {
  PAGE_H,
  PAGE_W,
  MARGIN,
  HEADER_H,
  FOOTER_H,
  calloutZone,
  pinPoint,
  slotGeometry,
  slotsZone,
  templateCells,
  type PdfRect,
  type SlotFramingInput,
} from "@/lib/pdf/page-geometry";
import type { CanvasAnnotation, CanvasTemplate } from "@/types";

export type PdfSlotData = {
  framing: SlotFramingInput;
  isLocked: boolean;
  naturalWidth: number | null;
  naturalHeight: number | null;
  assetName: string | null;
  /** Slot image as a data URI (fetched server-side; PNG and SVG both verified
   * in Step 0); null renders an "image unavailable" box. */
  image: string | null;
  /** Already filtered to the exported layer's `types`. */
  annotations: CanvasAnnotation[];
};

export type PdfPageData = {
  styleName: string;
  styleNumber: string;
  seasonName: string;
  brandName: string;
  designerName: string;
  versionLabel: string;
  dateLabel: string;
  pageNumber: number;
  pageCount: number;
  pageLabel: string;
  template: CanvasTemplate;
  layerKey: LayerKey;
  layerLabel: string;
  /** Resolved via the workspace's layer_colours overrides (imported resolver). */
  layerColour: string;
  shareToken: string;
  slots: PdfSlotData[];
};

// ---- Chrome palette (hardcoded spike defaults) --------------------------------
const INK = "#1C1917";
const MUTED = "#78716C";
const HAIRLINE = "#D6D3D1";
const BOX_BG = "#FAFAF9";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: INK,
    backgroundColor: "#FFFFFF",
  },
});

// On-screen pin anatomy re-expressed in points: 6px tip dot / 20px badge /
// 1.5px leader on screen → kept at fixed pt sizes so they read well in print.
const TIP_R = 2.5;
const BADGE_R = 7;
const DEFAULT_OFFSET_X = 0;
const DEFAULT_OFFSET_Y = -0.04;

// Measurement arrows: same proportions as the screen renderer.
const ARROW_LEN = 7;
const ARROW_HALF_W = 2.5;
const PILL_OFFSET = 12;

function arrowheadPath(
  tipX: number,
  tipY: number,
  towardX: number,
  towardY: number,
): string | null {
  const dx = towardX - tipX;
  const dy = towardY - tipY;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const bx = tipX + ux * ARROW_LEN;
  const by = tipY + uy * ARROW_LEN;
  const px = -uy * ARROW_HALF_W;
  const py = ux * ARROW_HALF_W;
  return `M ${tipX} ${tipY} L ${bx + px} ${by + py} L ${bx - px} ${by - py} Z`;
}

function PdfPin({
  annotation,
  box,
  colour,
}: {
  annotation: CanvasAnnotation;
  box: PdfRect;
  colour: string;
}) {
  const { x, y } = pinPoint(box, annotation.x, annotation.y);
  const offX = (annotation.label_offset_x ?? DEFAULT_OFFSET_X) * box.width;
  const offY = (annotation.label_offset_y ?? DEFAULT_OFFSET_Y) * box.height;
  const badgeX = x + offX;
  const badgeY = y + offY;
  const textColour = readableTextOn(colour);

  return (
    <>
      {/* Leader line tip → badge (under the badge, like on screen). */}
      <Svg
        style={{ position: "absolute", left: 0, top: 0 }}
        width={box.width}
        height={box.height}
        viewBox={`0 0 ${box.width} ${box.height}`}
      >
        <Line x1={x} y1={y} x2={badgeX} y2={badgeY} stroke={colour} strokeWidth={1} />
      </Svg>
      {/* Tip dot with white ring. */}
      <View
        style={{
          position: "absolute",
          left: x - TIP_R,
          top: y - TIP_R,
          width: TIP_R * 2,
          height: TIP_R * 2,
          borderRadius: TIP_R,
          backgroundColor: colour,
          borderWidth: 0.8,
          borderColor: "#FFFFFF",
        }}
      />
      {/* Code badge at its (possibly dragged) offset. */}
      <View
        style={{
          position: "absolute",
          left: badgeX - BADGE_R,
          top: badgeY - BADGE_R,
          width: BADGE_R * 2,
          height: BADGE_R * 2,
          borderRadius: BADGE_R,
          backgroundColor: colour,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 5.5,
            fontFamily: "Helvetica-Bold",
            color: textColour,
          }}
        >
          {annotation.reference_code}
        </Text>
      </View>
    </>
  );
}

function PdfMeasurementLine({
  annotation,
  box,
  colour,
}: {
  annotation: CanvasAnnotation;
  box: PdfRect;
  colour: string;
}) {
  const start = pinPoint(box, annotation.x, annotation.y);
  const end = pinPoint(
    box,
    annotation.end_x ?? annotation.x,
    annotation.end_y ?? annotation.y,
  );
  const headA = arrowheadPath(start.x, start.y, end.x, end.y);
  const headB = arrowheadPath(end.x, end.y, start.x, start.y);

  // Value pill at the midpoint, offset along the upward-pointing normal —
  // mirrors the screen renderer's placement rule.
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  let nx = 0;
  let ny = -1;
  if (len >= 1) {
    nx = -dy / len;
    ny = dx / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  const pillX = mx + nx * PILL_OFFSET;
  const pillY = my + ny * PILL_OFFSET;

  const d = readMeasurementData(annotation.data);
  const value = formatMeasurementValue(d.value, d.unit);
  const label = value
    ? `${annotation.reference_code}  ${value}`
    : annotation.reference_code;
  const textColour = readableTextOn(colour);
  const pillW = Math.max(24, label.length * 3.4 + 8);

  return (
    <>
      <Svg
        style={{ position: "absolute", left: 0, top: 0 }}
        width={box.width}
        height={box.height}
        viewBox={`0 0 ${box.width} ${box.height}`}
      >
        <Line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={colour}
          strokeWidth={1}
        />
        {headA && <Path d={headA} fill={colour} />}
        {headB && <Path d={headB} fill={colour} />}
      </Svg>
      <View
        style={{
          position: "absolute",
          left: pillX - pillW / 2,
          top: pillY - 5,
          width: pillW,
          height: 10,
          borderRadius: 5,
          backgroundColor: colour,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{ fontSize: 5.5, fontFamily: "Helvetica-Bold", color: textColour }}
        >
          {label}
        </Text>
      </View>
    </>
  );
}

function PdfSlot({
  slot,
  cell,
  colour,
  index,
}: {
  slot: PdfSlotData;
  cell: PdfRect;
  colour: string;
  index: number;
}) {
  // Inset the drawable area so the clipped image can never paint over the
  // cell's border — Step 0 found react-pdf clips at the BORDER box and draws
  // children above the border stroke.
  const INSET = 3;
  const inner: PdfRect = {
    left: cell.left + INSET,
    top: cell.top + INSET,
    width: cell.width - INSET * 2,
    height: cell.height - INSET * 2,
  };
  const geo = slotGeometry(
    inner,
    slot.framing,
    slot.naturalWidth,
    slot.naturalHeight,
  );
  const { box } = geo;

  return (
    <>
      {/* Bordered container box = the cell. */}
      <View
        style={{
          position: "absolute",
          left: cell.left,
          top: cell.top,
          width: cell.width,
          height: cell.height,
          borderWidth: 1,
          borderColor: HAIRLINE,
          borderRadius: 4,
          backgroundColor: BOX_BG,
        }}
      />
      {/* The frozen slot box, clipped — image + pins live in here, sharing k. */}
      <View
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          overflow: "hidden",
        }}
      >
        {slot.image && geo.imageRect ? (
          <Image
            src={slot.image}
            style={{
              position: "absolute",
              left: geo.imageRect.left,
              top: geo.imageRect.top,
              width: geo.imageRect.width,
              height: geo.imageRect.height,
              objectFit: "fill",
            }}
          />
        ) : (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: box.width,
              height: box.height,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 8, color: MUTED }}>
              {slot.image ? "Image dimensions unavailable" : "Image unavailable"}
            </Text>
          </View>
        )}

        {slot.annotations.map((a) =>
          a.pin_type === "line" ? (
            <PdfMeasurementLine key={a.id} annotation={a} box={box} colour={colour} />
          ) : (
            <PdfPin key={a.id} annotation={a} box={box} colour={colour} />
          ),
        )}
      </View>
      {/* Slot label, top-left corner of the container box. */}
      <Text
        style={{
          position: "absolute",
          left: cell.left + 5,
          top: cell.top + 4,
          fontSize: 6,
          color: MUTED,
        }}
      >
        {slot.assetName ?? `Slot ${index + 1}`}
      </Text>
    </>
  );
}

/** Numeric-aware reference-code sort (F2 before F10), same as the list panel. */
function byReferenceCode(a: CanvasAnnotation, b: CanvasAnnotation): number {
  return a.reference_code.localeCompare(b.reference_code, undefined, {
    numeric: true,
  });
}

function CalloutColumn({
  zone,
  annotations,
  colour,
  layerLabel,
}: {
  zone: PdfRect;
  annotations: CanvasAnnotation[];
  colour: string;
  layerLabel: string;
}) {
  const textColour = readableTextOn(colour);
  return (
    <View
      style={{
        position: "absolute",
        left: zone.left,
        top: zone.top,
        width: zone.width,
        height: zone.height,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 4,
        padding: 8,
      }}
    >
      <Text
        style={{
          fontSize: 7,
          fontFamily: "Helvetica-Bold",
          color: MUTED,
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {layerLabel} — {annotations.length}{" "}
        {annotations.length === 1 ? "callout" : "callouts"}
      </Text>
      {annotations.length === 0 && (
        <Text style={{ fontSize: 7, color: MUTED }}>
          No annotations on this layer.
        </Text>
      )}
      {annotations.map((a) => {
        const summary = getAnnotationSummary(a);
        return (
          <View
            key={a.id}
            style={{
              flexDirection: "row",
              marginBottom: 5,
              alignItems: "flex-start",
            }}
          >
            <View
              style={{
                width: 14,
                height: 10,
                borderRadius: 5,
                backgroundColor: colour,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 4,
                marginTop: 0.5,
              }}
            >
              <Text
                style={{
                  fontSize: 5,
                  fontFamily: "Helvetica-Bold",
                  color: textColour,
                }}
              >
                {a.reference_code}
              </Text>
            </View>
            {/* Colourway rows get their sampled swatch; stitch SVG icons are a
                flagged follow-up (react-pdf Image doesn't take SVG sources). */}
            {summary.swatch && (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: summary.swatch,
                  borderWidth: 0.5,
                  borderColor: HAIRLINE,
                  marginRight: 3,
                  marginTop: 1,
                }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold" }}>
                {summary.title}
              </Text>
              {summary.detail && (
                <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 1 }}>
                  {summary.detail}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Header({ data }: { data: PdfPageData }) {
  const chipText = readableTextOn(data.layerColour);
  return (
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
      }}
    >
      {/* Brand logo placeholder box. */}
      <View
        style={{
          width: 64,
          height: 36,
          borderWidth: 1,
          borderColor: HAIRLINE,
          borderRadius: 4,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <Text style={{ fontSize: 6, color: MUTED }}>{data.brandName}</Text>
      </View>

      <View style={{ width: 200 }}>
        <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>
          {data.styleName}
        </Text>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
          {data.styleNumber} · {data.seasonName}
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>
          Technical Details
        </Text>
        <View
          style={{
            marginTop: 3,
            borderRadius: 6,
            backgroundColor: data.layerColour,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", color: chipText }}
          >
            {data.layerLabel}
          </Text>
        </View>
      </View>

      <View style={{ width: 130, alignItems: "flex-end" }}>
        <Text style={{ fontSize: 7 }}>
          {data.versionLabel} · {data.dateLabel}
        </Text>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
          Page {data.pageNumber} of {data.pageCount} · {data.pageLabel}
        </Text>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
          Designer: {data.designerName}
        </Text>
      </View>
    </View>
  );
}

function Footer({ data }: { data: PdfPageData }) {
  const shareUrl = `https://techpackapp.com/view/${data.shareToken}`;
  return (
    <View
      style={{
        position: "absolute",
        left: MARGIN,
        top: PAGE_H - MARGIN - FOOTER_H + 8,
        width: PAGE_W - MARGIN * 2,
        borderTopWidth: 1,
        borderTopColor: HAIRLINE,
        paddingTop: 5,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 6.5, color: MUTED }}>
        Confidential — property of {data.brandName}. For production purposes only.
      </Text>
      <View style={{ flexDirection: "row" }}>
        <Link src={shareUrl} style={{ fontSize: 6.5, color: "#2563EB" }}>
          View online: techpackapp.com/view/{data.shareToken.slice(0, 8)}…
        </Link>
        <Text style={{ fontSize: 6.5, color: MUTED, marginLeft: 8 }}>
          TechPackApp · {data.styleNumber} · Page {data.pageNumber} of {data.pageCount}
        </Text>
      </View>
    </View>
  );
}

export function TechPackPage({ data }: { data: PdfPageData }) {
  const zone = slotsZone();
  const cells = templateCells(data.template, zone);
  const allAnnotations = data.slots
    .flatMap((s) => s.annotations)
    .sort(byReferenceCode);

  return (
    <Document
      title={`${data.styleName} — Technical Details (${data.layerLabel})`}
      author="TechPackApp"
    >
      <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
        <Header data={data} />
        {data.slots.map((slot, i) =>
          cells[i] ? (
            <PdfSlot
              key={i}
              slot={slot}
              cell={cells[i]}
              colour={data.layerColour}
              index={i}
            />
          ) : null,
        )}
        <CalloutColumn
          zone={calloutZone()}
          annotations={allAnnotations}
          colour={data.layerColour}
          layerLabel={data.layerLabel}
        />
        <Footer data={data} />
      </Page>
    </Document>
  );
}

/** Render the page to a PDF Buffer (server-side). */
export async function renderTechPackPagePdf(data: PdfPageData): Promise<Buffer> {
  return renderToBuffer(<TechPackPage data={data} />);
}
