/**
 * Canvas-to-PDF spike: ONE annotated canvas page → ONE landscape-A4 PDF page
 * via @react-pdf/renderer, re-expressed in its primitives (never screenshots).
 *
 * Geometry contract (the whole point of the spike): each slot's image rect
 * comes from the IMPORTED `lib/cover-geometry.ts` functions applied in the
 * slot's frozen lock-space box, and pins are 0–1 fractions of that box — both
 * scaled by the single per-slot factor `k` (see `lib/pdf/page-geometry.ts`).
 * Pins and image share one scale; nothing inside a slot scales independently.
 * The bordered box on the page IS that frozen box (the slot's on-screen
 * aspect), so the image fills it edge-to-edge — spare canvas-zone space falls
 * between boxes and into the always-present PAGE NOTES band at the bottom.
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
import {
  BOX_BG,
  HAIRLINE,
  INK,
  LINK_BLUE,
  MUTED,
  PDF_BRAND_NAME,
  shareDisplay,
  shareUrl,
} from "@/lib/pdf/branding";
import { containFit, type PdfImage } from "@/lib/pdf/image-fit";
import {
  ANNOTATION_LAYERS,
  readableTextOn,
  resolveColourForLayerType,
  resolveLayerColour,
  type LayerColourOverrides,
  type LayerKey,
} from "@/components/canvas/layers";
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
  canvasZoneLayout,
  pinPoint,
  type PdfRect,
  type PdfSlotGeometry,
  type SlotFramingInput,
} from "@/lib/pdf/page-geometry";
import type { CanvasAnnotation, CanvasTemplate } from "@/types";

export type PdfSlotData = {
  framing: SlotFramingInput;
  naturalWidth: number | null;
  naturalHeight: number | null;
  assetName: string | null;
  /** The user's editable slot name ("Front", "Back neck") — the PDF box label
   * and the callout column's per-slot sub-header. Null falls back to the asset
   * name, then "Slot N". */
  name: string | null;
  /** Whether the slot has an asset at all — a never-filled slot renders as a
   * clean empty box; only a slot WITH an asset whose image could not be
   * fetched/rendered shows the "Image unavailable" failure text. */
  hasAsset: boolean;
  /** Slot image as a data URI (fetched server-side; PNG and SVG both verified
   * in Step 0); null with `hasAsset` renders an "image unavailable" box. */
  image: string | null;
  /** ALL of this slot's pins (every layer) — a canvas page exports as one
   *  composed page, so no per-layer filtering happens on the way in. */
  annotations: CanvasAnnotation[];
};

export type PdfPageData = {
  styleName: string;
  styleNumber: string;
  seasonName: string;
  brandName: string;
  /** Brand logo for the header band (fetched/memoised, natural size
   *  resolved); null falls back to the brand-name box — the same graceful
   *  fallback on every page. */
  logo: PdfImage | null;
  designerName: string;
  versionLabel: string;
  dateLabel: string;
  pageNumber: number;
  pageCount: number;
  pageLabel: string;
  template: CanvasTemplate;
  /** Workspace marker-colour overrides. Every pin (on the imagery) and every
   *  callout layer-heading resolves its own colour through these — the SAME
   *  resolution the on-screen "All layers" view uses. */
  layerColours: LayerColourOverrides;
  shareToken: string;
  /** Per-canvas-page notes. Null still renders the labelled box. */
  notes: string | null;
  slots: PdfSlotData[];
};

// Chrome palette lives in lib/pdf/branding.ts — shared with the cover and BOM
// pages so the whole document reads as one design.

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

/** The label shown on a slot's box and as its callout sub-header: the user's
 *  name, else the asset name, else "Slot N". Null only for a never-filled,
 *  unnamed slot (a clean empty cell with no label). */
function slotLabel(slot: PdfSlotData, index: number): string | null {
  if (slot.name) return slot.name;
  if (slot.hasAsset) return slot.assetName ?? `Slot ${index + 1}`;
  return null;
}

function PdfSlot({
  slot,
  cell,
  geo,
  colourFor,
  index,
}: {
  slot: PdfSlotData;
  cell: PdfRect;
  geo: PdfSlotGeometry;
  /** The colour for a given annotation — one page colour for a single-layer
   *  export, or each pin's own layer colour in the all-layers composite. */
  colourFor: (annotation: CanvasAnnotation) => string;
  index: number;
}) {
  const { box } = geo;
  const label = slotLabel(slot, index);

  // The bordered box is the fixed grid CELL; the frozen slot box is contain-
  // fitted and centred inside it (inset from the border by CELL_INSET), so the
  // clipped image never touches the stroke and spare space from aspect
  // differences sits as clean padding inside the cell.
  return (
    <>
      {/* Bordered grid cell. */}
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
        {/* A never-filled slot stays a clean empty box — the failure text is
            reserved for a slot whose asset image could not be rendered. */}
        {slot.hasAsset &&
          (slot.image && geo.imageRect ? (
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
          ))}

        {slot.annotations.map((a) =>
          a.pin_type === "line" ? (
            <PdfMeasurementLine
              key={a.id}
              annotation={a}
              box={box}
              colour={colourFor(a)}
            />
          ) : (
            <PdfPin key={a.id} annotation={a} box={box} colour={colourFor(a)} />
          ),
        )}
      </View>
      {/* Slot label, top-left corner of the cell. */}
      {label && (
        <Text
          style={{
            position: "absolute",
            left: cell.left + 5,
            top: cell.top + 4,
            fontSize: 6,
            color: MUTED,
          }}
        >
          {label}
        </Text>
      )}
    </>
  );
}

// Notes band anatomy: a clean bordered box with the label and the typed notes
// — no ruled guide lines. Comfortable line spacing; the text truncates with an
// ellipsis rather than overflowing the box.
const NOTES_PAD_X = 8;
const NOTES_LABEL_H = 14;
const NOTES_PAD_BOTTOM = 4;
const NOTES_TEXT_SIZE = 7;
const NOTES_LINE_HEIGHT = 1.35;

/**
 * The per-canvas-page notes box, spanning the CANVAS ZONE's width only (the
 * callout column keeps its full-height run). A clean bordered box: the "PAGE
 * NOTES" label plus the typed notes (when present), truncated with an ellipsis.
 * With no notes it is simply the labelled empty box.
 */
function NotesBox({ box, notes }: { box: PdfRect; notes: string | null }) {
  const text = notes?.trim() ?? "";
  const textTop = box.top + NOTES_LABEL_H;
  // How many lines of typed text fit between the label and the bottom padding.
  const maxLines = Math.max(
    1,
    Math.floor(
      (box.top + box.height - NOTES_PAD_BOTTOM - textTop) /
        (NOTES_TEXT_SIZE * NOTES_LINE_HEIGHT),
    ),
  );

  return (
    <>
      {/* White-backed bordered box — clean, no ruled lines. */}
      <View
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          borderWidth: 1,
          borderColor: HAIRLINE,
          borderRadius: 4,
        }}
      />
      {/* Label styled like the slot labels; "PAGE notes" deliberately — whole-
          page context, distinct from the pins' annotation notes. */}
      <Text
        style={{
          position: "absolute",
          left: box.left + 5,
          top: box.top + 4,
          fontSize: 6,
          color: MUTED,
        }}
      >
        PAGE NOTES
      </Text>
      {text.length > 0 && (
        <Text
          style={{
            position: "absolute",
            left: box.left + NOTES_PAD_X,
            top: textTop,
            width: box.width - NOTES_PAD_X * 2,
            fontSize: NOTES_TEXT_SIZE,
            lineHeight: NOTES_LINE_HEIGHT,
            color: INK,
            maxLines,
            textOverflow: "ellipsis",
          }}
        >
          {text}
        </Text>
      )}
    </>
  );
}

/** Numeric-aware reference-code sort (F2 before F10), same as the list panel. */
function byReferenceCode(a: CanvasAnnotation, b: CanvasAnnotation): number {
  return a.reference_code.localeCompare(b.reference_code, undefined, {
    numeric: true,
  });
}

// ---- Callout column: layer → slot → pins ------------------------------------
//
// A canvas page exports as ONE composed page, so the column groups by LAYER
// first (canonical layer-bar order, colour-keyed heading), then by SLOT within
// each layer (named sub-headers), pins beneath in reference-code order. Empty
// layers/slots are absent.
//
// The column has a fixed height and `overflow: "hidden"`, so nothing can ever
// paint past its border. A points budget fills it in canonical order and stops
// at the first row that would exceed the budget, reporting the rest as an
// explicit "+N more" line rather than a clipped half-row. Heights are
// estimated a touch conservatively; `maxLines: 1` on titles/details keeps every
// row exactly one or two lines so the estimate holds.

/** The column's interior height once its padding is removed. */
const CALLOUT_PAD = 8;
const CALLOUT_INNER_H = calloutZone().height - CALLOUT_PAD * 2;
/** Room kept for the "+N more" line so a truncation notice is never clipped. */
const CALLOUT_MORE_H = 9;
/** The budget when a "+N more" line WILL be shown — it reserves that line's
 *  room. The first fit uses the full interior (no reserve); with the 12-pin
 *  page cap that fits every case, so the notice + reserve only ever kick in as
 *  a defensive fallback for data beyond the cap. */
const CALLOUT_BUDGET = CALLOUT_INNER_H - CALLOUT_MORE_H;

// Estimated rendered heights (points), each kept CONSERVATIVE — i.e. ≥ the
// element's real rendered height — so the budget can never think content fits
// when it doesn't and let overflow:hidden clip a row (or the "+N more" notice)
// silently. Includes every margin: the heading's inter-group gap, the slot
// group's own marginBottom, the row's fixed-height badge and marginBottom.
const H_LAYER_HEADING = 15.5;
const H_SLOT_SUBHEADER = 10.5;
const H_ROW_BASE = 12;
const H_ROW_DETAIL = 6.5;

function rowHeight(annotation: CanvasAnnotation): number {
  return H_ROW_BASE + (getAnnotationSummary(annotation).detail ? H_ROW_DETAIL : 0);
}

/** A slot's pins within a layer, and a layer's slots — the grouped callout tree. */
type CalloutSlotGroup = { header: string; annotations: CanvasAnnotation[] };
type CalloutLayerGroup = {
  key: LayerKey;
  label: string;
  colour: string;
  slots: CalloutSlotGroup[];
  total: number;
};

type RenderedSlot = { header: string; rows: CanvasAnnotation[] };
type RenderedLayer = {
  key: LayerKey;
  label: string;
  colour: string;
  slots: RenderedSlot[];
};

/**
 * Greedily fit the layer→slot→pin tree into the column's vertical budget,
 * walking in canonical order and stopping at the FIRST row that would exceed it
 * — so the rendered prefix is contiguous (no gaps) and everything past the cut
 * is reported as "+N more". A layer heading / slot sub-header is only charged
 * when its first fitting row is placed, so an entirely-dropped layer or slot
 * costs nothing.
 */
function budgetCallouts(
  layers: CalloutLayerGroup[],
  total: number,
  budget: number,
): { rendered: RenderedLayer[]; shown: number; hidden: number } {
  const rendered: RenderedLayer[] = [];
  let used = 0;
  let shown = 0;
  let stop = false;

  for (const layer of layers) {
    if (stop) break;
    const slots: RenderedSlot[] = [];
    let layerCharged = false;
    for (const slot of layer.slots) {
      if (stop) break;
      const rows: CanvasAnnotation[] = [];
      let slotCharged = false;
      for (const annotation of slot.annotations) {
        const startCost =
          (layerCharged ? 0 : H_LAYER_HEADING) +
          (slotCharged ? 0 : H_SLOT_SUBHEADER);
        if (used + startCost + rowHeight(annotation) > budget) {
          stop = true;
          break;
        }
        used += startCost + rowHeight(annotation);
        layerCharged = true;
        slotCharged = true;
        rows.push(annotation);
        shown += 1;
      }
      if (rows.length > 0) slots.push({ header: slot.header, rows });
    }
    if (slots.length > 0) {
      rendered.push({
        key: layer.key,
        label: layer.label,
        colour: layer.colour,
        slots,
      });
    }
  }

  return { rendered, shown, hidden: total - shown };
}

/** A colour-keyed layer heading: the marker-colour chip + the layer name. */
function CalloutLayerHeading({
  label,
  colour,
}: {
  label: string;
  colour: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 4,
        marginBottom: 2,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          backgroundColor: colour,
          marginRight: 4,
        }}
      />
      <Text
        style={{
          fontSize: 7,
          fontFamily: "Helvetica-Bold",
          color: INK,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** One annotation row: reference-code badge, optional swatch, title + detail.
 *  `maxLines: 1` keeps each row's height predictable for the column budget. */
function CalloutRow({
  annotation,
  colour,
  textColour,
}: {
  annotation: CanvasAnnotation;
  colour: string;
  textColour: string;
}) {
  const summary = getAnnotationSummary(annotation);
  return (
    <View
      style={{ flexDirection: "row", marginBottom: 2, alignItems: "flex-start" }}
    >
      <View
        style={{
          width: 14,
          height: 9,
          borderRadius: 4.5,
          backgroundColor: colour,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 4,
          marginTop: 0.5,
        }}
      >
        <Text
          style={{ fontSize: 5, fontFamily: "Helvetica-Bold", color: textColour }}
        >
          {annotation.reference_code}
        </Text>
      </View>
      {/* Colourway rows get their sampled swatch; stitch/branding SVG icons are
          a flagged follow-up (react-pdf Image doesn't take SVG sources). */}
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
        <Text
          style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", maxLines: 1, textOverflow: "ellipsis" }}
        >
          {summary.title}
        </Text>
        {summary.detail && (
          <Text
            style={{ fontSize: 6, color: MUTED, marginTop: 0.5, maxLines: 1, textOverflow: "ellipsis" }}
          >
            {summary.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

function CalloutColumn({
  zone,
  layers,
  total,
}: {
  zone: PdfRect;
  layers: CalloutLayerGroup[];
  total: number;
}) {
  // Fit against the FULL interior first (no reserve) — under the 12-per-page
  // cap every case fits, so all pins show and no interior is wasted. Only if
  // that overflows (defensive: data beyond the cap) do we re-fit against the
  // reserved budget, leaving room for the "+N more" notice so it can't itself
  // be clipped.
  let result = budgetCallouts(layers, total, CALLOUT_INNER_H);
  if (result.hidden > 0) {
    result = budgetCallouts(layers, total, CALLOUT_BUDGET);
  }
  const { rendered, hidden } = result;

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
        padding: CALLOUT_PAD,
        overflow: "hidden",
      }}
    >
      {total === 0 && (
        <Text style={{ fontSize: 7, color: MUTED }}>
          No annotations on this page.
        </Text>
      )}
      {rendered.map((layer) => {
        const textColour = readableTextOn(layer.colour);
        return (
          <View key={layer.key}>
            {/* Colour-keyed layer heading. */}
            <CalloutLayerHeading label={layer.label} colour={layer.colour} />
            {layer.slots.map((slot, si) => (
              <View key={si} style={{ marginBottom: 1.5, paddingLeft: 2 }}>
                {/* Slot sub-header — groups this layer's pins on the slot
                    ("Front", "Back neck"). */}
                <Text
                  style={{
                    fontSize: 5.5,
                    fontFamily: "Helvetica-Bold",
                    color: MUTED,
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    marginBottom: 1.5,
                  }}
                >
                  {slot.header}
                </Text>
                <View style={{ paddingLeft: 4 }}>
                  {slot.rows.map((a) => (
                    <CalloutRow
                      key={a.id}
                      annotation={a}
                      colour={layer.colour}
                      textColour={textColour}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        );
      })}
      {hidden > 0 && (
        <Text style={{ fontSize: 6.5, color: MUTED, marginTop: 2 }}>
          +{hidden} more, see the online tech pack for the full list.
        </Text>
      )}
    </View>
  );
}

/** The header fields the chrome actually reads — a structural subset of
 *  PdfPageData, so the cover/BOM pages can reuse the exact same header band
 *  without carrying slot data. */
export type PdfHeaderData = Pick<
  PdfPageData,
  | "brandName"
  | "logo"
  | "styleName"
  | "styleNumber"
  | "seasonName"
  | "versionLabel"
  | "dateLabel"
  | "pageNumber"
  | "pageCount"
  | "pageLabel"
  | "designerName"
>;

export function Header({
  data,
  title = "Technical Details",
}: {
  data: PdfHeaderData;
  /** The centre band title — "Technical Details" on canvas pages (the
   *  established default), "Bill of Materials" on the BOM page. */
  title?: string;
}) {
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
      {/* Brand logo — the same left slot on every page (cover, canvas, BOM).
          Sized by our own containFit (react-pdf objectFit is unreliable for
          SVG); no logo falls back to the original brand-name box. */}
      {data.logo ? (
        <View
          style={{
            width: 76,
            height: 36,
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Image src={data.logo.src} style={containFit(data.logo, 76, 36)} />
        </View>
      ) : (
        <View
          style={{
            width: 76,
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
      )}

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
          {title}
        </Text>
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

/** The footer fields the chrome actually reads — shared with cover/BOM pages. */
export type PdfFooterData = Pick<
  PdfPageData,
  "brandName" | "styleNumber" | "shareToken" | "pageNumber" | "pageCount"
>;

export function Footer({ data }: { data: PdfFooterData }) {
  const shareHref = shareUrl(data.shareToken);
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
        Confidential, property of {data.brandName}. For production purposes only.
      </Text>
      <View style={{ flexDirection: "row" }}>
        <Link src={shareHref} style={{ fontSize: 6.5, color: LINK_BLUE }}>
          View online: {shareDisplay(data.shareToken)}
        </Link>
        <Text style={{ fontSize: 6.5, color: MUTED, marginLeft: 8 }}>
          {PDF_BRAND_NAME} · {data.styleNumber} · Page {data.pageNumber} of {data.pageCount}
        </Text>
      </View>
    </View>
  );
}

/**
 * ONE canvas page as a react-pdf <Page> — the unit the full-document route
 * composes (cover + N of these + BOM). Layout/geometry unchanged from the
 * proven single-page export; document assembly only threads pageNumber /
 * pageCount through the existing header/footer props.
 */
export function TechPackCanvasPage({ data }: { data: PdfPageData }) {
  const layout = canvasZoneLayout(data.template, data.slots);
  const overrides = data.layerColours;

  // Composed export: every pin resolves its OWN layer colour — the same
  // resolver the on-screen "All layers" view uses.
  const colourFor = (annotation: CanvasAnnotation): string =>
    resolveColourForLayerType(annotation.layer_type, overrides);

  // Callout tree: layer (canonical layer-bar order) → slot (slot order) → pins
  // (reference-code order). Layers/slots with no pins are omitted. Each layer's
  // heading + pin rows use the layer's resolved marker colour, matching the
  // pins on the imagery.
  const layerGroups: CalloutLayerGroup[] = ANNOTATION_LAYERS.map((layer) => {
    const slots: CalloutSlotGroup[] = data.slots
      .map((slot, i) => ({
        header: slotLabel(slot, i) ?? `Slot ${i + 1}`,
        annotations: slot.annotations
          .filter((a) => layer.types.includes(a.layer_type))
          .sort(byReferenceCode),
      }))
      .filter((g) => g.annotations.length > 0);
    return {
      key: layer.key,
      label: layer.label,
      colour: resolveLayerColour(layer.key, overrides),
      slots,
      total: slots.reduce((n, g) => n + g.annotations.length, 0),
    };
  }).filter((g) => g.total > 0);
  const calloutTotal = layerGroups.reduce((n, g) => n + g.total, 0);

  return (
    <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
      <Header data={data} />
      {data.slots.map((slot, i) => {
        const sl = layout.slots[i];
        return sl ? (
          <PdfSlot
            key={i}
            slot={slot}
            cell={sl.cell}
            geo={sl.geo}
            colourFor={colourFor}
            index={i}
          />
        ) : null;
      })}
      <NotesBox box={layout.notesBox} notes={data.notes} />
      <CalloutColumn
        zone={calloutZone()}
        layers={layerGroups}
        total={calloutTotal}
      />
      <Footer data={data} />
    </Page>
  );
}

/** The single-page document — the Preview dialog / per-page route's form. */
export function TechPackPage({ data }: { data: PdfPageData }) {
  return (
    <Document
      title={`${data.styleName}, Technical Details`}
      author={PDF_BRAND_NAME}
    >
      <TechPackCanvasPage data={data} />
    </Document>
  );
}

/** Render the page to a PDF Buffer (server-side). */
export async function renderTechPackPagePdf(data: PdfPageData): Promise<Buffer> {
  return renderToBuffer(<TechPackPage data={data} />);
}
