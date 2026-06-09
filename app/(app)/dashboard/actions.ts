"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const createProductSchema = z.object({
  name: z.string().min(1),
  style_number: z.string().optional(),
});

export type CreateProductInput = z.input<typeof createProductSchema>;

/**
 * Inserts a minimal product (name + optional style number) for the current
 * workspace and auto-creates its sections from the default section_templates,
 * proving the data path end to end.
 */
export async function createProduct(input: CreateProductInput) {
  const { name, style_number } = createProductSchema.parse(input);

  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("Not authenticated.");

  const supabase = await createClient();

  const trimmedStyle = style_number?.trim();
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      workspace_id: ctx.profile.workspace_id,
      name,
      style_number: trimmedStyle ? trimmedStyle : null,
    })
    .select("id")
    .single();

  if (error || !product) {
    throw new Error(error?.message ?? "Could not create product.");
  }

  const { data: templates, error: templatesError } = await supabase
    .from("section_templates")
    .select("key, default_sort_order")
    .eq("is_default", true);

  if (templatesError) {
    throw new Error(templatesError.message);
  }

  if (templates && templates.length > 0) {
    const rows = templates.map((template) => ({
      product_id: product.id,
      section_key: template.key,
      sort_order: template.default_sort_order,
    }));
    const { error: sectionsError } = await supabase
      .from("product_sections")
      .insert(rows);
    if (sectionsError) {
      throw new Error(sectionsError.message);
    }
  }

  revalidatePath("/dashboard");
  return { id: product.id };
}
