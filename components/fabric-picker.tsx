"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ResolvedLibraryItem } from "@/types";

/**
 * Leading thumbnail for items that carry a diagram (stitch types) — sized 3:2
 * to match the seeded 120×80 SVG viewBox, on white so the grey-fabric/volt
 * strokes stay readable in dark mode. A plain `<img>`: the sources are inline
 * data URIs, which next/image can't optimise anyway.
 */
function ItemThumb({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-6 w-9 shrink-0 rounded-sm border bg-white object-contain"
    />
  );
}

/** Reads a string property off a library item's free-form `properties` jsonb. */
function readProp(item: ResolvedLibraryItem, key: string): string | null {
  const props = item.properties as Record<string, unknown> | null;
  const value = props?.[key];
  if (value === null || value === undefined) return null;
  return String(value);
}

function composition(item: ResolvedLibraryItem): string | null {
  return readProp(item, "composition");
}

function gsm(item: ResolvedLibraryItem): string | null {
  return readProp(item, "gsm");
}

/**
 * Searchable fabric/library-item picker over the resolved Master Library.
 * Built as a combobox (command + popover) so it can be reused across sections —
 * the canvas Fabrics & Trim pin editor passes a `summaryLine` to show a
 * category-appropriate one-liner (composition for fabrics, brand+gauge for a
 * zip, etc.) instead of the fabric-specific composition/GSM default, and the
 * Construction editor passes `thumbnailUrl` so each stitch row leads with its
 * SVG diagram. Searches both name and the summary line, and flags global
 * TechPackApp catalogue items with a small chip.
 *
 * `onCreateNew` (optional) adds the inline "add to library" entry point: a
 * pinned action below the result list — always visible, so it works both when
 * a search finds nothing and when the user simply wants a new item — that
 * reports the CURRENT SEARCH TEXT so the caller can pre-fill the new item's
 * name with what was typed. When the library is empty it renders as a plain
 * button in place of the dead-end empty box. The picker itself opens nothing:
 * the caller owns the quick-add form (it knows the category and what to do
 * with the created item).
 */
export function FabricPicker({
  fabrics,
  value,
  onChange,
  placeholder = "Select a shell fabric…",
  summaryLine,
  thumbnailUrl,
  emptyMessage,
  onCreateNew,
  createLabel = "Add new item to library",
}: {
  fabrics: ResolvedLibraryItem[];
  value: string | null;
  onChange: (id: string, item: ResolvedLibraryItem) => void;
  placeholder?: string;
  /** Overrides the default composition/GSM summary shown per row + trigger. */
  summaryLine?: (item: ResolvedLibraryItem) => string | null;
  /**
   * Optional per-item image (e.g. the stitch diagram SVG data URI) rendered as
   * a small leading thumbnail on each row and on the selected trigger.
   */
  thumbnailUrl?: (item: ResolvedLibraryItem) => string | null;
  /** Overrides the default "No fabrics yet…" empty-state copy. */
  emptyMessage?: React.ReactNode;
  /**
   * Show the inline-add action; called with the search text typed so far (may
   * be empty) so the new item's name can be pre-filled with it.
   */
  onCreateNew?: (searchText: string) => void;
  /** Label for the inline-add action when nothing has been typed. */
  createLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = fabrics.find((f) => f.id === value) ?? null;
  const selectedThumb = selected ? (thumbnailUrl?.(selected) ?? null) : null;
  const summary = summaryLine ?? composition;

  function handleCreateNew() {
    const text = search.trim();
    setOpen(false);
    setSearch("");
    onCreateNew?.(text);
  }

  if (fabrics.length === 0) {
    if (onCreateNew) {
      return (
        <div className="space-y-1.5">
          {emptyMessage && (
            <div className="bg-muted text-muted-foreground rounded-md px-3 py-2.5 text-sm">
              {emptyMessage}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal"
            onClick={handleCreateNew}
          >
            <Plus className="size-4" /> {createLabel}
          </Button>
        </div>
      );
    }
    return (
      <div className="bg-muted text-muted-foreground rounded-md px-3 py-2.5 text-sm">
        {emptyMessage ?? (
          <>
            No fabrics yet. Add fabrics in{" "}
            <span className="text-foreground font-medium">
              Settings → Master Library
            </span>
            .
          </>
        )}
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-9 w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              {selectedThumb && <ItemThumb url={selectedThumb} />}
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate font-medium">{selected.name}</span>
                {summary(selected) && (
                  <span className="text-muted-foreground truncate text-xs">
                    {summary(selected)}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search by name or composition…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matching items.</CommandEmpty>
            <CommandGroup>
              {fabrics.map((fabric) => {
                const line = summary(fabric);
                const weight = gsm(fabric);
                const thumb = thumbnailUrl?.(fabric) ?? null;
                // cmdk filters on this value — include the summary so search
                // matches both the item name and its make-up.
                const searchValue = `${fabric.name} ${line ?? ""}`;
                return (
                  <CommandItem
                    key={fabric.id}
                    value={searchValue}
                    onSelect={() => {
                      onChange(fabric.id, fabric);
                      setOpen(false);
                    }}
                    className="items-start"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        fabric.id === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {thumb && <ItemThumb url={thumb} />}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{fabric.name}</span>
                        {weight && (
                          <Badge variant="secondary" className="text-[10px]">
                            {weight} GSM
                          </Badge>
                        )}
                        {fabric.isGlobal && (
                          <Badge variant="outline" className="text-[10px]">
                            TechPackApp
                          </Badge>
                        )}
                      </span>
                      {line && (
                        <span className="text-muted-foreground text-xs">
                          {line}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {onCreateNew && (
            /* Pinned BELOW the list (not a CommandItem) so cmdk's filtering
               can never hide it — reachable with or without matches. */
            <button
              type="button"
              onClick={handleCreateNew}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 border-t px-3 py-2.5 text-sm transition-colors"
            >
              <Plus className="size-4 shrink-0" />
              <span className="truncate">
                {search.trim() ? (
                  <>
                    Add &ldquo;<span className="text-foreground font-medium">{search.trim()}</span>&rdquo; to library
                  </>
                ) : (
                  createLabel
                )}
              </span>
            </button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
