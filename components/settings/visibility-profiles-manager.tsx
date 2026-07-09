"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Eye,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  cloneVisibilityProfile,
  createVisibilityProfile,
  deleteVisibilityProfile,
  updateVisibilityProfile,
} from "@/app/(app)/settings/partner-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { ToggleRow } from "@/components/toggle-row";
import {
  countEnabledGroups,
  isSensitiveGroup,
  newProfileFieldGroups,
  readFieldGroups,
} from "@/lib/visibility-profiles";
import {
  VISIBILITY_GROUPS,
  VISIBILITY_GROUP_LABEL,
  VISIBILITY_SECTION_KEYS,
  VISIBILITY_SECTION_LABEL,
  type VisibilityFieldGroups,
  type VisibilityGroupKey,
  type VisibilitySectionKey,
} from "@/types/visibility";
import type { VisibilityProfile } from "@/types";

/** Deep-clone the toggle map so edits don't mutate the incoming state. */
function cloneGroups(groups: VisibilityFieldGroups): VisibilityFieldGroups {
  return JSON.parse(JSON.stringify(groups)) as VisibilityFieldGroups;
}

/**
 * The builder body — five section blocks, each listing its field-group
 * checkboxes. Pricing and Costs carry a "Sensitive" marker and, being off in
 * every fresh profile, must be turned on deliberately. Controlled: the parent
 * dialog owns the `groups` state so Save/Cancel work.
 */
function ProfileBuilder({
  groups,
  onToggle,
}: {
  groups: VisibilityFieldGroups;
  onToggle: (section: VisibilitySectionKey, group: VisibilityGroupKey) => void;
}) {
  return (
    <div className="space-y-4">
      {VISIBILITY_SECTION_KEYS.map((section) => (
        <div key={section} className="rounded-lg border">
          <div className="border-b px-3 py-2 text-sm font-semibold">
            {VISIBILITY_SECTION_LABEL[section]}
          </div>
          <div className="p-1.5">
            {VISIBILITY_GROUPS[section].map((group) => {
              const sensitive = isSensitiveGroup(group);
              const checked =
                groups[section][
                  group as keyof VisibilityFieldGroups[typeof section]
                ];
              return (
                <div key={group} className="flex items-center gap-2">
                  <ToggleRow
                    checked={checked}
                    label={VISIBILITY_GROUP_LABEL[group]}
                    onToggle={() => onToggle(section, group)}
                    className="flex-1"
                  />
                  {sensitive && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-700 dark:text-amber-400"
                    >
                      <ShieldAlert className="size-3" />
                      Sensitive
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Lock className="mt-0.5 size-3 shrink-0" />
        Hidden groups are removed from the partner&rsquo;s view entirely — they
        never learn a group exists. Pricing and Costs stay off unless you turn
        them on.
      </p>
    </div>
  );
}

/** Shared create/edit dialog. `profile` null => create mode. */
function ProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: VisibilityProfile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(profile?.name ?? "");
  const [groups, setGroups] = useState<VisibilityFieldGroups>(
    profile ? readFieldGroups(profile.field_groups) : newProfileFieldGroups(),
  );

  // Re-seed when the dialog opens for a different profile (or create).
  const [seededFor, setSeededFor] = useState<string | null>(profile?.id ?? null);
  if (open && seededFor !== (profile?.id ?? null)) {
    setSeededFor(profile?.id ?? null);
    setName(profile?.name ?? "");
    setGroups(
      profile ? readFieldGroups(profile.field_groups) : newProfileFieldGroups(),
    );
  }

  function toggle(section: VisibilitySectionKey, group: VisibilityGroupKey) {
    setGroups((prev) => {
      const next = cloneGroups(prev);
      const sectionMap = next[section] as Record<string, boolean>;
      sectionMap[group] = !sectionMap[group];
      return next;
    });
  }

  function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a profile name.");
      return;
    }
    startTransition(async () => {
      try {
        if (profile) {
          await updateVisibilityProfile(profile.id, trimmed, groups);
          toast.success("Profile saved.");
        } else {
          await createVisibilityProfile(trimmed, groups);
          toast.success("Profile created.");
        }
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not save the profile.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {profile ? "Edit visibility profile" : "New visibility profile"}
          </DialogTitle>
          <DialogDescription>
            Choose which field-groups a partner assigned this profile can see.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel htmlFor="profile-name">Profile name</FieldLabel>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brand Review"
              maxLength={60}
            />
          </div>
          <ProfileBuilder groups={groups} onToggle={toggle} />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileRow({ profile }: { profile: VisibilityProfile }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { enabled, total } = countEnabledGroups(
    readFieldGroups(profile.field_groups),
  );

  function onClone() {
    startTransition(async () => {
      try {
        await cloneVisibilityProfile(profile.id);
        toast.success("Profile cloned.");
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not clone the profile.",
        );
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteVisibilityProfile(profile.id);
        toast.success("Profile deleted.");
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not delete the profile.",
        );
      }
    });
  }

  return (
    <li className="bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{profile.name}</span>
            {profile.is_default && (
              <Badge variant="secondary" className="text-[10px]">
                Default
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {enabled} of {total} field-groups visible
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditOpen(true)}
          disabled={isPending}
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClone}
          disabled={isPending}
          title="Duplicate this profile"
        >
          <Copy className="size-3.5" />
          Clone
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={isPending}
              aria-label={`Delete ${profile.name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete &ldquo;{profile.name}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This can&rsquo;t be undone. A profile currently used by a
                partner grant can&rsquo;t be deleted until those grants are
                reassigned or revoked.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <ProfileDialog
        profile={profile}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </li>
  );
}

export function VisibilityProfilesManager({
  profiles,
}: {
  profiles: VisibilityProfile[];
}) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-prose text-sm">
          A visibility profile is a reusable, named set of field-group toggles —
          build a few (like the seeded &ldquo;Factory Merchandiser&rdquo;) once,
          then assign or clone them per partner. Hidden groups are removed from
          the partner&rsquo;s view.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
          New Profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          No visibility profiles yet. Create one to start assigning partner
          access.
        </p>
      ) : (
        <ul className="space-y-2">
          {profiles.map((p) => (
            <ProfileRow key={p.id} profile={p} />
          ))}
        </ul>
      )}

      <ProfileDialog
        profile={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
