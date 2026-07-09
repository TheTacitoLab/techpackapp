/**
 * Template summaries — the card/picker shape shared by Settings → Templates,
 * the "Use A Template" flow, and anywhere else templates are listed. One
 * server-side helper so the "what does this template contain" derivation
 * (setup / drawings / specs indicators) exists exactly once.
 */

import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type TemplateSummary = {
  id: string;
  name: string;
  brandName: string | null;
  category: string | null;
  createdAt: string;
  /** Any identity content: a core field filled or the form ever saved. */
  hasSetup: boolean;
  /** Any canvas page (BOM derives from these, so it rides along). */
  hasDrawings: boolean;
  /** Any spec sheet. */
  hasSpecs: boolean;
};

export async function getTemplateSummaries(
  supabase: ServerClient,
  workspaceId: string,
): Promise<TemplateSummary[]> {
  const { data: templates } = await supabase
    .from("products")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_template", true)
    .order("created_at", { ascending: false });

  if (!templates || templates.length === 0) return [];
  const ids = templates.map((t) => t.id);

  const [{ data: brands }, { data: pages }, { data: sheets }, { data: identitySections }] =
    await Promise.all([
      supabase.from("brands").select("id, name").eq("workspace_id", workspaceId),
      supabase.from("canvas_pages").select("product_id").in("product_id", ids),
      supabase
        .from("product_spec_sheets")
        .select("product_id")
        .in("product_id", ids),
      supabase
        .from("product_sections")
        .select("product_id, data")
        .eq("section_key", "identity")
        .in("product_id", ids),
    ]);

  const brandName = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const withPages = new Set((pages ?? []).map((p) => p.product_id));
  const withSheets = new Set((sheets ?? []).map((s) => s.product_id));
  const identitySaved = new Set(
    (identitySections ?? [])
      .filter((s) => {
        const data = (s.data ?? {}) as Record<string, unknown>;
        return Boolean(data.last_saved);
      })
      .map((s) => s.product_id),
  );

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    brandName: t.brand_id ? (brandName.get(t.brand_id) ?? null) : null,
    category: t.category,
    createdAt: t.created_at,
    hasSetup: Boolean(
      t.category || t.gender || t.size_range || identitySaved.has(t.id),
    ),
    hasDrawings: withPages.has(t.id),
    hasSpecs: withSheets.has(t.id),
  }));
}
