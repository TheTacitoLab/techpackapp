-- ============================================================================
-- 0037 — Spec Sheets: multiple per product + self-contained size run
--        (idempotent / safe to re-run)
--
-- The Size Specifications reflow. Two changes to the model behind 0033:
--
--   1. A product now holds MANY Spec Sheets (a Youth, a Men's and a Women's
--      version can coexist in one tech pack), so the `product_id` UNIQUE
--      constraint from 0033 is dropped. The existing
--      idx_product_spec_sheets_product index stays for the list lookup.
--
--   2. Each sheet is SELF-CONTAINED — it owns its size run instead of reading
--      the product's free-text `products.size_range`. New columns:
--        demographic     — youth / mens / womens / custom (the run's ladder)
--        sizing_system   — alpha / numeric (women's picks; others default alpha)
--        size_run        — the ordered size labels ticked for THIS sheet
--        sample_sizes    — the 1–2 sizes physically sampled (subset of the run;
--                          [1] is the grading anchor, kept in `sample_size_label`)
--        name            — the sheet's display name in the section list
--        is_complete     — the "Mark complete" flag driving the section status
--
-- `sample_size_label` (0033) is kept as the grading ANCHOR (== sample_sizes[1]
-- in 1-based terms, i.e. the first element) so the engine and the auto-mode
-- "only the sample column is stored" invariant carry over unchanged; the
-- server actions keep the two in sync.
--
-- Backfill is best-effort (test data can be recreated): the single sample size
-- becomes a one-element sample_sizes array; size_run is left empty for existing
-- sheets (their run used to come from products.size_range — reselect it in the
-- flow's size step). Demographic/system default to custom/alpha.
--
-- RLS/GRANTs are unchanged — these are new columns on an existing table that
-- already carries the 0033 policies.
-- ============================================================================

-- ---- New enum types ----------------------------------------------------------
do $$ begin
  create type public.spec_demographic as enum (
    'youth', 'mens', 'womens', 'custom'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.spec_sizing_system as enum ('alpha', 'numeric');
exception when duplicate_object then null;
end $$;

-- ---- Drop the one-sheet-per-product constraint -------------------------------
-- Inline `product_id ... unique` (0033) is named product_spec_sheets_product_id_key.
alter table public.product_spec_sheets
  drop constraint if exists product_spec_sheets_product_id_key;

-- ---- New self-contained columns ----------------------------------------------
alter table public.product_spec_sheets
  add column if not exists name          text,
  add column if not exists demographic   public.spec_demographic   not null default 'custom',
  add column if not exists sizing_system public.spec_sizing_system not null default 'alpha',
  add column if not exists size_run      text[] not null default '{}',
  add column if not exists sample_sizes  text[] not null default '{}',
  add column if not exists is_complete   boolean not null default false;

-- ---- Best-effort backfill of existing single-sheet rows ----------------------
-- The measured size becomes a one-element sample set (anchor preserved in
-- sample_size_label). Only touch rows that predate this migration
-- (empty sample_sizes) so re-runs are no-ops.
update public.product_spec_sheets
set sample_sizes = array[sample_size_label]
where sample_size_label is not null
  and coalesce(array_length(sample_sizes, 1), 0) = 0;
