"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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
 * Searchable fabric picker over the resolved Master Library. Built as a
 * combobox (command + popover) so it can be reused by the BOM (Phase 6) and
 * canvas annotation (Phase 5). Searches both fabric name and composition, and
 * flags global TechPackApp catalogue items with a small chip.
 */
export function FabricPicker({
  fabrics,
  value,
  onChange,
  placeholder = "Select a shell fabric…",
}: {
  fabrics: ResolvedLibraryItem[];
  value: string | null;
  onChange: (id: string, item: ResolvedLibraryItem) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = fabrics.find((f) => f.id === value) ?? null;

  if (fabrics.length === 0) {
    return (
      <div className="bg-muted text-muted-foreground rounded-md px-3 py-2.5 text-sm">
        No fabrics yet. Add fabrics in{" "}
        <span className="text-foreground font-medium">
          Settings → Master Library
        </span>
        .
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-9 w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 flex-col items-start">
              <span className="truncate font-medium">{selected.name}</span>
              {composition(selected) && (
                <span className="text-muted-foreground truncate text-xs">
                  {composition(selected)}
                </span>
              )}
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
          <CommandInput placeholder="Search by name or composition…" />
          <CommandList>
            <CommandEmpty>No matching fabrics.</CommandEmpty>
            <CommandGroup>
              {fabrics.map((fabric) => {
                const comp = composition(fabric);
                const weight = gsm(fabric);
                // cmdk filters on this value — include composition so search
                // matches both the fabric name and its make-up.
                const searchValue = `${fabric.name} ${comp ?? ""}`;
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
                      {comp && (
                        <span className="text-muted-foreground text-xs">
                          {comp}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
