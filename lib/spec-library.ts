import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  GradingProfile,
  ResolvedGradingProfile,
  ResolvedSpecTemplate,
  SpecTemplate,
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
