"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setSpecSampleSizes } from "@/app/(app)/products/[id]/spec-actions";
import { normalizeSizeLabel } from "@/lib/spec-grading";
import { cn } from "@/lib/utils";
import type { ResolvedSpecSheet } from "@/types";

/**
 * Step 3 — "Select the sample size(s)". The 1–2 sizes the user physically has
 * samples for (distinct from the full run — this is what "sample size" now
 * means). The first pick is the grading ANCHOR: in auto mode every other column
 * grades outward from it. A second pick is allowed now (it becomes a second
 * editable/known column; the auto-detect that USES two samples is Route B, next
 * session).
 */
export function SpecSampleStep({
  sheet,
  onSaved,
  onBack,
}: {
  sheet: ResolvedSpecSheet;
  onSaved: () => void;
  onBack: () => void;
}) {
  const sizeRun = sheet.size_run ?? [];
  const [picks, setPicks] = useState<string[]>(() =>
    (sheet.sample_sizes ?? []).filter((s) =>
      sizeRun.some((l) => normalizeSizeLabel(l) === normalizeSizeLabel(s)),
    ),
  );
  const [busy, setBusy] = useState(false);

  const pickedKeys = picks.map((p) => normalizeSizeLabel(p));

  function toggle(label: string) {
    const key = normalizeSizeLabel(label);
    setPicks((prev) => {
      const keys = prev.map((p) => normalizeSizeLabel(p));
      const at = keys.indexOf(key);
      if (at !== -1) return prev.filter((_, i) => i !== at);
      if (prev.length >= 2) return prev; // cap at two
      return [...prev, label];
    });
  }

  async function handleContinue() {
    if (picks.length === 0) return;
    setBusy(true);
    try {
      await setSpecSampleSizes(sheet.id, picks);
      onSaved();
    } catch {
      toast.error("Could not save the sample size(s).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-[13px] font-medium">
          Which size(s) did you sample?
        </Label>
        <p className="text-muted-foreground text-xs">
          Choose one or two sizes you physically measured. The first is the size
          everything grades from.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sizeRun.map((label) => {
          const key = normalizeSizeLabel(label);
          const at = pickedKeys.indexOf(key);
          const on = at !== -1;
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm tabular-nums transition-colors",
                on
                  ? "border-brand bg-brand/10 text-foreground font-medium"
                  : "border-input text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
              {at === 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  Grades from
                </Badge>
              )}
              {at === 1 && (
                <Badge variant="outline" className="text-[10px]">
                  2nd sample
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {picks.length >= 2 && (
        <p className="text-muted-foreground text-xs">
          Two samples chosen. Auto-detecting the grade from both is coming soon —
          for now the second is simply a second column you can enter directly.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button onClick={handleContinue} disabled={busy || picks.length === 0}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
