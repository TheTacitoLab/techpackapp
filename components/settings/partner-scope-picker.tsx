"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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
import type { PartnerGrantSubject } from "@/types";

/** The scope options a grant can target — assembled server-side in the page. */
export type GrantScopeOptions = {
  brands: { id: string; name: string }[];
  /** parentName set => this is a sub-collection (0042 one-level nesting). */
  collections: { id: string; name: string; parentName: string | null }[];
  products: { id: string; name: string }[];
};

/** A resolved scope selection: the subject type + id, plus a display label. */
export type ScopeSelection = {
  subjectType: PartnerGrantSubject;
  subjectId: string;
  label: string;
};

/**
 * Grant scope picker: one searchable combobox spanning brands, collections
 * (sub-collections labelled "Parent › Child"), and live products, grouped by
 * kind. The user picks WHAT a partner can see; the profile picker beside it
 * picks how much of it. Mirrors the FabricPicker combobox shape so the
 * Settings surfaces feel consistent.
 */
export function PartnerScopePicker({
  options,
  value,
  onChange,
}: {
  options: GrantScopeOptions;
  value: ScopeSelection | null;
  onChange: (selection: ScopeSelection) => void;
}) {
  const [open, setOpen] = React.useState(false);

  function collectionLabel(c: GrantScopeOptions["collections"][number]): string {
    return c.parentName ? `${c.parentName} › ${c.name}` : c.name;
  }

  function select(
    subjectType: PartnerGrantSubject,
    subjectId: string,
    label: string,
  ) {
    onChange({ subjectType, subjectId, label });
    setOpen(false);
  }

  const isEmpty =
    options.brands.length === 0 &&
    options.collections.length === 0 &&
    options.products.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={isEmpty}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground text-xs capitalize">
                {value.subjectType}
              </span>
              <span className="truncate font-medium">{value.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {isEmpty
                ? "No brands, collections or products yet"
                : "Select a scope…"}
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search brands, collections, products…" />
          <CommandList>
            <CommandEmpty>No matching scope.</CommandEmpty>
            {options.brands.length > 0 && (
              <CommandGroup heading="Brands">
                {options.brands.map((b) => (
                  <ScopeItem
                    key={`brand-${b.id}`}
                    label={b.name}
                    selected={
                      value?.subjectType === "brand" && value.subjectId === b.id
                    }
                    onSelect={() => select("brand", b.id, b.name)}
                  />
                ))}
              </CommandGroup>
            )}
            {options.collections.length > 0 && (
              <CommandGroup heading="Collections">
                {options.collections.map((c) => {
                  const label = collectionLabel(c);
                  return (
                    <ScopeItem
                      key={`collection-${c.id}`}
                      label={label}
                      selected={
                        value?.subjectType === "collection" &&
                        value.subjectId === c.id
                      }
                      onSelect={() => select("collection", c.id, label)}
                    />
                  );
                })}
              </CommandGroup>
            )}
            {options.products.length > 0 && (
              <CommandGroup heading="Products">
                {options.products.map((p) => (
                  <ScopeItem
                    key={`product-${p.id}`}
                    label={p.name}
                    selected={
                      value?.subjectType === "product" &&
                      value.subjectId === p.id
                    }
                    onSelect={() => select("product", p.id, p.name)}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ScopeItem({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={label} onSelect={onSelect}>
      <Check
        className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
      />
      <span className="truncate">{label}</span>
    </CommandItem>
  );
}
