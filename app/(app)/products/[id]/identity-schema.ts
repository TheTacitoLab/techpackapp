import { z } from "zod";

// Option sets — shared by the form selects and (implicitly) the saved values.
export const CATEGORY_OPTIONS = [
  "Outerwear",
  "Knitwear",
  "Swimwear",
  "Activewear",
  "Casualwear",
  "Accessories",
  "Footwear",
  "Underwear",
  "Nightwear",
  "Other",
] as const;

export const GENDER_OPTIONS = [
  "Mens",
  "Womens",
  "Unisex",
  "Youth",
  "Kids",
] as const;

export const END_USE_OPTIONS = [
  "Training",
  "Match Day",
  "Lifestyle",
  "Outerwear",
  "Swim",
  "Casual",
  "Other",
] as const;

export const FIT_TYPE_OPTIONS = [
  "Regular",
  "Slim",
  "Oversized",
  "Relaxed",
  "Compression",
  "Athletic",
] as const;

const PRICE = /^\d+(\.\d{1,2})?$/;

/**
 * The Identity form's single source of truth, used by both the client form
 * (via the RHF zodResolver) and the `saveIdentitySection` server action.
 *
 * Only `name` is hard-required — a product row cannot have a null name. The
 * other four "mandatory" fields (style number, category, gender, size range)
 * are intentionally optional here so a partial draft can still be saved; the
 * action computes section completeness from all five (see `saveIdentitySection`).
 * Empty strings are normalised to null when written to the products table.
 */
export const identityFormSchema = z.object({
  // Group 1 — Core Identity
  name: z.string().trim().min(1, "Style name is required.").max(120),
  style_number: z.string().trim().max(60),
  category: z.string().trim().max(40),
  gender: z.string().trim().max(40),
  size_range: z.string().trim().max(60),
  season_id: z.string().nullable(),
  // Group 1 — About this product (guided description, all optional)
  product_description: z.string().trim().max(300),
  key_features: z.string().trim().max(300),
  fit_description: z.string().trim().max(300),
  // Group 2 — Brand & Ownership
  designer_name: z.string().trim().max(120),
  designer_email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === "" || z.email().safeParse(v).success, {
      message: "Enter a valid email address.",
    }),
  // Group 3 — Production Tracking
  factory_name: z.string().trim().max(120),
  factory_country: z.string().trim().max(80),
  sample_due_date: z.string(),
  delivery_date: z.string(),
  wholesale_price: z
    .string()
    .refine((v) => v === "" || PRICE.test(v), { message: "Enter a valid amount." }),
  retail_price: z
    .string()
    .refine((v) => v === "" || PRICE.test(v), { message: "Enter a valid amount." }),
  // Group 4 — Use & Fit
  end_use: z.string(),
  fit_type: z.string(),
  // Group 5 — Admin & Metadata
  internal_notes: z.string().trim().max(2000),
});

export type IdentityFormValues = z.infer<typeof identityFormSchema>;
