"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  PROFILE_NAME_MAX,
  cloneProfileName,
} from "@/lib/visibility-profiles";
import { requireActionContext } from "@/lib/supabase/action-context";
import type { Json } from "@/types/database.types";
import type { PartnerGrantSubject, PartnerType } from "@/types";
import {
  VISIBILITY_GROUPS,
  VISIBILITY_SECTION_KEYS,
  type VisibilityFieldGroups,
} from "@/types/visibility";

/**
 * Server actions for the P1 partner foundation: Partner CRUD, contact CRUD,
 * Visibility Profile CRUD (+ clone), and grant CRUD — the same grain as
 * settings/actions.ts (zod parse → requireActionContext → workspace-scoped
 * mutation → revalidate). No partner-facing behaviour lives here: everything
 * below is the GarSpec user setting things up; the portal that acts on it is
 * P2–P4.
 */

const PARTNER_TYPES = [
  "supplier",
  "factory",
  "brand_client",
  "collaborator",
] as const satisfies readonly PartnerType[];

const GRANT_SUBJECTS = [
  "brand",
  "collection",
  "product",
] as const satisfies readonly PartnerGrantSubject[];

const partnerSchema = z.object({
  name: z.string().trim().min(1, "Enter a partner name.").max(80),
  type: z.enum(PARTNER_TYPES),
  notes: z.string().trim().max(1000).optional().default(""),
});

const contactSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a contact name.").max(80),
  email: z.union([z.email("Enter a valid email."), z.literal("")]).default(""),
  isPrimary: z.boolean().default(false),
  accessEnabled: z.boolean().default(false),
});

// The field_groups map, STRICT against the canonical VISIBILITY_GROUPS
// constant: every section and every group must be present and boolean, no
// extras — so a stored profile can never drift from the contract the P2
// resolver will read. Built dynamically so a group added to the constant is
// enforced here without edits.
const fieldGroupsSchema = z.strictObject(
  Object.fromEntries(
    VISIBILITY_SECTION_KEYS.map((section) => [
      section,
      z.strictObject(
        Object.fromEntries(
          VISIBILITY_GROUPS[section].map((group) => [group, z.boolean()]),
        ),
      ),
    ]),
  ),
) as unknown as z.ZodType<VisibilityFieldGroups>;

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter a profile name.").max(PROFILE_NAME_MAX),
  fieldGroups: fieldGroupsSchema,
});

// ---- Partner CRUD --------------------------------------------------------------

export async function createPartner(
  name: string,
  type: PartnerType,
  notes: string,
) {
  const parsed = partnerSchema.parse({ name, type, notes });
  const { supabase, workspaceId } = await requireActionContext();
  const { data, error } = await supabase
    .from("partners")
    .insert({
      workspace_id: workspaceId,
      name: parsed.name,
      type: parsed.type,
      notes: parsed.notes || null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not create partner.");

  // Partners feed the product pages' supplier picker too, not just Settings.
  revalidatePath("/", "layout");
  return { id: data.id };
}

export async function updatePartner(
  id: string,
  name: string,
  type: PartnerType,
  notes: string,
) {
  const cleanId = z.uuid().parse(id);
  const parsed = partnerSchema.parse({ name, type, notes });
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("partners")
    .update({
      name: parsed.name,
      type: parsed.type,
      notes: parsed.notes || null,
    })
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}

/**
 * How widely a partner is referenced as a SUPPLIER on fabric/trim pins —
 * feeds the delete dialog's soft warning ("still used on N products").
 * Deleting is deliberately NOT blocked: the pins keep their denormalised
 * `supplier_partner_name` for display, only the directory link goes dangling
 * (decided: soft warning over hard block — a stale name on a pin is
 * recoverable; a partner you can't remove is a support ticket).
 */
export async function getPartnerSupplierUsage(partnerId: string) {
  const cleanId = z.uuid().parse(partnerId);
  const { supabase, workspaceId } = await requireActionContext();

  // Three small index-backed hops instead of a nested embed — the hand-written
  // database types carry no Relationships, so embeds would need casts.
  const { data: pins } = await supabase
    .from("canvas_annotations")
    .select("slot_id")
    .eq("workspace_id", workspaceId)
    .eq("data->>supplier_partner_id", cleanId);
  const slotIds = [...new Set((pins ?? []).map((p) => p.slot_id))];
  if (slotIds.length === 0) return { pinCount: 0, productCount: 0 };

  const { data: slots } = await supabase
    .from("canvas_slots")
    .select("id, page_id")
    .in("id", slotIds);
  const pageIds = [...new Set((slots ?? []).map((s) => s.page_id))];

  const { data: pages } = await supabase
    .from("canvas_pages")
    .select("id, product_id")
    .in("id", pageIds);
  const productCount = new Set((pages ?? []).map((p) => p.product_id)).size;

  return { pinCount: (pins ?? []).length, productCount };
}

export async function deletePartner(id: string) {
  const cleanId = z.uuid().parse(id);
  const { supabase, workspaceId } = await requireActionContext();
  // Contacts and grants cascade-delete via their FKs.
  const { error } = await supabase
    .from("partners")
    .delete()
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}

// ---- Partner contacts ------------------------------------------------------------

/** Confirms the partner lives in the caller's workspace. */
async function assertPartnerOwnership(
  supabase: Awaited<ReturnType<typeof requireActionContext>>["supabase"],
  workspaceId: string,
  partnerId: string,
) {
  const { data } = await supabase
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!data) throw new Error("Partner not found in your workspace.");
}

export async function createPartnerContact(
  partnerId: string,
  fullName: string,
  email: string,
  isPrimary: boolean,
  accessEnabled: boolean,
) {
  const cleanPartnerId = z.uuid().parse(partnerId);
  const parsed = contactSchema.parse({
    fullName,
    email,
    isPrimary,
    accessEnabled,
  });
  const { supabase, workspaceId } = await requireActionContext();
  await assertPartnerOwnership(supabase, workspaceId, cleanPartnerId);

  // A partner's FIRST contact is always primary; otherwise an explicit
  // primary displaces the current one (partial unique index enforces at most
  // one, so clear before set).
  const { count } = await supabase
    .from("partner_contacts")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", cleanPartnerId);
  const makePrimary = parsed.isPrimary || (count ?? 0) === 0;
  if (makePrimary && (count ?? 0) > 0) {
    await clearPrimaryContact(supabase, workspaceId, cleanPartnerId);
  }

  const { data, error } = await supabase
    .from("partner_contacts")
    .insert({
      partner_id: cleanPartnerId,
      workspace_id: workspaceId,
      full_name: parsed.fullName,
      email: parsed.email || null,
      is_primary: makePrimary,
      access_enabled: parsed.accessEnabled,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not add the contact.");

  revalidatePath("/settings");
  return { id: data.id };
}

async function clearPrimaryContact(
  supabase: Awaited<ReturnType<typeof requireActionContext>>["supabase"],
  workspaceId: string,
  partnerId: string,
) {
  const { error } = await supabase
    .from("partner_contacts")
    .update({ is_primary: false })
    .eq("partner_id", partnerId)
    .eq("workspace_id", workspaceId)
    .eq("is_primary", true);
  if (error) throw new Error(error.message);
}

export async function updatePartnerContact(
  id: string,
  fullName: string,
  email: string,
  accessEnabled: boolean,
) {
  const cleanId = z.uuid().parse(id);
  const parsed = contactSchema.parse({
    fullName,
    email,
    accessEnabled,
    isPrimary: false, // primary changes go through setPrimaryContact
  });
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("partner_contacts")
    .update({
      full_name: parsed.fullName,
      email: parsed.email || null,
      access_enabled: parsed.accessEnabled,
    })
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

/**
 * Toggle a contact's `access_enabled` flag. P1 only STORES this intent —
 * nothing authenticates against it until P2 wires the portal login.
 */
export async function setContactAccessEnabled(id: string, enabled: boolean) {
  const cleanId = z.uuid().parse(id);
  const clean = z.boolean().parse(enabled);
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("partner_contacts")
    .update({ access_enabled: clean })
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function setPrimaryContact(id: string) {
  const cleanId = z.uuid().parse(id);
  const { supabase, workspaceId } = await requireActionContext();

  const { data: contact } = await supabase
    .from("partner_contacts")
    .select("id, partner_id")
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!contact) throw new Error("Contact not found in your workspace.");

  await clearPrimaryContact(supabase, workspaceId, contact.partner_id);
  const { error } = await supabase
    .from("partner_contacts")
    .update({ is_primary: true })
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function deletePartnerContact(id: string) {
  const cleanId = z.uuid().parse(id);
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("partner_contacts")
    .delete()
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

// ---- Visibility Profiles ----------------------------------------------------------

export async function createVisibilityProfile(
  name: string,
  fieldGroups: VisibilityFieldGroups,
) {
  const parsed = profileSchema.parse({ name, fieldGroups });
  const { supabase, workspaceId } = await requireActionContext();
  const { data, error } = await supabase
    .from("visibility_profiles")
    .insert({
      workspace_id: workspaceId,
      name: parsed.name,
      field_groups: parsed.fieldGroups as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not create the profile.");

  revalidatePath("/settings");
  return { id: data.id };
}

export async function updateVisibilityProfile(
  id: string,
  name: string,
  fieldGroups: VisibilityFieldGroups,
) {
  const cleanId = z.uuid().parse(id);
  const parsed = profileSchema.parse({ name, fieldGroups });
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("visibility_profiles")
    .update({
      name: parsed.name,
      field_groups: parsed.fieldGroups as unknown as Json,
    })
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

/**
 * Duplicate a profile as "{name} (copy)" for quick reuse — the intended way
 * to tweak a starting point (e.g. the seeded Factory Merchandiser) without
 * touching the grants already pinned to the original.
 */
export async function cloneVisibilityProfile(id: string) {
  const cleanId = z.uuid().parse(id);
  const { supabase, workspaceId } = await requireActionContext();

  const { data: source } = await supabase
    .from("visibility_profiles")
    .select("name, field_groups")
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!source) throw new Error("Profile not found in your workspace.");

  const { data, error } = await supabase
    .from("visibility_profiles")
    .insert({
      workspace_id: workspaceId,
      name: cloneProfileName(source.name),
      field_groups: source.field_groups,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not clone the profile.");

  revalidatePath("/settings");
  return { id: data.id };
}

export async function deleteVisibilityProfile(id: string) {
  const cleanId = z.uuid().parse(id);
  const { supabase, workspaceId } = await requireActionContext();

  // Friendly pre-check; the RESTRICT FK on partner_grants is the backstop.
  const { count } = await supabase
    .from("partner_grants")
    .select("id", { count: "exact", head: true })
    .eq("visibility_profile_id", cleanId)
    .eq("workspace_id", workspaceId);
  if ((count ?? 0) > 0) {
    throw new Error(
      `This profile is used by ${count} grant${count === 1 ? "" : "s"}. Reassign or revoke them first.`,
    );
  }

  const { error } = await supabase
    .from("visibility_profiles")
    .delete()
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

// ---- Grants ------------------------------------------------------------------------

const grantSchema = z.object({
  partnerId: z.uuid(),
  subjectType: z.enum(GRANT_SUBJECTS),
  subjectId: z.uuid(),
  profileId: z.uuid(),
});

/**
 * `subject_id` is polymorphic (brand/collection/product), so the FK-less
 * column is verified here against the right table, workspace-scoped — the
 * one ownership check RLS can't express generically.
 */
async function assertSubjectOwnership(
  supabase: Awaited<ReturnType<typeof requireActionContext>>["supabase"],
  workspaceId: string,
  subjectType: PartnerGrantSubject,
  subjectId: string,
) {
  const table =
    subjectType === "brand"
      ? ("brands" as const)
      : subjectType === "collection"
        ? ("collections" as const)
        : ("products" as const);
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("id", subjectId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!data) throw new Error("That record isn't in your workspace.");
}

export async function createPartnerGrant(
  partnerId: string,
  subjectType: PartnerGrantSubject,
  subjectId: string,
  profileId: string,
) {
  const parsed = grantSchema.parse({
    partnerId,
    subjectType,
    subjectId,
    profileId,
  });
  const { supabase, workspaceId } = await requireActionContext();
  await assertPartnerOwnership(supabase, workspaceId, parsed.partnerId);
  await assertSubjectOwnership(
    supabase,
    workspaceId,
    parsed.subjectType,
    parsed.subjectId,
  );

  const { data, error } = await supabase
    .from("partner_grants")
    .insert({
      workspace_id: workspaceId,
      partner_id: parsed.partnerId,
      subject_type: parsed.subjectType,
      subject_id: parsed.subjectId,
      visibility_profile_id: parsed.profileId,
    })
    .select("id")
    .single();
  if (error) {
    // UNIQUE(partner_id, subject_type, subject_id)
    if (error.code === "23505") {
      throw new Error(
        "This partner already has a grant for that scope — edit its profile instead.",
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/settings");
  return { id: data.id };
}

/** Edit = swap the grant's visibility profile (scope changes are revoke + re-grant). */
export async function updatePartnerGrant(id: string, profileId: string) {
  const cleanId = z.uuid().parse(id);
  const cleanProfileId = z.uuid().parse(profileId);
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("partner_grants")
    .update({ visibility_profile_id: cleanProfileId })
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function deletePartnerGrant(id: string) {
  const cleanId = z.uuid().parse(id);
  const { supabase, workspaceId } = await requireActionContext();
  const { error } = await supabase
    .from("partner_grants")
    .delete()
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}
