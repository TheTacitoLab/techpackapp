"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  KeyRound,
  Mail,
  Plus,
  Settings2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  createPartner,
  createPartnerContact,
  createPartnerGrant,
  deletePartner,
  deletePartnerContact,
  deletePartnerGrant,
  getPartnerSupplierUsage,
  setContactAccessEnabled,
  setPrimaryContact,
  updatePartner,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleRow } from "@/components/toggle-row";
import {
  PartnerScopePicker,
  type GrantScopeOptions,
  type ScopeSelection,
} from "@/components/settings/partner-scope-picker";
import { partnerAccessEnabled, primaryContact } from "@/lib/partners";
import {
  PARTNER_TYPES,
  PARTNER_TYPE_LABEL,
  type PartnerType,
  type ResolvedPartner,
  type VisibilityProfile,
} from "@/types";

/** A contact being drafted in the Add Partner dialog (no id until saved). */
type ContactDraft = {
  fullName: string;
  email: string;
  accessEnabled: boolean;
};

function TypeBadge({ type }: { type: PartnerType }) {
  return (
    <Badge variant="secondary" className="text-[10px]">
      {PARTNER_TYPE_LABEL[type]}
    </Badge>
  );
}

// ---- Add Partner dialog --------------------------------------------------------

function AddPartnerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<PartnerType>("supplier");
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState<ContactDraft[]>([
    { fullName: "", email: "", accessEnabled: false },
  ]);

  function reset() {
    setName("");
    setType("supplier");
    setNotes("");
    setContacts([{ fullName: "", email: "", accessEnabled: false }]);
  }

  function updateContact(i: number, patch: Partial<ContactDraft>) {
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a partner name.");
      return;
    }
    // Only contacts with a name are persisted; blank rows are ignored.
    const namedContacts = contacts.filter((c) => c.fullName.trim());
    startTransition(async () => {
      try {
        const { id } = await createPartner(trimmed, type, notes.trim());
        // First named contact becomes primary (server also enforces this).
        for (let i = 0; i < namedContacts.length; i++) {
          const c = namedContacts[i];
          await createPartnerContact(
            id,
            c.fullName.trim(),
            c.email.trim(),
            i === 0,
            c.accessEnabled,
          );
        }
        toast.success("Partner added.");
        onOpenChange(false);
        reset();
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not add the partner.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add partner</DialogTitle>
          <DialogDescription>
            A partner is a directory record — a supplier, factory, brand client
            or collaborator. Portal access is set up later, per contact.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel htmlFor="partner-name">Name</FieldLabel>
            <Input
              id="partner-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Northbound Textiles"
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Type</FieldLabel>
            <Select value={type} onValueChange={(v) => setType(v as PartnerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PARTNER_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldLabel>Contacts</FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setContacts((prev) => [
                    ...prev,
                    { fullName: "", email: "", accessEnabled: false },
                  ])
                }
              >
                <Plus className="size-3.5" />
                Add contact
              </Button>
            </div>
            {contacts.map((c, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={c.fullName}
                    onChange={(e) => updateContact(i, { fullName: e.target.value })}
                    placeholder="Contact name"
                    maxLength={80}
                  />
                  {contacts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() =>
                        setContacts((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove contact"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
                <Input
                  type="email"
                  value={c.email}
                  onChange={(e) => updateContact(i, { email: e.target.value })}
                  placeholder="Email (optional)"
                />
                <ToggleRow
                  checked={c.accessEnabled}
                  label="Intend to give portal access (set up later)"
                  onToggle={() =>
                    updateContact(i, { accessEnabled: !c.accessEnabled })
                  }
                />
                {i === 0 && contacts.length > 1 && (
                  <p className="text-muted-foreground text-xs">
                    The first contact is the primary contact.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="partner-notes">Notes</FieldLabel>
            <Textarea
              id="partner-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering about this partner…"
              className="min-h-16"
              maxLength={1000}
            />
          </div>
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
            {isPending ? "Adding…" : "Add partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Partner detail dialog (edit + contacts + grants) --------------------------

function EditPartnerFields({
  partner,
}: {
  partner: ResolvedPartner;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(partner.name);
  const [type, setType] = useState<PartnerType>(partner.type);
  const [notes, setNotes] = useState(partner.notes ?? "");

  const dirty =
    name.trim() !== partner.name ||
    type !== partner.type ||
    notes.trim() !== (partner.notes ?? "");

  function onSave() {
    if (!name.trim()) {
      toast.error("Enter a partner name.");
      return;
    }
    startTransition(async () => {
      try {
        await updatePartner(partner.id, name.trim(), type, notes.trim());
        toast.success("Partner saved.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="edit-partner-name" className="text-xs">
            Name
          </FieldLabel>
          <Input
            id="edit-partner-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel className="text-xs">Type</FieldLabel>
          <Select value={type} onValueChange={(v) => setType(v as PartnerType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARTNER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {PARTNER_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="edit-partner-notes" className="text-xs">
          Notes
        </FieldLabel>
        <Textarea
          id="edit-partner-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-14"
          maxLength={1000}
        />
      </div>
      {dirty && (
        <Button size="sm" onClick={onSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      )}
    </div>
  );
}

function ContactsSection({ partner }: { partner: ResolvedPartner }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  function run(fn: () => Promise<unknown>, failMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : failMsg);
      }
    });
  }

  function onAdd() {
    if (!newName.trim()) {
      toast.error("Enter a contact name.");
      return;
    }
    run(async () => {
      await createPartnerContact(
        partner.id,
        newName.trim(),
        newEmail.trim(),
        false,
        false,
      );
      setNewName("");
      setNewEmail("");
      setAdding(false);
      toast.success("Contact added.");
    }, "Could not add the contact.");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Contacts</span>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            disabled={isPending}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        )}
      </div>

      {partner.contacts.length === 0 && !adding && (
        <p className="text-muted-foreground text-xs">No contacts yet.</p>
      )}

      <ul className="space-y-1.5">
        {partner.contacts.map((c) => (
          <li
            key={c.id}
            className="bg-muted/40 flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{c.full_name}</span>
                {c.is_primary && (
                  <Badge variant="secondary" className="text-[10px]">
                    <Star className="size-2.5" />
                    Primary
                  </Badge>
                )}
                {c.access_enabled && (
                  <Badge
                    variant="outline"
                    className="border-brand/40 text-[10px]"
                  >
                    <KeyRound className="size-2.5" />
                    Access intended
                  </Badge>
                )}
              </div>
              {c.email && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Mail className="size-3" />
                  {c.email}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  run(
                    () => setContactAccessEnabled(c.id, !c.access_enabled),
                    "Could not update access.",
                  )
                }
                disabled={isPending}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                title="Toggle intended portal access (acted on in a later phase)"
              >
                {c.access_enabled ? "Disable access" : "Enable access"}
              </button>
              {!c.is_primary && (
                <button
                  type="button"
                  onClick={() =>
                    run(() => setPrimaryContact(c.id), "Could not set primary.")
                  }
                  disabled={isPending}
                  aria-label={`Make ${c.full_name} the primary contact`}
                  className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded"
                  title="Make primary"
                >
                  <Star className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  run(
                    () => deletePartnerContact(c.id),
                    "Could not remove the contact.",
                  )
                }
                disabled={isPending}
                aria-label={`Remove ${c.full_name}`}
                className="text-muted-foreground hover:text-destructive flex size-6 items-center justify-center rounded"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="space-y-2 rounded-md border p-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Contact name"
            maxLength={80}
          />
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email (optional)"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={onAdd} disabled={isPending}>
              Add contact
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewEmail("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function GrantsSection({
  partner,
  profiles,
  scopeOptions,
}: {
  partner: ResolvedPartner;
  profiles: VisibilityProfile[];
  scopeOptions: GrantScopeOptions;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scope, setScope] = useState<ScopeSelection | null>(null);
  const defaultProfileId =
    profiles.find((p) => p.is_default)?.id ?? profiles[0]?.id ?? "";
  const [profileId, setProfileId] = useState(defaultProfileId);

  function onAddGrant() {
    if (!scope) {
      toast.error("Pick a scope to grant.");
      return;
    }
    if (!profileId) {
      toast.error("Pick a visibility profile.");
      return;
    }
    startTransition(async () => {
      try {
        await createPartnerGrant(
          partner.id,
          scope.subjectType,
          scope.subjectId,
          profileId,
        );
        toast.success("Access granted.");
        setScope(null);
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not grant access.",
        );
      }
    });
  }

  function onRevoke(grantId: string) {
    startTransition(async () => {
      try {
        await deletePartnerGrant(grantId);
        toast.success("Access revoked.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not revoke.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-sm font-medium">Access grants</span>
        <p className="text-muted-foreground text-xs">
          Pair a scope with a visibility profile. Setup only until the partner
          portal ships.
        </p>
      </div>

      {partner.grants.length > 0 && (
        <ul className="space-y-1.5">
          {partner.grants.map((g) => (
            <li
              key={g.id}
              className="bg-muted/40 flex items-center gap-2 rounded-md px-3 py-2 text-sm"
            >
              <Badge variant="outline" className="text-[10px] capitalize">
                {g.subject_type}
              </Badge>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{g.subjectName}</span>
                <span className="text-muted-foreground"> · {g.profileName}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onRevoke(g.id)}
                disabled={isPending}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      {profiles.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-3 text-xs">
          Create a visibility profile first (in the Visibility Profiles section)
          to grant access.
        </p>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          <div className="space-y-1.5">
            <FieldLabel className="text-xs">Scope</FieldLabel>
            <PartnerScopePicker
              options={scopeOptions}
              value={scope}
              onChange={setScope}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel className="text-xs">Visibility profile</FieldLabel>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a profile…" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={onAddGrant} disabled={isPending}>
            <Plus className="size-3.5" />
            Add grant
          </Button>
        </div>
      )}
    </div>
  );
}

function PartnerDetailDialog({
  partner,
  profiles,
  scopeOptions,
  open,
  onOpenChange,
}: {
  partner: ResolvedPartner;
  profiles: VisibilityProfile[];
  scopeOptions: GrantScopeOptions;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-5 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {partner.name}
            <TypeBadge type={partner.type} />
          </DialogTitle>
          <DialogDescription>
            Manage this partner&rsquo;s details, contacts and access grants.
          </DialogDescription>
        </DialogHeader>
        <EditPartnerFields partner={partner} />
        <div className="border-t" />
        <ContactsSection partner={partner} />
        <div className="border-t" />
        <GrantsSection
          partner={partner}
          profiles={profiles}
          scopeOptions={scopeOptions}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---- Delete partner (with supplier-usage warning) ------------------------------

function DeletePartnerDialog({
  partner,
  open,
  onOpenChange,
}: {
  partner: ResolvedPartner;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The usage result is tagged with the partner it was loaded for, so "still
  // loading" is derived (result for a different/no partner) rather than reset
  // with a synchronous setState inside the effect.
  const [usage, setUsage] = useState<{
    partnerId: string;
    productCount: number;
  } | null>(null);

  // Lazy-load the supplier-usage count when the dialog opens (an effect, not
  // render — it's a side effect). `ignore` guards against a late response
  // landing after the dialog reopened for a different partner.
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    getPartnerSupplierUsage(partner.id)
      .then((u) => {
        if (!ignore) setUsage({ partnerId: partner.id, productCount: u.productCount });
      })
      .catch(() => {
        if (!ignore) setUsage({ partnerId: partner.id, productCount: 0 });
      });
    return () => {
      ignore = true;
    };
  }, [open, partner.id]);

  // Only trust the count if it's this partner's (a stale result from a
  // previous open reads as "still loading").
  const currentUsage = usage?.partnerId === partner.id ? usage : null;

  function onDelete() {
    startTransition(async () => {
      try {
        await deletePartner(partner.id);
        toast.success("Partner deleted.");
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not delete.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{partner.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {currentUsage === null
              ? "Checking where this partner is used…"
              : currentUsage.productCount > 0
                ? `This partner is set as a supplier on ${currentUsage.productCount} product${
                    currentUsage.productCount === 1 ? "" : "s"
                  }. Those pins keep the supplier name but lose the directory link. Its contacts and grants are also removed. This can't be undone.`
                : "Its contacts and access grants will be removed too. This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting…" : "Delete partner"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Partner row + list --------------------------------------------------------

function PartnerRow({
  partner,
  profiles,
  scopeOptions,
}: {
  partner: ResolvedPartner;
  profiles: VisibilityProfile[];
  scopeOptions: GrantScopeOptions;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const primary = primaryContact(partner);
  const hasAccess = partnerAccessEnabled(partner);
  const grantCount = partner.grants.length;

  return (
    <li className="bg-card flex items-center gap-3 rounded-lg border px-4 py-3">
      <Building2 className="text-muted-foreground size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{partner.name}</span>
          <TypeBadge type={partner.type} />
          {hasAccess && (
            <Badge variant="outline" className="border-brand/40 text-[10px]">
              <KeyRound className="size-2.5" />
              Access
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {primary ? primary.full_name : "No contact"}
          {primary?.email ? ` · ${primary.email}` : ""}
          {" · "}
          {grantCount} grant{grantCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => setDetailOpen(true)}>
          <Settings2 className="size-3.5" />
          Manage
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label={`Delete ${partner.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <PartnerDetailDialog
        partner={partner}
        profiles={profiles}
        scopeOptions={scopeOptions}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <DeletePartnerDialog
        partner={partner}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </li>
  );
}

export function PartnersManager({
  partners,
  profiles,
  scopeOptions,
}: {
  partners: ResolvedPartner[];
  profiles: VisibilityProfile[];
  scopeOptions: GrantScopeOptions;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-prose text-sm">
          Suppliers, factories, brand clients and collaborators — the directory
          used across the app (supplier pickers) and the records you&rsquo;ll
          grant scoped access to when the portal ships.
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />
          Add Partner
        </Button>
      </div>

      {partners.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          No partners yet. Add your first supplier or factory to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {partners.map((p) => (
            <PartnerRow
              key={p.id}
              partner={p}
              profiles={profiles}
              scopeOptions={scopeOptions}
            />
          ))}
        </ul>
      )}

      <AddPartnerDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
