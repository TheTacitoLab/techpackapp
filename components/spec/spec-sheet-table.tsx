"use client";

import { useRef, useState } from "react";
import { GripVertical, Info, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SpecRowEditor, type SpecRowDraft } from "@/components/spec/spec-row-editor";
import {
  categoryShortLabel,
  formatSpecValue,
  parseSpecValueInput,
} from "@/components/spec/spec-data";
import { normalizeSizeLabel } from "@/lib/spec-grading";
import { cn } from "@/lib/utils";
import type { ProductSpecRow } from "@/types";

/**
 * The Spec Sheet grid: POM rows down the side, the product's sizes across.
 *
 * Auto mode: only the sample column takes input; every other cell renders the
 * live-computed grade on a muted surface (computed values are never stored —
 * they re-derive on every sample/profile change). Manual mode: every cell is
 * an input over stored values. Row reorder is the house HTML5-drag pattern,
 * armed from the grip handle only so drags can't fight the cell inputs.
 */

/** One editable cell — local draft, commit on blur/Enter, Escape reverts. */
function SpecCellInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  ariaLabel: string;
}) {
  const serverText = value === null ? "" : String(value);
  const [text, setText] = useState(serverText);
  const [syncedText, setSyncedText] = useState(serverText);
  // Escape blurs programmatically, and the blur handler would otherwise
  // commit the stale draft (the setText hasn't re-rendered yet) — the ref
  // tells commit() this blur is a cancel, not a commit.
  const cancelledRef = useRef(false);
  if (serverText !== syncedText) {
    setSyncedText(serverText);
    setText(serverText);
  }

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const parsed = parseSpecValueInput(text);
    if (parsed === null && text.trim() !== "") {
      // Invalid entry — snap back rather than silently clearing the cell.
      // (Checked BEFORE the no-op test: on an empty cell both parse to null.)
      setText(serverText);
      return;
    }
    if (parsed === value) {
      setText(serverText);
      return;
    }
    onCommit(parsed);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelledRef.current = true;
          setText(serverText);
          e.currentTarget.blur();
        }
      }}
      className="border-input bg-card focus-visible:ring-ring h-8 w-20 rounded-md border px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

export function SpecSheetTable({
  rows,
  sizeRun,
  sampleSize,
  mode,
  storedValues,
  computedValues,
  toleranceFor,
  defaultToleranceLabelFor,
  onSaveCell,
  onUpdateRow,
  onDeleteRow,
  onReorderRows,
}: {
  rows: ProductSpecRow[];
  sizeRun: string[];
  sampleSize: string | null;
  mode: "auto" | "manual";
  /** rowId → NORMALIZED size label → stored value (see normalizeSizeLabel). */
  storedValues: Record<string, Record<string, number>>;
  /** Live-graded grid (auto mode with a profile); null when not applicable. */
  computedValues: Record<string, Record<string, number | null>> | null;
  toleranceFor: (row: ProductSpecRow) => number | null;
  defaultToleranceLabelFor: (row: ProductSpecRow) => string;
  onSaveCell: (rowId: string, sizeLabel: string, value: number | null) => void;
  onUpdateRow: (rowId: string, draft: SpecRowDraft) => Promise<void>;
  onDeleteRow: (rowId: string) => Promise<void>;
  onReorderRows: (rowIds: string[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  // The row only becomes draggable while the pointer is down on its grip.
  // Window-level one-shot listeners disarm it wherever the pointer is
  // released (a grip-local pointerup misses releases outside the handle,
  // leaving the row permanently draggable).
  function armRow(id: string) {
    setArmedId(id);
    const disarm = () =>
      setArmedId((current) => (current === id ? null : current));
    window.addEventListener("pointerup", disarm, { once: true });
    window.addEventListener("pointercancel", disarm, { once: true });
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const ids = rows.map((r) => r.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    setDraggingId(null);
    if (from === -1 || to === -1) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorderRows(ids);
  }

  // Sample matching is normalized (like the engine and the section), so a
  // casing-only edit to the size range can't strand the sample column.
  const normalizedSample =
    sampleSize === null ? null : normalizeSizeLabel(sampleSize);
  const isSampleColumn = (label: string) =>
    mode === "auto" &&
    normalizedSample !== null &&
    normalizeSizeLabel(label) === normalizedSample;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead className="w-16">Code</TableHead>
          <TableHead className="min-w-44">Measurement</TableHead>
          <TableHead className="w-20 text-right">Tol ±</TableHead>
          {sizeRun.map((label) => (
            <TableHead key={label} className="w-24 text-right">
              {isSampleColumn(label) ? (
                <span className="inline-flex items-center gap-1.5">
                  {label}
                  <Badge variant="secondary" className="text-[10px]">
                    Sample
                  </Badge>
                </span>
              ) : (
                label
              )}
            </TableHead>
          ))}
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const tolerance = toleranceFor(row);
          return (
            <TableRow
              key={row.id}
              draggable={armedId === row.id}
              onDragStart={(e) => {
                // Firefox refuses to begin an HTML5 drag unless dragstart sets data.
                e.dataTransfer.setData("text/plain", row.id);
                e.dataTransfer.effectAllowed = "move";
                setDraggingId(row.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setArmedId(null);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(row.id);
              }}
              className={cn(draggingId === row.id && "opacity-50")}
            >
              <TableCell className="w-8 px-1">
                <span
                  className="text-muted-foreground/60 hover:text-muted-foreground inline-flex size-6 cursor-grab items-center justify-center"
                  title="Drag to reorder"
                  onPointerDown={() => armRow(row.id)}
                >
                  <GripVertical className="size-3.5" />
                </span>
              </TableCell>
              <TableCell className="font-semibold">{row.code}</TableCell>
              <TableCell>
                <span className="inline-flex max-w-72 items-center gap-1.5">
                  <span className="truncate">{row.name}</span>
                  {row.how_to_measure && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground/70 hover:text-muted-foreground inline-flex shrink-0">
                          <Info className="size-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64">
                        {row.how_to_measure}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {categoryShortLabel(row.grade_category, row.sub_kind)}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {tolerance !== null ? formatSpecValue(tolerance) : "—"}
              </TableCell>
              {sizeRun.map((label) => {
                const editable = mode === "manual" || isSampleColumn(label);
                if (editable) {
                  return (
                    <TableCell key={label} className="text-right">
                      <SpecCellInput
                        value={
                          storedValues[row.id]?.[normalizeSizeLabel(label)] ??
                          null
                        }
                        onCommit={(value) => onSaveCell(row.id, label, value)}
                        ariaLabel={`${row.name} — ${label}`}
                      />
                    </TableCell>
                  );
                }
                const computed = computedValues?.[row.id]?.[label] ?? null;
                return (
                  <TableCell
                    key={label}
                    className="text-muted-foreground bg-muted/50 text-right tabular-nums"
                  >
                    {computed !== null ? formatSpecValue(computed) : "—"}
                  </TableCell>
                );
              })}
              <TableCell className="px-1">
                <SpecRowEditor
                  mode="edit"
                  row={row}
                  defaultToleranceLabel={defaultToleranceLabelFor(row)}
                  onSave={(draft) => onUpdateRow(row.id, draft)}
                  onDelete={() => onDeleteRow(row.id)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Edit ${row.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
