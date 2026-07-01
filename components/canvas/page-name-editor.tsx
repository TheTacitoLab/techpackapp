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

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = value.trim();
    if (next === (name ?? "")) return;
    void renameCanvasPage(pageId, next)
      .then(() => router.refresh())
      .catch(() => {
        toast.error("Could not rename the page.");
        setValue(name ?? "");
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
            setValue(name ?? "");
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
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
        setValue(name ?? "");
        setEditing(true);
      }}
      onClick={(e) => e.stopPropagation()}
      title="Double-click to rename"
      className={cn("truncate text-left", className)}
    >
      {name && name.length > 0 ? name : fallback}
    </button>
  );
}
