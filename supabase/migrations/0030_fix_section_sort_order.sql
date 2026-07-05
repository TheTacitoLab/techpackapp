-- ============================================================================
-- 0030 — Fix the Asset Upload / Technical Details ordering tie (idempotent).
--
-- Migration 0016 renamed the `canvas` section to `technical_details` and set
-- the TEMPLATE's default_sort_order to 30, but each product's existing
-- product_sections row kept the old `canvas` sort_order (20). The same
-- migration backfilled the new `assets` section at sort_order 20. So on every
-- product created before 0016, `assets` and `technical_details` share
-- sort_order 20 — a tie that made the two sections' display order
-- non-deterministic (the section list orders by sort_order).
--
-- Realign every product_sections row's sort_order to its template's
-- default_sort_order, which is tie-free:
--   identity 10 · assets 20 · technical_details 30 · branding 40 ·
--   bom 50 · grading 60 · documents 70.
-- There is no per-product section-reorder feature, so the template default is
-- the single source of truth. The `is distinct from` guard makes re-runs a
-- no-op. Safe to re-run.
-- ============================================================================

update public.product_sections ps
set sort_order = t.default_sort_order
from public.section_templates t
where ps.section_key = t.key
  and ps.sort_order is distinct from t.default_sort_order;
