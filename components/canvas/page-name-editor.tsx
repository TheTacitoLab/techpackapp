"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { renameCanvasPage } from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";

/**
 * Inline-editable page name. Double-click the label to edit; blur or Enter
 * commits via `renameCanvasPage`, Escape cancels. Rendered on the Overview cards
 * and the Edit-mode thumbnail strip, so the edit affordance stays identical
 * everywhere page names appear.
 */
export function PageNameEditor({
  pageId,
  name,
  fallback,
  className,
  inputClassName,
}: {
  pageId: string;
  name: string | null;
  fallback: string;
  className?: string;
  inputClassName?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Optimistic display value: `name` only reflects the rename once
  // `router.refresh()` resolves and the parent passes fresh server data down,
  // so without this the button would flash back to the stale prop the instant
  // `editing` flips off. Resynced from the prop when it legitimately changes,
  // via the same render-time state-adjustment pattern used for `localPages`.
  const [displayName, setDisplayName] = useState(name);
  const [syncedName, setSyncedName] = useState(name);
  if (name !== syncedName) {
    setSyncedName(name);
    setDisplayName(name);
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = value.trim();
    if (next === (displayName ?? "")) return;
    const previous = displayName;
    setDisplayName(next);
    void renameCanvasPage(pageId, next)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not rename the page.");
        setValue(previous ?? "");
        setDisplayName(previous);
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
            setValue(displayName ?? "");
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        // Both hosts (overview card, thumbnail-strip item) are `draggable`, so
        // a text-selection drag inside the input would otherwise start an
        // HTML5 drag of the card. Making the input itself the drag source and
        // cancelling that drag restores normal text selection.
        draggable
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        placeholder={fallback}
        className={cn(
          "border-border bg-background w-full rounded-md border px-1.5 py-0.5 text-sm outline-none",
          inputClassName,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setValue(displayName ?? "");
        setEditing(true);
      }}
      onClick={(e) => e.stopPropagation()}
      title="Double-click to rename"
      className={cn("truncate text-left", className)}
    >
      {displayName && displayName.length > 0 ? displayName : fallback}
    </button>
  );
}
