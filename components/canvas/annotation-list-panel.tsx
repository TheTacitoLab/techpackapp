"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { getAnnotationSummary } from "@/components/canvas/annotation-summary";
import {
  colourForLayerType,
  layerByKey,
  readableTextOn,
  type LayerKey,
} from "@/components/canvas/layers";
import { renameColourway } from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import type { CanvasAnnotation, CanvasColourway, ColourwayGroup } from "@/types";

/**
 * Collapsible right-hand list of the active layer's annotations. Generic across
 * layers via the shared `getAnnotationSummary` helper — adding a layer means
 * extending that summary function, not this component.
 *
 * The one exception is Colourways: because a product has multiple named
 * colourways, that layer passes `colourwayGroups` (built product-side) and this
 * panel renders a heading per colourway instead of one flat list. The grouping
 * is deliberately scoped to this layer, not a generic multi-level system.
 */
export function AnnotationListPanel({
  annotations,
  colourwayGroups,
  onRenameColourway,
  activeLayerKey,
  selectedId,
  onSelect,
  isCollapsed,
  onToggleCollapse,
}: {
  annotations: CanvasAnnotation[];
  colourwayGroups?: ColourwayGroup[];
  onRenameColourway?: (id: string, name: string) => void;
  activeLayerKey: LayerKey;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const layer = layerByKey(activeLayerKey);
  const grouped = activeLayerKey === "colourway" && colourwayGroups !== undefined;
  const isEmpty = grouped
    ? colourwayGroups.every((g) => g.annotations.length === 0)
    : annotations.length === 0;

  if (isCollapsed) {
    return (
      <div className="border-border bg-card flex w-10 shrink-0 flex-col items-center border-l py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand annotation list"
          className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-border bg-card flex w-72 shrink-0 flex-col overflow-hidden rounded-r-xl border-l">
      <div className="border-border flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-sm font-semibold">{layer.label}</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse annotation list"
          className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isEmpty ? (
          <p className="text-muted-foreground p-3 text-xs">
            No {layer.label.toLowerCase()} annotations yet — click the drawing
            to add one.
          </p>
        ) : grouped ? (
          <div className="space-y-3">
            {colourwayGroups
              .filter((g) => g.annotations.length > 0)
              .map((group) => (
                <div key={group.colourway.id}>
                  <ColourwayHeading
                    colourway={group.colourway}
                    onRename={onRenameColourway}
                  />
                  <ul className="space-y-1">
                    {group.annotations.map((annotation) => (
                      <ListRow
                        key={annotation.id}
                        annotation={annotation}
                        isSelected={annotation.id === selectedId}
                        onSelect={onSelect}
                      />
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {annotations.map((annotation) => (
              <ListRow
                key={annotation.id}
                annotation={annotation}
                isSelected={annotation.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * A colourway group heading, inline-renamable (double-click) when an
 * `onRename` callback is supplied. Renaming only changes the display name —
 * `sequence_number` and every pin's reference code are untouched — via the
 * `renameColourway` action, with the optimistic update handled by the parent's
 * callback (reverted on error). Mirrors the page-name inline-edit pattern.
 */
function ColourwayHeading({
  colourway,
  onRename,
}: {
  colourway: CanvasColourway;
  onRename?: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(colourway.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const headingClass =
    "text-muted-foreground px-2 pb-1 text-xs font-semibold tracking-wide uppercase";

  if (!onRename) {
    return <h4 className={headingClass}>{colourway.name}</h4>;
  }

  function commit() {
    setEditing(false);
    const next = value.trim();
    if (!next || next === colourway.name) {
      setValue(colourway.name);
      return;
    }
    onRename?.(colourway.id, next); // optimistic
    void renameColourway(colourway.id, next).catch(() => {
      toast.error("Could not rename the colourway.");
      onRename?.(colourway.id, colourway.name); // revert
      setValue(colourway.name);
    });
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        maxLength={60}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setValue(colourway.name);
            setEditing(false);
          }
        }}
        className="border-border bg-background mx-2 mb-1 w-[calc(100%-1rem)] rounded-md border px-1.5 py-0.5 text-xs font-semibold uppercase outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onDoubleClick={() => {
        setValue(colourway.name);
        setEditing(true);
      }}
      title="Double-click to rename"
      className={cn(headingClass, "block text-left")}
    >
      {colourway.name}
    </button>
  );
}

function ListRow({
  annotation,
  isSelected,
  onSelect,
}: {
  annotation: CanvasAnnotation;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const summary = getAnnotationSummary(annotation);
  const color = colourForLayerType(annotation.layer_type);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(annotation.id)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <span
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ backgroundColor: color, color: readableTextOn(color) }}
        >
          {annotation.reference_code}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {/* Leading visual — one generic slot per row: an icon image when
                the summary carries one (stitch SVG diagram), else a colour
                dot (Colourways), else nothing. 3:2 to match the seeded
                120×80 diagrams; white ground so they read in dark mode. */}
            {summary.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={summary.icon}
                alt=""
                className="h-6 w-9 shrink-0 rounded-sm border bg-white object-contain"
              />
            ) : summary.swatch ? (
              <span
                className="size-3 shrink-0 rounded-full border"
                style={{ backgroundColor: summary.swatch }}
              />
            ) : null}
            <span className="text-foreground block truncate text-sm font-medium">
              {summary.title}
            </span>
          </span>
          {summary.detail && (
            <span className="text-muted-foreground block truncate text-xs">
              {summary.detail}
            </span>
          )}
        </span>
        <ChevronRight className="text-muted-foreground mt-1 size-3.5 shrink-0" />
      </button>
    </li>
  );
}
