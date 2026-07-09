-- ============================================================================
-- 0040 — Product templates (idempotent / safe to re-run)
--
-- A template IS a product: `is_template = true` marks it, and everything else
-- about it (sections, canvas pages, annotations, spec sheets, assets) uses the
-- product tables unchanged. Both creating a template from a product and
-- creating a product from a template are deep copies, so deleting a template
-- never affects products made from it.
--
-- RLS: no changes needed. Templates are ordinary workspace-scoped `products`
-- rows, and every policy on products and its child tables keys off
-- workspace_id (or the parent product), which is unaffected by this flag.
-- Product surfaces exclude templates in their queries, not via policy.
-- ============================================================================

alter table public.products
  add column if not exists is_template boolean not null default false;
