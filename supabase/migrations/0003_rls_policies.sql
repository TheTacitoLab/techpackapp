-- ============================================================================
-- 0003 — Row Level Security (idempotent / safe to re-run)
-- Core rule: a user may read/write rows whose workspace_id matches the
-- workspace_id on their own profiles row. Child tables without a direct
-- workspace_id enforce via their parent. section_templates is global read-only.
-- All membership checks route through public.auth_workspace_id() (SECURITY
-- DEFINER) so no policy re-queries `profiles` under RLS (no recursion).
-- ============================================================================

alter table public.workspaces        enable row level security;
alter table public.profiles          enable row level security;
alter table public.brands            enable row level security;
alter table public.seasons           enable row level security;
alter table public.collections       enable row level security;
alter table public.products          enable row level security;
alter table public.section_templates enable row level security;
alter table public.product_sections  enable row level security;

-- ---- profiles ----------------------------------------------------------------
-- Keyed ONLY off auth.uid() = id (no subselect into profiles) to avoid
-- recursion. INSERT happens via the SECURITY DEFINER trigger (no policy needed).
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---- workspaces --------------------------------------------------------------
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces for select to authenticated
  using (id = public.auth_workspace_id());

drop policy if exists "workspaces_update_owner" on public.workspaces;
create policy "workspaces_update_owner"
  on public.workspaces for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---- brands / seasons / collections / products -------------------------------
-- FOR ALL with matching using + with check: read/write only within your
-- workspace, and you can't move a row into another workspace.
drop policy if exists "brands_all_member" on public.brands;
create policy "brands_all_member"
  on public.brands for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "seasons_all_member" on public.seasons;
create policy "seasons_all_member"
  on public.seasons for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "collections_all_member" on public.collections;
create policy "collections_all_member"
  on public.collections for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "products_all_member" on public.products;
create policy "products_all_member"
  on public.products for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- ---- section_templates (global read-only) ------------------------------------
-- Any authenticated user may read; no write policies => no client writes.
drop policy if exists "section_templates_select_all" on public.section_templates;
create policy "section_templates_select_all"
  on public.section_templates for select to authenticated
  using (true);

-- ---- product_sections (enforced via parent product) --------------------------
drop policy if exists "product_sections_select_member" on public.product_sections;
create policy "product_sections_select_member"
  on public.product_sections for select to authenticated
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_sections.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "product_sections_insert_member" on public.product_sections;
create policy "product_sections_insert_member"
  on public.product_sections for insert to authenticated
  with check (
    exists (
      select 1 from public.products pr
      where pr.id = product_sections.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "product_sections_update_member" on public.product_sections;
create policy "product_sections_update_member"
  on public.product_sections for update to authenticated
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_sections.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
  )
  with check (
    exists (
      select 1 from public.products pr
      where pr.id = product_sections.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "product_sections_delete_member" on public.product_sections;
create policy "product_sections_delete_member"
  on public.product_sections for delete to authenticated
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_sections.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
  );
