-- ============================================================================
-- 0011 - Identity section product columns (idempotent / safe to re-run)
-- Promotes the Identity / Cover section's structural fields to real product
-- columns. These are queried directly by the launchpad dashboard and the PDF
-- export, so they live on `products` rather than buried in the section JSON.
-- `category`, `gender`, `size_range` already exist (text) from 0001 and are
-- left untouched here — this phase only gives them UI. `season_id` links a
-- product straight to a season (previously only derivable via its collection).
-- ============================================================================

alter table public.products
  add column if not exists designer_name      text null,
  add column if not exists designer_email     text null,
  add column if not exists factory_name       text null,
  add column if not exists factory_country    text null,
  add column if not exists sample_due_date    date null,
  add column if not exists delivery_date      date null,
  add column if not exists wholesale_price    numeric(10,2) null,
  add column if not exists retail_price       numeric(10,2) null,
  add column if not exists season_id          uuid null references public.seasons(id) on delete set null;
