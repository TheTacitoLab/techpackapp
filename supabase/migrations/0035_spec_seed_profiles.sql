-- ============================================================================
-- 0035 — Grading Profiles global seed (idempotent / safe to re-run)
--
-- The three starter profiles, transcribed faithfully from
-- docs/GarSpec_Grading_Profiles_Reference.md §4–5 (per-size increments, FLAT
-- measurements, cm). Positioning per the reference: "industry-typical defaults
-- — adjust to your fit block"; every value is editable via duplicate-to-edit.
--
-- Increment jsonb keys (contract shared with lib/grading-engine.ts):
--   primary_girth, secondary_girth, body_length, limb_length,
--   small_shoulder, small_neck, small_cuff_opening, small_rise, small_strap,
--   inseam.
-- A key a profile omits grades at 0 — the reference gives no strap value for
-- Men's or Youth (strap is a womenswear-specific small point), so those
-- profiles simply omit small_strap rather than inventing a number.
-- `extended_increments` carries the FULL set (values that don't change across
-- the break repeat verbatim, per the reference tables: body/limb/small values
-- are "as listed" on both sides; only the girths step up).
--
-- Inseam: adult profiles carry inseam 0 (adult inseam does NOT grade — length
-- options handle leg length); Youth carries inseam 2.5 ("grades, unlike
-- adult", equal to its limb grade). Rows tagged fixed + sub_kind 'inseam'
-- resolve to this key.
--
-- Tolerances (± cm, reference §5) keyed by point type:
--   primary_girth, secondary_girth, body_length, limb_length, small, fixed.
-- Lengths are ±1.0 for knits AND wovens; small points ±0.5 both. The
-- reference doesn't list a tolerance for fixed points (rib heights, plackets,
-- pocket dims) — seeded at ±0.5, matching the small-points convention, and
-- editable per row. Youth knit girth tolerance: the reference gives a RANGE
-- (±1.2–2.5, "youth/team conventions run looser") — seeded at the ±1.2 lower
-- bound for both girth categories; the woven set mirrors the adult woven
-- column (the reference marks youth wovens "—"). A row's tolerance resolves:
-- sub_kind 'inseam' → limb_length; small sub-kinds → small; otherwise its
-- grade_category (fixed → fixed).
--
-- `size_run_labels` is each profile's default/reference run ONLY — sheet
-- columns always come from the product's size range; increments are per step,
-- not per label. `break_size_label` = '2XL' for adults (steps whose upper size
-- sits at/above 2XL use extended increments: XL→2XL extended, 2XL→3XL
-- extended, M→L base); Youth has no break.
--
-- Idempotency: guarded by (source='global', name) — the 0010 seed idiom.
-- ============================================================================

-- ---- Men's (S–6XL) — base grade S→XL, break at 2XL+ ---------------------------
insert into public.grading_profiles
  (source, workspace_id, name, description, size_run_labels, break_size_label,
   base_increments, extended_increments, tolerances_knit, tolerances_woven,
   sort_order, created_by)
select
  'global', null,
  'Men''s',
  'Adult men''s block, S–6XL. Straighter block — girths grade uniformly (+2.5 cm flat, the US 2"/5 cm convention), adult inseam does not grade (use S/R/L length options). Extended +3.5 cm girth grade from 2XL up.',
  array['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
  '2XL',
  '{
    "primary_girth": 2.5,
    "secondary_girth": 1.2,
    "body_length": 1.5,
    "limb_length": 1.2,
    "small_shoulder": 1.2,
    "small_neck": 0.6,
    "small_cuff_opening": 0.6,
    "small_rise": 1.0,
    "inseam": 0
  }'::jsonb,
  '{
    "primary_girth": 3.5,
    "secondary_girth": 1.8,
    "body_length": 1.5,
    "limb_length": 1.2,
    "small_shoulder": 1.2,
    "small_neck": 0.6,
    "small_cuff_opening": 0.6,
    "small_rise": 1.0,
    "inseam": 0
  }'::jsonb,
  '{
    "primary_girth": 1.2,
    "secondary_girth": 1.0,
    "body_length": 1.0,
    "limb_length": 1.0,
    "small": 0.5,
    "fixed": 0.5
  }'::jsonb,
  '{
    "primary_girth": 0.6,
    "secondary_girth": 0.6,
    "body_length": 1.0,
    "limb_length": 1.0,
    "small": 0.5,
    "fixed": 0.5
  }'::jsonb,
  10, null
where not exists (
  select 1 from public.grading_profiles gp
  where gp.source = 'global' and gp.name = 'Men''s'
);

-- ---- Women's (XS–6XL) — European 4cm-grade convention, break at 2XL+ ----------
insert into public.grading_profiles
  (source, workspace_id, name, description, size_run_labels, break_size_label,
   base_increments, extended_increments, tolerances_knit, tolerances_woven,
   sort_order, created_by)
select
  'global', null,
  'Women''s',
  'Adult women''s block, XS–6XL. Shaped block graded separately from men''s (never grade women''s from a men''s block) — +2.0 cm flat girth grade (the European 4 cm convention), smaller shoulder grades, strap point included. Extended +3.0 cm girth grade from 2XL up.',
  array['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
  '2XL',
  '{
    "primary_girth": 2.0,
    "secondary_girth": 1.0,
    "body_length": 1.2,
    "limb_length": 1.0,
    "small_shoulder": 0.6,
    "small_neck": 0.6,
    "small_cuff_opening": 0.5,
    "small_rise": 0.8,
    "small_strap": 0.3,
    "inseam": 0
  }'::jsonb,
  '{
    "primary_girth": 3.0,
    "secondary_girth": 1.5,
    "body_length": 1.2,
    "limb_length": 1.0,
    "small_shoulder": 0.6,
    "small_neck": 0.6,
    "small_cuff_opening": 0.5,
    "small_rise": 0.8,
    "small_strap": 0.3,
    "inseam": 0
  }'::jsonb,
  '{
    "primary_girth": 1.2,
    "secondary_girth": 1.0,
    "body_length": 1.0,
    "limb_length": 1.0,
    "small": 0.5,
    "fixed": 0.5
  }'::jsonb,
  '{
    "primary_girth": 0.6,
    "secondary_girth": 0.6,
    "body_length": 1.0,
    "limb_length": 1.0,
    "small": 0.5,
    "fixed": 0.5
  }'::jsonb,
  20, null
where not exists (
  select 1 from public.grading_profiles gp
  where gp.source = 'global' and gp.name = 'Women''s'
);

-- ---- Youth Unisex (YXXS–YXL) — larger grades, lengths DO grade, no break ------
insert into public.grading_profiles
  (source, workspace_id, name, description, size_run_labels, break_size_label,
   base_increments, extended_increments, tolerances_knit, tolerances_woven,
   sort_order, created_by)
select
  'global', null,
  'Youth Unisex',
  'Youth unisex block, YXXS–YXL (age bands ≈3–20; cut on the male block, standard across sportswear and schoolwear). Grades are larger per size — each size spans ~2 years of growth — and lengths DO grade, including inseam (+2.5, unlike adult). Single increment set, no break.',
  array['YXXS', 'YXS', 'YS', 'YM', 'YL', 'YXL'],
  null,
  '{
    "primary_girth": 3.8,
    "secondary_girth": 1.8,
    "body_length": 2.5,
    "limb_length": 2.5,
    "small_shoulder": 1.2,
    "small_neck": 0.5,
    "small_cuff_opening": 0.8,
    "small_rise": 1.2,
    "inseam": 2.5
  }'::jsonb,
  null,
  '{
    "primary_girth": 1.2,
    "secondary_girth": 1.2,
    "body_length": 1.0,
    "limb_length": 1.0,
    "small": 0.5,
    "fixed": 0.5
  }'::jsonb,
  '{
    "primary_girth": 0.6,
    "secondary_girth": 0.6,
    "body_length": 1.0,
    "limb_length": 1.0,
    "small": 0.5,
    "fixed": 0.5
  }'::jsonb,
  30, null
where not exists (
  select 1 from public.grading_profiles gp
  where gp.source = 'global' and gp.name = 'Youth Unisex'
);
