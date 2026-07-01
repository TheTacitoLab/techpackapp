"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { MiniTemplate } from "@/components/canvas/mini-template";
import { PageNameEditor } from "@/components/canvas/page-name-editor";
import { reorderCanvasPages } from "@/app/(app)/products/[id]/canvas-actions";
import { cn } from "@/lib/utils";
import type { ResolvedCanvasPage } from "@/types";

/**
 * The vertical page navigation axis (perpendicular to the horizontal layer
 * buttons — the two axes never mix). Each thumbnail is a mini template render;
 * the active page has a lime left border. Switching pages here does not touch
 * the active layer. Drag to reorder. In `collapsed` (fullscreen) mode it shrinks
 * to a 48px thumbs-only rail with no page-name text.
 */
export function PageThumbnailStrip({
  pages,
  activePageId,
  productId,
  collapsed = false,
  onSelect,
  onAddPage,
}: {
  pages: ResolvedCanvasPage[];
  activePageId: string;
  productId: string;
  collapsed?: boolean;
  onSelect: (pageId: string) => void;
  onAddPage: () => void;
}) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startReorder] = useTransition();

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const ids = pages.map((p) => p.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    setDraggingId(null);
    if (from === -1 || to === -1) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    startReorder(async () => {
      try {
        await reorderCanvasPages(productId, ids);
        router.refresh();
      } catch {
        toast.error("Could not reorder pages.");
      }
    });
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 overflow-y-auto",
        collapsed ? "w-12 border-r border-border p-1.5" : "w-[110px]",
      )}
    >
      {pages.map((page, index) => {
        const active = page.id === activePageId;
        return (
          <div
            key={page.id}
            draggable
            onDragStart={() => setDraggingId(page.id)}
            onDragEnd={() => setDraggingId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(page.id);
            }}
            className={cn(
              "cursor-pointer rounded-lg transition-all",
              collapsed ? "p-0.5" : "border-l-2 p-1",
              active
                ? "border-brand bg-card shadow-card"
                : "border-transparent hover:bg-muted",
              draggingId === page.id && "opacity-50",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(page.id)}
              className="block w-full outline-none"
              title={page.label ?? `Page ${index + 1}`}
            >
              <MiniTemplate
                page={page}
                className={cn(
                  "rounded-md",
                  collapsed ? "h-11" : "h-[72px]",
                )}
              />
            </button>
            {!collapsed && (
              <PageNameEditor
                pageId={page.id}
                name={page.label}
                fallback={`Page ${index + 1}`}
                className={cn(
                  "mt-1 w-full px-1 text-xs",
                  active ? "text-foreground font-medium" : "text-muted-foreground",
                )}
                inputClassName="text-xs"
              />
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAddPage}
        aria-label="Add page"
        className={cn(
          "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground flex shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors",
          collapsed ? "h-11" : "h-10",
        )}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
