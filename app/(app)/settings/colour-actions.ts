"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActionContext } from "@/lib/supabase/action-context";
import { WORKSPACE_COLOUR_HEX, normaliseHex } from "@/lib/workspace-colours";
import type { WorkspaceColour } from "@/types";

/**
 * Workspace colour library CRUD. Kept separate from the main settings actions
 * file the way the product route splits canvas/spec actions — the library is
 * written from two surfaces (the Settings tab and the canvas pin editors'
 * "Save to library"), so it earns its own module.
 *
 * The library feeds pins, it never owns them: nothing here touches
 * canvas_annotations, and deleting a colour must never affect pins that were
 * filled from it (they carry their own copied name/hex/pantone).
 */

const colourSchema = z.object({
  name: z.string().trim().min(1, "Enter a colour name.").max(60),
  hex: z.string().regex(WORKSPACE_COLOUR_HEX, "Enter a valid hex colour."),
  pantone: z.string().trim().max(40).nullable(),
});

export async function createWorkspaceColour(
  name: string,
  hex: string,
  pantone: string | null,
): Promise<WorkspaceColour> {
  const clean = colourSchema.parse({
    name,
    // Forgive a missing "#" / lowercase; if unfixable, let the schema report.
    hex: normaliseHex(hex) ?? hex,
    pantone,
  });
  const { supabase, workspaceId } = await requireActionContext();

  // Append to the end of the swatch grid.
  const { data: last } = await supabase
    .from("workspace_colours")
    .select("sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("workspace_colours")
    .insert({
      workspace_id: workspaceId,
      name: clean.name,
      hex: clean.hex,
      pantone: clean.pantone || null,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Could not save the colour.");
  }

  revalidatePath("/settings");
  return data;
}

export async function updateWorkspaceColour(
  id: string,
  name: string,
  hex: string,
  pantone: string | null,
): Promise<void> {
  const clean = colourSchema
    .extend({ id: z.uuid() })
    .parse({ id, name, hex: normaliseHex(hex) ?? hex, pantone });
  const { supabase, workspaceId } = await requireActionContext();

  const { error } = await supabase
    .from("workspace_colours")
    .update({
      name: clean.name,
      hex: clean.hex,
      pantone: clean.pantone || null,
    })
    .eq("id", clean.id)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function deleteWorkspaceColour(id: string): Promise<void> {
  const cleanId = z.uuid().parse(id);
  const { supabase, workspaceId } = await requireActionContext();

  // Pins filled from this colour keep their copied name/hex/pantone — the
  // library never owns pin data, so deleting here is always safe.
  const { error } = await supabase
    .from("workspace_colours")
    .delete()
    .eq("id", cleanId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

const reorderSchema = z.array(z.uuid()).min(1).max(500);

/**
 * Persist a new swatch order. Each colour's sort_order becomes its index in
 * `orderedIds`; updates are scoped to the workspace so a foreign id in the
 * array silently affects nothing.
 */
export async function reorderWorkspaceColours(
  orderedIds: string[],
): Promise<void> {
  const ids = reorderSchema.parse(orderedIds);
  const { supabase, workspaceId } = await requireActionContext();

  const results = await Promise.all(
    ids.map((colourId, index) =>
      supabase
        .from("workspace_colours")
        .update({ sort_order: index })
        .eq("id", colourId)
        .eq("workspace_id", workspaceId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  revalidatePath("/settings");
}
