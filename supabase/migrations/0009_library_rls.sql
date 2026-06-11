-- ============================================================================
-- 0009 — Master Library Row Level Security (idempotent / safe to re-run)
-- Rules:
--   library_items
--     • SELECT: any authenticated user sees ACTIVE global items + their own
--       workspace's items.
--     • Workspace items: full CRUD only within the caller's workspace.
--     • Global items: write (insert/update/delete) only for platform admins.
--       Written as SEPARATE policies so a normal workspace user can NEVER touch
--       a global row — neither the workspace policies (they require
--       source='workspace') nor the global policies (they require
--       is_platform_admin()) admit a global write by a non-admin.
--   workspace_library_toggles: full CRUD scoped to the caller's workspace.
--   platform_admins: members may read their own row (and admins read all);
--       no authenticated write path — rows are added manually via service role.
-- All membership checks route through public.auth_workspace_id() (0002) and the
-- new public.is_platform_admin() so no policy re-queries a table under its own
-- RLS (no recursion).
-- ============================================================================

alter table public.platform_admins            enable row level security;
alter table public.library_items              enable row level security;
alter table public.workspace_library_toggles  enable row level security;

-- ---- Caller is a platform admin? (RLS-safe; never recurses) ------------------
-- SECURITY DEFINER + empty search_path so reading platform_admins here bypasses
-- that table's own RLS, mirroring auth_workspace_id().
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  )
$$;

grant execute on function public.is_platform_admin() to authenticated;

-- ---- platform_admins ---------------------------------------------------------
-- Read your own membership; platform admins can read the full roster. No
-- INSERT/UPDATE/DELETE policies: writes happen via service role in Supabase.
drop policy if exists "platform_admins_select_self_or_admin" on public.platform_admins;
create policy "platform_admins_select_self_or_admin"
  on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- ---- library_items: SELECT ---------------------------------------------------
-- Active global items are visible to everyone; workspace items only to members.
drop policy if exists "library_items_select_visible" on public.library_items;
create policy "library_items_select_visible"
  on public.library_items for select to authenticated
  using (
    (source = 'global' and is_active = true)
    or workspace_id = public.auth_workspace_id()
  );

-- ---- library_items: workspace writes -----------------------------------------
-- A member may create/update/delete only their OWN workspace's items. The
-- source='workspace' guard means these policies can never admit a global row.
drop policy if exists "library_items_insert_workspace" on public.library_items;
create policy "library_items_insert_workspace"
  on public.library_items for insert to authenticated
  with check (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "library_items_update_workspace" on public.library_items;
create policy "library_items_update_workspace"
  on public.library_items for update to authenticated
  using (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  )
  with check (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "library_items_delete_workspace" on public.library_items;
create policy "library_items_delete_workspace"
  on public.library_items for delete to authenticated
  using (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

-- ---- library_items: global writes (platform admins only) ---------------------
-- Separate policies gated on is_platform_admin(). Combined with the
-- source='global' guard, only platform admins can write global rows.
drop policy if exists "library_items_insert_global_admin" on public.library_items;
create policy "library_items_insert_global_admin"
  on public.library_items for insert to authenticated
  with check (source = 'global' and public.is_platform_admin());

drop policy if exists "library_items_update_global_admin" on public.library_items;
create policy "library_items_update_global_admin"
  on public.library_items for update to authenticated
  using (source = 'global' and public.is_platform_admin())
  with check (source = 'global' and public.is_platform_admin());

drop policy if exists "library_items_delete_global_admin" on public.library_items;
create policy "library_items_delete_global_admin"
  on public.library_items for delete to authenticated
  using (source = 'global' and public.is_platform_admin());

-- ---- workspace_library_toggles ----------------------------------------------
-- Full CRUD within your workspace; can't toggle on another workspace's behalf.
drop policy if exists "wl_toggles_all_member" on public.workspace_library_toggles;
create policy "wl_toggles_all_member"
  on public.workspace_library_toggles for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());
