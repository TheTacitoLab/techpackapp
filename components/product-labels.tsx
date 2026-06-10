"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Tag, X } from "lucide-react";
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
    <div className="flex flex-wrap items-center gap-2">
      {assignedLabels.map((label) => (
        <span
          key={label.id}
          className="bg-muted/60 inline-flex items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5 text-xs"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          <span className="max-w-[10rem] truncate">{label.name}</span>
          <button
            type="button"
            onClick={() => toggle(label.id)}
            disabled={isPending}
            aria-label={`Remove ${label.name}`}
            className="text-muted-foreground hover:text-foreground flex size-4 cursor-pointer items-center justify-center rounded-full transition-colors"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            {assignedLabels.length === 0 ? (
              <>
                <Tag className="size-3.5" />
                Add labels
              </>
            ) : (
              <Plus className="size-3.5" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
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
