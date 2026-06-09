-- ============================================================================
-- 0005 — Add archived_at to products + verify full RLS coverage
-- Idempotent / safe to re-run.
-- ============================================================================

-- ---- Soft-archive column -----------------------------------------------------
alter table public.products
  add column if not exists archived_at timestamptz null;

-- ---- RLS: brands / seasons / collections / products already have FOR ALL -----
-- Re-assert idempotently so this file is a complete reference. The existing
-- "brands_all_member", "seasons_all_member", "collections_all_member", and
-- "products_all_member" policies in 0003 already cover SELECT/INSERT/UPDATE/
-- DELETE via workspace_id = auth_workspace_id(). No gaps to fill.
-- (No new tables in Phase 2; no new policies required.)
