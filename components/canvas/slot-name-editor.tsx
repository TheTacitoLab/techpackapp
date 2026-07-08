"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { updateSlotName } from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";

/**
 * Inline-editable slot name, shown as a compact chip over the slot image.
 * Click to edit; blur or Enter commits via `updateSlotName`, Escape cancels —
 * the same optimistic save-on-blur pattern as PageNameEditor. A named slot
 * shows its name as the PDF box label and groups its callouts under it; an
 * unnamed slot shows a faint "Name this view" affordance. Stops pointer/click
 * propagation so editing never starts a pan or places a pin.
 */
export function SlotNameEditor({
  slotId,
  name,
}: {
  slotId: string;
  name: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Optimistic display value resynced from the prop via the render-time
  // adjustment pattern (matches PageNameEditor / localPages).
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
    void updateSlotName(slotId, next)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not rename the slot.");
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
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        placeholder="Name this view"
        className="w-32 rounded-md border border-white/30 bg-black/70 px-1.5 py-0.5 text-xs text-white outline-none placeholder:text-white/50"
      />
    );
  }

  const named = !!displayName && displayName.length > 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setValue(displayName ?? "");
        setEditing(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title="Click to name this view, appears on the PDF"
      className={cn(
        "flex max-w-[150px] items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
        named
          ? "bg-black/60 text-white hover:bg-black/70"
          : "bg-black/35 text-white/70 hover:bg-black/55 hover:text-white",
      )}
    >
      <Pencil className="size-3 shrink-0" />
      <span className="truncate">{named ? displayName : "Name this view"}</span>
    </button>
  );
}
