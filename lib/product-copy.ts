/**
 * Deep-copy engine for product templates — the ONE routine that copies a
 * product's full content tree, serving both directions of the feature:
 * saving an existing product AS a template (section-masked) and creating a
 * product FROM a template (always a full copy).
 *
 * Scope of a full copy:
 *   - product columns (category/gender/size_range + the identity fields;
 *     NEVER name, style number, share_token, version, status, archived_at)
 *   - product_sections rows (data jsonb, enabled state, sort order;
 *     completion always reset — the caller recomputes from actual content)
 *   - canvas pages, slots (framing, lock dims, fit mode, names, notes),
 *     annotations (all layers, offsets, pin types), colourways (sequence
 *     numbers preserved so C-codes stay stable)
 *   - product_assets rows AND their Storage binaries — every object is
 *     copied to the new owner's `{workspace}/{product}/...` path so the two
 *     products never share a file (deleting one can never break the other);
 *     hero_asset_id and slot asset_id references are remapped
 *   - spec sheets with rows and values (mode, profile, size runs, sample
 *     sizes preserved)
 *
 * The engine deliberately does NOT log to the change log or recompute
 * section statuses — the calling server action owns those, matching the
 * existing action pattern.
 *
 * A missing/failed Storage binary skips that asset (and nulls any slot that
 * referenced it) rather than failing the whole copy — one broken image must
 * not make a fully-built product uncloneable. Skips are reported in
 * `warnings`.
 */

import type { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type ProductRow = Database["public"]["Tables"]["products"]["Row"];

/**
 * The clone dialog's three choices (decision: BOM has no data of its own —
 * it derives live from Fabrics & Trim pins, so it rides with the drawings).
 */
export type CopySectionMask = {
  /** Identity fields: product columns + the identity section's jsonb. */
  productSetup: boolean;
  /** Assets + canvas pages + annotations + colourways (BOM follows). */
  technicalDrawings: boolean;
  /** Spec sheets with rows and values. */
  sizeSpecifications: boolean;
};

export const FULL_SECTION_MASK: CopySectionMask = {
  productSetup: true,
  technicalDrawings: true,
  sizeSpecifications: true,
};

/**
 * The product columns owned by the Product Setup mask choice. brand_id /
 * collection_id / hero_asset_id are handled separately (placement and asset
 * remapping respectively), and the never-copied columns (name, style_number,
 * share_token, version, status, archived_at) are simply not listed.
 */
export const IDENTITY_PRODUCT_COLUMNS = [
  "category",
  "gender",
  "size_range",
  "season_id",
  "designer_name",
  "designer_email",
  "factory_name",
  "factory_country",
  "sample_due_date",
  "delivery_date",
  "wholesale_price",
  "retail_price",
] as const;

type IdentityColumn = (typeof IDENTITY_PRODUCT_COLUMNS)[number];

export type IdentityColumnSource = Pick<ProductRow, IdentityColumn>;

/**
 * The identity-owned column values for the copy: the source's values when
 * Product Setup is kept, defaults (null) when it isn't. Pure — unit-tested.
 */
export function maskedIdentityColumns(
  source: IdentityColumnSource,
  keepProductSetup: boolean,
): Pick<ProductRow, IdentityColumn> {
  const out: Record<string, unknown> = {};
  for (const column of IDENTITY_PRODUCT_COLUMNS) {
    out[column] = keepProductSetup ? (source[column] ?? null) : null;
  }
  return out as Pick<ProductRow, IdentityColumn>;
}

/**
 * Where a copied Storage object lives: same basename (already unique via its
 * upload-time timestamp prefix), under the destination product's folder. The
 * `{workspace}/{product}/...` convention is what the Storage RLS policies
 * key on (first path segment = caller's workspace). Pure — unit-tested.
 */
export function copiedStoragePath(
  sourcePath: string,
  workspaceId: string,
  targetProductId: string,
): string {
  const basename = sourcePath.split("/").pop() ?? sourcePath;
  return `${workspaceId}/${targetProductId}/${basename}`;
}

/**
 * 1 year in seconds — mirrors SIGNED_URL_TTL in components/canvas/
 * asset-upload.ts (a "use client" module this server-side engine must not
 * import). Copied assets get a fresh signed URL for the copied object.
 */
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

/** PostgREST is happy with large inserts; chunking keeps payloads sane. */
const INSERT_CHUNK = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type CopyProductArgs = {
  workspaceId: string;
  userId: string | null;
  sourceProductId: string;
  /** The copy's name (style number is never copied). */
  targetName: string;
  /** true → the copy is a template; false → a live product. */
  isTemplate: boolean;
  /**
   * Placement of the copy. Templates keep the source's brand (display
   * scoping) and carry no collection; create-from-template passes the
   * user's chosen collection and its brand.
   */
  brandId: string | null;
  collectionId: string | null;
  mask: CopySectionMask;
};

export type CopyProductResult = {
  id: string;
  /** Non-fatal skips (e.g. a source image whose binary no longer exists). */
  warnings: string[];
};

export async function copyProductDeep(
  supabase: ServerClient,
  args: CopyProductArgs,
): Promise<CopyProductResult> {
  const { workspaceId, userId, sourceProductId, mask } = args;
  const warnings: string[] = [];

  const { data: src, error: srcError } = await supabase
    .from("products")
    .select("*")
    .eq("id", sourceProductId)
    .eq("workspace_id", workspaceId)
    .single();
  if (srcError || !src) throw new Error("Source product not found.");

  // ---- the product row -------------------------------------------------------
  const { data: created, error: createError } = await supabase
    .from("products")
    .insert({
      workspace_id: workspaceId,
      name: args.targetName,
      style_number: null,
      status: "draft",
      is_template: args.isTemplate,
      brand_id: args.brandId,
      collection_id: args.collectionId,
      ...maskedIdentityColumns(src, mask.productSetup),
    })
    .select("id")
    .single();
  if (createError || !created) {
    throw new Error(createError?.message ?? "Could not create the copy.");
  }
  const targetId = created.id;

  // ---- sections --------------------------------------------------------------
  // Rows are always created (every product carries the standard section set);
  // only the identity jsonb is mask-gated. Completion is never copied — the
  // caller recomputes it from the copy's actual content, so it stays honest
  // for whatever the mask included.
  // Every source read throws on error rather than treating a failed query as
  // "no rows" — a transient read failure must abort the copy, not silently
  // produce a product missing half its content.
  const { data: srcSections, error: sectionsError } = await supabase
    .from("product_sections")
    .select("*")
    .eq("product_id", sourceProductId);
  if (sectionsError) throw new Error(sectionsError.message);

  if (srcSections && srcSections.length > 0) {
    const rows = srcSections.map((s) => ({
      product_id: targetId,
      section_key: s.section_key,
      status: "not_started" as const,
      completed_manually: false,
      sort_order: s.sort_order,
      is_enabled: s.is_enabled,
      data:
        s.section_key === "identity" && !mask.productSetup
          ? ({} as Json)
          : s.data,
    }));
    const { error } = await supabase.from("product_sections").insert(rows);
    if (error) throw new Error(error.message);
  }

  // ---- technical drawings: assets + colourways + pages/slots/annotations ------
  if (mask.technicalDrawings) {
    // Assets first — slots and the hero reference them. Each binary is copied
    // to the new product's own folder; a failed copy skips the asset row.
    const { data: srcAssets, error: assetsError } = await supabase
      .from("product_assets")
      .select("*")
      .eq("product_id", sourceProductId)
      .order("created_at", { ascending: true });
    if (assetsError) throw new Error(assetsError.message);

    const assetIdMap = new Map<string, string>();
    for (const asset of srcAssets ?? []) {
      const newPath = copiedStoragePath(asset.file_path, workspaceId, targetId);
      const { error: copyError } = await supabase.storage
        .from("product-assets")
        .copy(asset.file_path, newPath);
      if (copyError) {
        warnings.push(`Image '${asset.name}' could not be copied — skipped.`);
        continue;
      }
      const { data: signed, error: signError } = await supabase.storage
        .from("product-assets")
        .createSignedUrl(newPath, SIGNED_URL_TTL);
      if (signError || !signed) {
        warnings.push(`Image '${asset.name}' could not be re-signed — skipped.`);
        continue;
      }
      const { data: newAsset, error: rowError } = await supabase
        .from("product_assets")
        .insert({
          product_id: targetId,
          workspace_id: workspaceId,
          name: asset.name,
          file_path: newPath,
          file_url: signed.signedUrl,
          width: asset.width,
          height: asset.height,
          created_by: userId,
        })
        .select("id")
        .single();
      if (rowError || !newAsset) {
        warnings.push(`Image '${asset.name}' row could not be created — skipped.`);
        continue;
      }
      assetIdMap.set(asset.id, newAsset.id);
    }

    // Hero — remapped onto the copied asset (dropped if that asset skipped).
    if (src.hero_asset_id) {
      const newHero = assetIdMap.get(src.hero_asset_id) ?? null;
      if (newHero) {
        await supabase
          .from("products")
          .update({ hero_asset_id: newHero })
          .eq("id", targetId)
          .eq("workspace_id", workspaceId);
      }
    }

    // Colourways — sequence numbers preserved verbatim so every existing
    // C{seq}.{n} reference code stays truthful on the copy.
    const { data: srcColourways, error: colourwaysError } = await supabase
      .from("canvas_colourways")
      .select("*")
      .eq("product_id", sourceProductId)
      .order("sequence_number", { ascending: true });
    if (colourwaysError) throw new Error(colourwaysError.message);

    const colourwayIdMap = new Map<string, string>();
    if (srcColourways && srcColourways.length > 0) {
      const { data: newColourways, error } = await supabase
        .from("canvas_colourways")
        .insert(
          srcColourways.map((c) => ({
            product_id: targetId,
            workspace_id: workspaceId,
            name: c.name,
            sequence_number: c.sequence_number,
          })),
        )
        .select("id, sequence_number");
      if (error) throw new Error(error.message);
      const bySequence = new Map(
        (newColourways ?? []).map((c) => [c.sequence_number, c.id]),
      );
      for (const c of srcColourways) {
        const newId = bySequence.get(c.sequence_number);
        if (newId) colourwayIdMap.set(c.id, newId);
      }
    }

    // Pages → slots → annotations. Pages one-by-one (small counts, and the
    // id mapping stays trivial); slots bulk per page mapped back by their
    // unique slot_index; annotations bulk, no returned ids needed.
    const { data: srcPages, error: pagesError } = await supabase
      .from("canvas_pages")
      .select("*")
      .eq("product_id", sourceProductId)
      .order("sort_order", { ascending: true });
    if (pagesError) throw new Error(pagesError.message);

    const slotIdMap = new Map<string, string>();
    for (const page of srcPages ?? []) {
      const { data: newPage, error: pageError } = await supabase
        .from("canvas_pages")
        .insert({
          product_id: targetId,
          workspace_id: workspaceId,
          template: page.template,
          label: page.label,
          notes: page.notes,
          sort_order: page.sort_order,
        })
        .select("id")
        .single();
      if (pageError || !newPage) {
        throw new Error(pageError?.message ?? "Could not copy a canvas page.");
      }

      const { data: srcSlots, error: slotsError } = await supabase
        .from("canvas_slots")
        .select("*")
        .eq("page_id", page.id)
        .order("slot_index", { ascending: true });
      if (slotsError) throw new Error(slotsError.message);
      if (!srcSlots || srcSlots.length === 0) continue;

      const { data: newSlots, error: slotError } = await supabase
        .from("canvas_slots")
        .insert(
          srcSlots.map((slot) => ({
            page_id: newPage.id,
            slot_index: slot.slot_index,
            asset_id: slot.asset_id
              ? (assetIdMap.get(slot.asset_id) ?? null)
              : null,
            crop_x: slot.crop_x,
            crop_y: slot.crop_y,
            zoom: slot.zoom,
            fit_mode: slot.fit_mode,
            is_locked: slot.is_locked,
            lock_width: slot.lock_width,
            lock_height: slot.lock_height,
            name: slot.name,
          })),
        )
        .select("id, slot_index");
      if (slotError) throw new Error(slotError.message);

      const byIndex = new Map((newSlots ?? []).map((s) => [s.slot_index, s.id]));
      for (const slot of srcSlots) {
        const newId = byIndex.get(slot.slot_index);
        if (newId) slotIdMap.set(slot.id, newId);
      }
    }

    if (slotIdMap.size > 0) {
      const { data: srcAnnotations, error: annotationsError } = await supabase
        .from("canvas_annotations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("slot_id", [...slotIdMap.keys()]);
      if (annotationsError) throw new Error(annotationsError.message);

      const annotationRows = (srcAnnotations ?? []).flatMap((a) => {
        const newSlotId = slotIdMap.get(a.slot_id);
        if (!newSlotId) return [];
        return [
          {
            slot_id: newSlotId,
            workspace_id: workspaceId,
            layer_type: a.layer_type,
            reference_code: a.reference_code,
            x: a.x,
            y: a.y,
            pin_type: a.pin_type,
            end_x: a.end_x,
            end_y: a.end_y,
            label_offset_x: a.label_offset_x,
            label_offset_y: a.label_offset_y,
            colourway_id: a.colourway_id
              ? (colourwayIdMap.get(a.colourway_id) ?? null)
              : null,
            data: a.data,
            created_by: userId,
          },
        ];
      });
      // The colourway↔layer CHECK constraint means a colourway pin whose
      // group failed to map cannot be inserted — drop it with a warning
      // rather than failing the whole copy.
      const insertable = annotationRows.filter(
        (a) => a.layer_type !== "colourway" || a.colourway_id !== null,
      );
      if (insertable.length < annotationRows.length) {
        warnings.push(
          `${annotationRows.length - insertable.length} colourway pin(s) lost their colourway and were skipped.`,
        );
      }
      for (const batch of chunk(insertable, INSERT_CHUNK)) {
        const { error } = await supabase.from("canvas_annotations").insert(batch);
        if (error) throw new Error(error.message);
      }
    }
  }

  // ---- size specifications: sheets → rows → values ----------------------------
  if (mask.sizeSpecifications) {
    const { data: srcSheets, error: sheetsError } = await supabase
      .from("product_spec_sheets")
      .select("*")
      .eq("product_id", sourceProductId)
      .order("created_at", { ascending: true });
    if (sheetsError) throw new Error(sheetsError.message);

    for (const sheet of srcSheets ?? []) {
      const { data: newSheet, error: sheetError } = await supabase
        .from("product_spec_sheets")
        .insert({
          product_id: targetId,
          workspace_id: workspaceId,
          template_id: sheet.template_id,
          template_name: sheet.template_name,
          mode: sheet.mode,
          sample_size_label: sheet.sample_size_label,
          grading_profile_id: sheet.grading_profile_id,
          fabric_type: sheet.fabric_type,
          unit: sheet.unit,
          name: sheet.name,
          demographic: sheet.demographic,
          sizing_system: sheet.sizing_system,
          size_run: sheet.size_run,
          sample_sizes: sheet.sample_sizes,
          is_complete: sheet.is_complete,
        })
        .select("id")
        .single();
      if (sheetError || !newSheet) {
        throw new Error(sheetError?.message ?? "Could not copy a spec sheet.");
      }

      const { data: srcRows, error: rowsError } = await supabase
        .from("product_spec_rows")
        .select("*")
        .eq("sheet_id", sheet.id)
        .order("sort_order", { ascending: true });
      if (rowsError) throw new Error(rowsError.message);
      if (!srcRows || srcRows.length === 0) continue;

      const { data: newRows, error: rowError } = await supabase
        .from("product_spec_rows")
        .insert(
          srcRows.map((row) => ({
            sheet_id: newSheet.id,
            workspace_id: workspaceId,
            code: row.code,
            name: row.name,
            how_to_measure: row.how_to_measure,
            grade_category: row.grade_category,
            sub_kind: row.sub_kind,
            tolerance_override: row.tolerance_override,
            sort_order: row.sort_order,
          })),
        )
        .select("id, code");
      if (rowError) throw new Error(rowError.message);

      // Codes are UNIQUE per sheet (0033), so they map old row → new row.
      const rowIdByCode = new Map((newRows ?? []).map((r) => [r.code, r.id]));
      const rowIdMap = new Map<string, string>();
      for (const row of srcRows) {
        const newId = rowIdByCode.get(row.code);
        if (newId) rowIdMap.set(row.id, newId);
      }

      const { data: srcValues, error: valuesError } = await supabase
        .from("product_spec_values")
        .select("*")
        .eq("sheet_id", sheet.id);
      if (valuesError) throw new Error(valuesError.message);

      const valueRows = (srcValues ?? []).flatMap((v) => {
        const newRowId = rowIdMap.get(v.row_id);
        if (!newRowId) return [];
        return [
          {
            sheet_id: newSheet.id,
            row_id: newRowId,
            workspace_id: workspaceId,
            size_label: v.size_label,
            value: v.value,
          },
        ];
      });
      for (const batch of chunk(valueRows, INSERT_CHUNK)) {
        const { error } = await supabase
          .from("product_spec_values")
          .insert(batch);
        if (error) throw new Error(error.message);
      }
    }
  }

  return { id: targetId, warnings };
}
