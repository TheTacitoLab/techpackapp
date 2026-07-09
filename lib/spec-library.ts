import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  GradingProfile,
  ResolvedGradingProfile,
  ResolvedSpecTemplate,
  SpecTemplate,
  SpecTemplateCategory,
  SpecTemplatePom,
} from "@/types";

/**
 * Resolvers for the two Size Specifications libraries — Spec Templates and
 * Grading Profiles — following `lib/library.ts`'s Master Library pattern:
 * active global seeded rows merged with the workspace's own rows in one
 * round-trip, each tagged `isGlobal` so the UI can badge seeded rows and gate
 * them to duplicate-to-edit. The product page fetches both inside its
 * `Promise.all` and passes them down as props.
 */

/** The "Choose Spec Template" picker's data: templates with POMs attached. */
export async function getSpecTemplates(): Promise<ResolvedSpecTemplate[]> {
  const ctx = await getCurrentUser();
  if (!ctx) return [];

  const workspaceId = ctx.profile.workspace_id;
  const supabase = await createClient();

  const { data } = await supabase
    .from("spec_templates")
    .select("*, spec_template_poms(*)")
    .or(
      `and(source.eq.global,is_active.eq.true),and(source.eq.workspace,workspace_id.eq.${workspaceId})`,
    )
    .order("sort_order")
    .order("name");

  // Hand-written database.types.ts has no FK metadata, so the embed's type
  // must be asserted (same idiom as the product page's RawPage cast).
  type RawTemplate = SpecTemplate & { spec_template_poms: SpecTemplatePom[] };
  const raw = (data ?? []) as unknown as RawTemplate[];

  return raw.map(({ spec_template_poms, ...template }) => ({
    ...template,
    poms: [...(spec_template_poms ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
    isGlobal: template.source === "global",
  }));
}

/** The lean picker shape for listing spec templates outside the spec flow. */
export type SpecTemplateSummary = {
  id: string;
  name: string;
  category: SpecTemplateCategory;
  pomCount: number;
  isGlobal: boolean;
};

/**
 * Global GarSpec garment templates as picker summaries (no POM bodies) — the
 * "New product from a GarSpec template" flow only needs names, categories
 * and measurement counts. Workspace spec templates are deliberately
 * excluded: this list IS the seeded GarSpec library; custom structures live
 * in the spec flow's own picker.
 */
export async function getGarspecTemplateSummaries(): Promise<
  SpecTemplateSummary[]
> {
  const ctx = await getCurrentUser();
  if (!ctx) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("spec_templates")
    .select("id, name, category, spec_template_poms(count)")
    .eq("source", "global")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  type RawRow = {
    id: string;
    name: string;
    category: SpecTemplateCategory;
    spec_template_poms: { count: number }[];
  };
  return ((data ?? []) as unknown as RawRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    pomCount: row.spec_template_poms?.[0]?.count ?? 0,
    isGlobal: true,
  }));
}

/** Grading Profiles: seeded starters first (sort_order), then customs. */
export async function getGradingProfiles(): Promise<ResolvedGradingProfile[]> {
  const ctx = await getCurrentUser();
  if (!ctx) return [];

  const workspaceId = ctx.profile.workspace_id;
  const supabase = await createClient();

  const { data } = await supabase
    .from("grading_profiles")
    .select("*")
    .or(
      `and(source.eq.global,is_active.eq.true),and(source.eq.workspace,workspace_id.eq.${workspaceId})`,
    )
    .order("sort_order")
    .order("name");

  return ((data ?? []) as GradingProfile[]).map((profile) => ({
    ...profile,
    isGlobal: profile.source === "global",
  }));
}
