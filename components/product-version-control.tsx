"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Tag } from "lucide-react";
import { toast } from "sonner";

import { bumpProductVersion } from "@/app/(app)/products/[id]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  nextProductVersion,
  productVersionLabel,
  type VersionBumpKind,
} from "@/lib/product-version";
import { cn } from "@/lib/utils";

/**
 * The product header's version chip — shows the current version (v1.0) and
 * opens the "New version" dialog: the manual promotion performed when sending
 * the factory an updated pack. Minor (v1.1) is the default; major (v2.0) is
 * the full-revision option. The optional note becomes the version's header in
 * the Change Log. Continuous logging means nothing else changes — entries
 * simply start attaching to the new version.
 */
export function ProductVersionControl({
  productId,
  versionMajor,
  versionMinor,
}: {
  productId: string;
  versionMajor: number;
  versionMinor: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<VersionBumpKind>("minor");
  const [note, setNote] = useState("");

  const current = productVersionLabel(versionMajor, versionMinor);
  const nextLabelFor = (k: VersionBumpKind) => {
    const next = nextProductVersion(versionMajor, versionMinor, k);
    return productVersionLabel(next.major, next.minor);
  };

  function submit() {
    startTransition(async () => {
      try {
        const { label } = await bumpProductVersion(
          productId,
          kind,
          note.trim() === "" ? null : note.trim(),
        );
        toast.success(`Version ${label} created.`);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Could not create the new version.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Fresh dialog = the defaults again (minor bump, empty note).
        if (next) {
          setKind("minor");
          setNote("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2.5 text-xs"
          title="Current tech pack version — create a new one to send an updated pack."
        >
          <Tag className="size-3.5" />
          {current}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New version</DialogTitle>
          <DialogDescription>
            Promote {current} when you send the factory an updated pack. Changes
            keep logging under the new version; earlier versions keep their
            history in the Change Log.
          </DialogDescription>
        </DialogHeader>

        {/* Toggle-button pair (aria-pressed), deliberately NOT role=radio —
            radio semantics promise arrow-key selection these plain buttons
            don't implement. */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "minor", title: "Minor update" },
              { value: "major", title: "Major revision" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={kind === option.value}
              onClick={() => setKind(option.value)}
              className={cn(
                "focus-visible:ring-ring flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2",
                kind === option.value
                  ? "border-primary"
                  : "border-input hover:bg-accent",
              )}
            >
              <span className="flex w-full items-center justify-between text-sm font-medium">
                {option.title}
                {kind === option.value && <Check className="size-3.5" />}
              </span>
              <span className="text-muted-foreground text-xs">
                {current} → {nextLabelFor(option.value)}
              </span>
            </button>
          ))}
        </div>

        <Textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="What changed in this version? (optional — shown in the Change Log)"
        />

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button disabled={isPending} onClick={submit}>
            {isPending ? "Creating…" : `Create ${nextLabelFor(kind)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
