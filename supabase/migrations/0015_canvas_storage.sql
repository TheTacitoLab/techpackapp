-- ============================================================================
-- 0015 — Canvas asset Storage bucket + policies (idempotent / safe to re-run)
-- Private `product-assets` bucket. Objects are keyed
--   {workspace_id}/{product_id}/{timestamp}_{filename}
-- so the FIRST path segment is the owning workspace. The policies below scope
-- every read/write to objects whose first segment matches the caller's
-- workspace, reusing public.auth_workspace_id() (0002) — the same SECURITY
-- DEFINER helper every table policy uses (no recursion, no direct profiles read).
--
-- NOTE ON RUNNING THIS FILE: storage.buckets / storage.objects belong to the
-- `supabase_storage` role. Applying this via the Supabase SQL editor or
-- `supabase db push` works because both run with sufficient privilege, and RLS
-- is already enabled on storage.objects by Supabase. If your environment blocks
-- DDL on the storage schema, create the bucket + these four policies through the
-- dashboard Storage UI instead (see the Phase 4a handoff notes). Re-running is a
-- no-op: the bucket insert is guarded by ON CONFLICT and each policy is dropped
-- before being recreated.
-- ============================================================================

-- ---- Bucket (private) --------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-assets', 'product-assets', false)
on conflict (id) do nothing;

-- ---- storage.objects policies (workspace-scoped by first path segment) -------
drop policy if exists "product_assets_read" on storage.objects;
create policy "product_assets_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

drop policy if exists "product_assets_insert" on storage.objects;
create policy "product_assets_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

drop policy if exists "product_assets_update" on storage.objects;
create policy "product_assets_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  )
  with check (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

drop policy if exists "product_assets_delete" on storage.objects;
create policy "product_assets_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );
