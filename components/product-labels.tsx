"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Tag } from "lucide-react";
import { toast } from "sonner";

import {
  addLabelToProduct,
  removeLabelFromProduct,
} from "@/app/(app)/settings/actions";
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
import type { Label } from "@/types";

export function ProductLabels({
  productId,
  labels,
  assignedIds,
}: {
  productId: string;
  labels: Label[];
  assignedIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const assigned = new Set(assignedIds);
  const assignedLabels = labels.filter((l) => assigned.has(l.id));

  // Compact display: at most three chips inline, the rest collapsed into a
  // "+N" counter. Removal lives in the popover (toggling an assigned label),
  // so the header chips stay dense and read-only.
  const MAX_VISIBLE = 3;
  const visibleLabels = assignedLabels.slice(0, MAX_VISIBLE);
  const overflowCount = assignedLabels.length - visibleLabels.length;

  function toggle(labelId: string) {
    const isAssigned = assigned.has(labelId);
    startTransition(async () => {
      try {
        if (isAssigned) {
          await removeLabelFromProduct(productId, labelId);
        } else {
          await addLabelToProduct(productId, labelId);
        }
        router.refresh();
      } catch {
        toast.error("Could not update labels.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {visibleLabels.map((label) => (
        <span
          key={label.id}
          className="bg-muted text-foreground inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs"
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          <span className="max-w-[7rem] truncate">{label.name}</span>
        </span>
      ))}

      {overflowCount > 0 && (
        <span className="text-muted-foreground text-xs">+{overflowCount}</span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
            {assignedLabels.length === 0 ? (
              <>
                <Tag className="size-3.5" />
                Label
              </>
            ) : (
              <Plus className="size-3.5" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="end">
          <Command>
            <CommandInput placeholder="Search labels…" />
            <CommandList>
              {labels.length === 0 ? (
                <CommandEmpty>
                  No labels yet. Create them in Settings.
                </CommandEmpty>
              ) : (
                <CommandEmpty>No labels found.</CommandEmpty>
              )}
              <CommandGroup>
                {labels.map((label) => {
                  const isAssigned = assigned.has(label.id);
                  return (
                    <CommandItem
                      key={label.id}
                      value={label.name}
                      onSelect={() => toggle(label.id)}
                      disabled={isPending}
                    >
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1 truncate">{label.name}</span>
                      {isAssigned && <Check className="size-4" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
