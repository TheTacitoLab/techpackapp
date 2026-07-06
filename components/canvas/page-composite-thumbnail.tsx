"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

import { useLayerColours } from "@/components/canvas/layer-colours-context";
import {
  fitImageArea,
  templateCellLayout,
  type CellLayout,
} from "@/lib/canvas-layout";
import {
  normaliseFitMode,
  slotImageCssTransform,
  slotImageObjectFit,
} from "@/lib/cover-geometry";
import { slotGeometry } from "@/lib/pdf/page-geometry";
import { cn } from "@/lib/utils";
import type { ResolvedCanvasPage, ResolvedSlot } from "@/types";

/**
 * A small, STATIC composite render of a page — its imagery at the locked
 * framing with every pin on it — for the Technical Details launchpad cards.
 * Strictly see-and-enter: nothing in here is interactive.
 *
 * Not a new renderer: every piece of geometry is the composed render path the
 * editor and the PDF already share, called at thumbnail size —
 *   • `fitImageArea` + `templateCellLayout` (lib/canvas-layout) shape the
 *     image-area replica and its cells, exactly like the canvas and the PDF;
 *   • `slotGeometry` (lib/pdf/page-geometry — the PDF's own slot-framing
 *     function) contain-fits each slot's frozen lock box into its cell with
 *     one uniform scale `k`, including the PDF's approximate fallback (crop
 *     offsets zeroed when a slot has no frozen dims);
 *   • `slotImageCssTransform` / `slotImageObjectFit` (lib/cover-geometry)
 *     paint the image in lock space, exactly like the editor's AnnotationSlot.
 * Pin POSITIONS are fractions × the slot box (the same contract as screen and
 * PDF); only the glyphs are fixed-size dots/lines — like the PDF's fixed-point
 * pin sizes — so they stay legible at thumbnail scale.
 */
export function PageCompositeThumbnail({
  page,
  className,
}: {
  page: ResolvedCanvasPage;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () =>
      setAvail({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const replica = fitImageArea(avail.width, avail.height);
  const cells = templateCellLayout(page.template, {
    left: 0,
    top: 0,
    width: replica.width,
    height: replica.height,
  });
  const slots = [...page.slots].sort((a, b) => a.slot_index - b.slot_index);

  return (
    <div
      ref={boxRef}
      className={cn(
        "bg-muted flex w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      {/* The proportional replica — same aspect + arrangement + gutters as the
          editor and the PDF, just scaled to the thumbnail. */}
      <div
        className="relative shrink-0"
        style={{ width: replica.width, height: replica.height }}
      >
        {slots.map((slot, i) => {
          const layout = cells[i];
          if (!layout) return null;
          return <CompositeSlot key={slot.id} slot={slot} layout={layout} />;
        })}
      </div>
    </div>
  );
}

// ---- One slot's composite ----------------------------------------------------

function CompositeSlot({
  slot,
  layout,
}: {
  slot: ResolvedSlot;
  layout: CellLayout;
}) {
  // Live workspace marker colours — the launchpad pins match the editor's.
  const { colourForType } = useLayerColours();
  const { cell, inner } = layout;

  const cellFrame = (
    <div
      className="bg-muted-foreground/10 absolute flex items-center justify-center rounded-[2px]"
      style={{
        left: cell.left,
        top: cell.top,
        width: cell.width,
        height: cell.height,
      }}
    >
      {!slot.asset && <ImageIcon className="text-muted-foreground/50 size-4" />}
    </div>
  );

  if (!slot.asset) return cellFrame;

  // The SAME slot-framing call the PDF export makes: frozen lock box
  // contain-fitted + centred in the inset cell, one uniform scale k. Natural
  // dims are passed null — CSS object-fit performs the base fit instead of an
  // explicit image rect, exactly like the editor's fallback paint path.
  const geo = slotGeometry(
    inner,
    {
      crop_x: slot.crop_x,
      crop_y: slot.crop_y,
      zoom: slot.zoom,
      fit_mode: slot.fit_mode,
      lock_width: slot.lock_width,
      lock_height: slot.lock_height,
    },
    null,
    null,
  );
  const { box, k, approximate } = geo;
  // Pre-measure (zero-size replica) — the frame alone until sizes land.
  if (k <= 0 || box.width <= 0 || box.height <= 0) return cellFrame;

  // Lock-space dims, recovered from the geometry (box = lock × k).
  const designW = box.width / k;
  const designH = box.height / k;
  // Without frozen lock dims the px crop offsets are meaningless at this
  // scale — zeroed, the same honest fallback `slotGeometry` applies to its
  // own image rect (zoom is dimensionless and kept).
  const cropX = approximate ? 0 : slot.crop_x;
  const cropY = approximate ? 0 : slot.crop_y;

  return (
    <>
      {cellFrame}
      <div
        className="absolute overflow-hidden"
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }}
      >
        {/* Frozen design-space box scaled to the thumbnail as one unit — the
            editor's proven drift-free mechanism at a smaller k. */}
        <div
          className="absolute"
          style={{
            width: designW,
            height: designH,
            transform: `scale(${k})`,
            transformOrigin: "top left",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.asset.file_url}
            alt={slot.asset.name}
            className="pointer-events-none absolute size-full"
            style={{
              objectFit: slotImageObjectFit(normaliseFitMode(slot.fit_mode)),
              transform: slotImageCssTransform(cropX, cropY, slot.zoom),
              transformOrigin: "center",
            }}
            draggable={false}
          />
        </div>

        {/* Every pin, composed — positions are fractions × the slot box (the
            screen/PDF contract); glyphs are fixed-size so they read at
            thumbnail scale. Measurement lines draw as a line + end dots. */}
        <svg
          className="pointer-events-none absolute inset-0"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          {slot.annotations.map((a) => {
            const colour = colourForType(a.layer_type);
            const x = a.x * box.width;
            const y = a.y * box.height;
            if (a.pin_type === "line" && a.end_x !== null && a.end_y !== null) {
              const x2 = a.end_x * box.width;
              const y2 = a.end_y * box.height;
              return (
                <g key={a.id}>
                  <line
                    x1={x}
                    y1={y}
                    x2={x2}
                    y2={y2}
                    stroke={colour}
                    strokeWidth={1.25}
                  />
                  <circle cx={x} cy={y} r={2} fill={colour} />
                  <circle cx={x2} cy={y2} r={2} fill={colour} />
                </g>
              );
            }
            return (
              <circle
                key={a.id}
                cx={x}
                cy={y}
                r={3}
                fill={colour}
                stroke="#FFFFFF"
                strokeWidth={1}
              />
            );
          })}
        </svg>
      </div>
    </>
  );
}
