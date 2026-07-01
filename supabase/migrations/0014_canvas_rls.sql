-- ============================================================================
-- 0014 — Canvas Row Level Security (idempotent / safe to re-run)
-- product_assets / canvas_pages / canvas_annotations carry workspace_id directly
-- -> standard direct-match policy via public.auth_workspace_id() (0002), exactly
-- like brands/products/labels. canvas_slots has no workspace_id of its own, so it
-- resolves through its parent canvas_pages — the same parent-lookup pattern used
-- by product_labels -> products in 0007.
-- All four use a single FOR ALL policy (SELECT/INSERT/UPDATE/DELETE).
-- ============================================================================

alter table public.product_assets      enable row level security;
alter table public.canvas_pages        enable row level security;
alter table public.canvas_slots        enable row level security;
alter table public.canvas_annotations  enable row level security;

-- ---- product_assets ----------------------------------------------------------
drop policy if exists "product_assets_all_member" on public.product_assets;
create policy "product_assets_all_member"
  on public.product_assets for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- ---- canvas_pages ------------------------------------------------------------
drop policy if exists "canvas_pages_all_member" on public.canvas_pages;
create policy "canvas_pages_all_member"
  on public.canvas_pages for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- ---- canvas_slots (membership enforced via parent page) ----------------------
drop policy if exists "canvas_slots_all_member" on public.canvas_slots;
create policy "canvas_slots_all_member"
  on public.canvas_slots for all to authenticated
  using (
    exists (
      select 1 from public.canvas_pages cp
      where cp.id = canvas_slots.page_id
        and cp.workspace_id = public.auth_workspace_id()
    )
  )
  with check (
    exists (
      select 1 from public.canvas_pages cp
      where cp.id = canvas_slots.page_id
        and cp.workspace_id = public.auth_workspace_id()
    )
  );

-- ---- canvas_annotations ------------------------------------------------------
drop policy if exists "canvas_annotations_all_member" on public.canvas_annotations;
create policy "canvas_annotations_all_member"
  on public.canvas_annotations for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());
