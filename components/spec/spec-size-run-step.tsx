"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEMOGRAPHIC_OPTIONS,
  hasSizingSystemChoice,
  isCustomDemographic,
  ladderFor,
} from "@/components/spec/spec-demographics";
import { setSpecSizeRun } from "@/app/(app)/products/[id]/spec-actions";
import { normalizeSizeLabel } from "@/lib/spec-grading";
import { cn } from "@/lib/utils";
import type {
  ResolvedSpecSheet,
  SpecDemographic,
  SpecSizingSystem,
} from "@/types";

/**
 * Step 2 — "Choose the size range". Pick a demographic (Youth / Men's /
 * Women's / Custom), then the sizing system (women's only — alpha vs numeric),
 * then TICK which sizes from that ladder apply to this sheet. Custom collects
 * free-entry labels instead of a checkbox ladder. The ticked run becomes the
 * sheet's columns; it owns its run entirely (nothing comes from Product Setup).
 */
export function SpecSizeRunStep({
  sheet,
  onSaved,
  onBack,
}: {
  sheet: ResolvedSpecSheet;
  onSaved: () => void;
  onBack: () => void;
}) {
  const [demographic, setDemographic] = useState<SpecDemographic>(
    sheet.demographic,
  );
  const [sizingSystem, setSizingSystem] = useState<SpecSizingSystem>(
    sheet.sizing_system,
  );
  // Ticked labels for the ladder demographics (kept in ladder order at save).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((sheet.size_run ?? []).map((l) => normalizeSizeLabel(l))),
  );
  const [customText, setCustomText] = useState(
    () => (sheet.size_run ?? []).join(", "),
  );
  const [busy, setBusy] = useState(false);

  const custom = isCustomDemographic(demographic);
  const ladder = ladderFor(demographic, sizingSystem);

  function pickDemographic(next: SpecDemographic) {
    if (next === demographic) return;
    setDemographic(next);
    // Fresh ladder → default to every size ticked (users usually want the whole
    // run, then untick the odd one out). Custom keeps its typed labels.
    if (!isCustomDemographic(next)) {
      const nextLadder = ladderFor(next, sizingSystem);
      setSelected(new Set(nextLadder.map((l) => normalizeSizeLabel(l))));
    }
  }

  function pickSystem(next: SpecSizingSystem) {
    if (next === sizingSystem) return;
    setSizingSystem(next);
    const nextLadder = ladderFor(demographic, next);
    setSelected(new Set(nextLadder.map((l) => normalizeSizeLabel(l))));
  }

  function toggle(label: string) {
    const key = normalizeSizeLabel(label);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resolveRun(): string[] {
    if (custom) {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of customText.split(/[,/\n]/)) {
        const label = raw.trim();
        if (label.length === 0) continue;
        const key = normalizeSizeLabel(label);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(label);
      }
      return out;
    }
    return ladder.filter((l) => selected.has(normalizeSizeLabel(l)));
  }

  const run = resolveRun();

  async function handleContinue() {
    if (run.length === 0) return;
    setBusy(true);
    try {
      await setSpecSizeRun(sheet.id, {
        demographic,
        sizingSystem: custom ? "alpha" : sizingSystem,
        sizeRun: run,
      });
      onSaved();
    } catch {
      toast.error("Could not save the size range.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Demographic */}
      <div className="space-y-2">
        <Label className="text-[13px] font-medium">Who is this sized for?</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DEMOGRAPHIC_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => pickDemographic(opt.value)}
              className={cn(
                "bg-card flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-shadow hover:ring-2",
                demographic === opt.value
                  ? "border-brand ring-brand ring-2"
                  : "hover:ring-brand/40",
              )}
            >
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-muted-foreground text-xs">
                {opt.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sizing system (women's only) */}
      {hasSizingSystemChoice(demographic) && (
        <div className="space-y-2">
          <Label className="text-[13px] font-medium">Sizing system</Label>
          <div className="flex gap-2">
            {(
              [
                { value: "alpha", label: "Alpha (XS–6XL)" },
                { value: "numeric", label: "Numeric (0, 2, 4…)" },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={sizingSystem === opt.value ? "secondary" : "outline"}
                size="sm"
                onClick={() => pickSystem(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Size ticks / custom entry */}
      {custom ? (
        <div className="space-y-1.5">
          <Label className="text-[13px] font-medium" htmlFor="spec-custom-run">
            Your sizes
          </Label>
          <Input
            id="spec-custom-run"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="e.g. 3-4, 5-6, 7-8  ·  or  ·  One Size"
          />
          <p className="text-muted-foreground text-xs">
            Separate sizes with commas. They become the sheet&rsquo;s columns in
            this order.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-[13px] font-medium">
            Which sizes are in this spec?
          </Label>
          <div className="flex flex-wrap gap-2">
            {ladder.map((label) => {
              const on = selected.has(normalizeSizeLabel(label));
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggle(label)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm tabular-nums transition-colors",
                    on
                      ? "border-brand bg-brand/10 text-foreground font-medium"
                      : "border-input text-muted-foreground hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-[4px] border",
                      on
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-input",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <span className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            {run.length} size{run.length === 1 ? "" : "s"}
          </span>
          <Button onClick={handleContinue} disabled={busy || run.length === 0}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        </span>
      </div>
    </div>
  );
}
