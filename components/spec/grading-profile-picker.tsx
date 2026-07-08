"use client";

import { useState } from "react";
import { Copy, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GradingProfileDialog,
  type GradingProfilePayload,
} from "@/components/spec/grading-profile-dialog";
import type { GradingProfile, ResolvedGradingProfile } from "@/types";

/**
 * Step 3 — "Apply grading": a grouped Select over the seeded starters
 * (badged "GarSpec standard", read-only) and the workspace's custom profiles,
 * with the three profile operations alongside: New (create custom),
 * Customise (duplicate-to-edit a seeded starter) and Edit (workspace
 * profiles). The parent owns persistence and the optimistic profile list;
 * this component owns only the dialog choreography.
 */
export function GradingProfilePicker({
  profiles,
  value,
  disabled = false,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  profiles: ResolvedGradingProfile[];
  value: string | null;
  disabled?: boolean;
  onSelect: (profileId: string) => void;
  onCreate: (payload: GradingProfilePayload) => Promise<void>;
  onUpdate: (profileId: string, payload: GradingProfilePayload) => Promise<void>;
  onDelete: (profileId: string) => Promise<void>;
  /** Duplicates server-side and returns the new workspace copy (also selected by the parent). */
  onDuplicate: (profileId: string) => Promise<GradingProfile>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<GradingProfile | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  const seeded = profiles.filter((p) => p.isGlobal);
  const custom = profiles.filter((p) => !p.isGlobal);
  const selected = profiles.find((p) => p.id === value) ?? null;

  function openCreate() {
    setDialogMode("create");
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(profile: GradingProfile) {
    setDialogMode("edit");
    setEditTarget(profile);
    setDialogOpen(true);
  }

  async function handleCustomise() {
    if (!selected) return;
    setDuplicating(true);
    try {
      const copy = await onDuplicate(selected.id);
      openEdit(copy);
    } catch {
      // The parent already toasted; swallow so the click handler settles.
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={value ?? undefined}
        onValueChange={onSelect}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-56">
          <SelectValue placeholder="Choose a grading profile…" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>GarSpec standard</SelectLabel>
            {seeded.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectGroup>
          {custom.length > 0 && (
            <SelectGroup>
              <SelectLabel>My profiles</SelectLabel>
              {custom.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {selected?.isGlobal && (
        <>
          <Badge variant="secondary" className="text-[10px]">
            GarSpec standard
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={disabled || duplicating}
            onClick={handleCustomise}
            title="Seeded profiles are read-only, customise a copy"
          >
            <Copy className="size-3.5" />
            {duplicating ? "Copying…" : "Customise"}
          </Button>
        </>
      )}
      {selected && !selected.isGlobal && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={disabled}
          onClick={() => openEdit(selected)}
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        disabled={disabled}
        onClick={openCreate}
      >
        <Plus className="size-3.5" />
        New
      </Button>

      <GradingProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        profile={editTarget}
        onSave={async (payload) => {
          if (dialogMode === "edit" && editTarget) {
            await onUpdate(editTarget.id, payload);
          } else {
            await onCreate(payload);
          }
        }}
        onDelete={
          dialogMode === "edit" && editTarget
            ? () => onDelete(editTarget.id)
            : undefined
        }
      />
    </div>
  );
}
