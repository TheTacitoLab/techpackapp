-- ============================================================================
-- 0032 — Product hero asset (idempotent / safe to re-run)
--
-- The user-chosen cover image for the exported tech pack PDF: one hero per
-- product, picked in Asset Upload ("Set as hero"). A nullable FK on products
-- (rather than a boolean on product_assets) makes the one-per-product rule
-- structural — setting a new hero is a single-column update, and deleting the
-- asset clears it automatically. The PDF cover falls back to the first filled
-- canvas slot's image when unset.
-- ============================================================================

alter table public.products
  add column if not exists hero_asset_id uuid
    references public.product_assets(id) on delete set null;
