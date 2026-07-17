-- ============================================================================
-- 0045 - Library favourites (idempotent / safe to re-run)
-- Per-WORKSPACE starred library items: one row = "this workspace starred this
-- item". Mirrors workspace_library_toggles' shape and RLS exactly — favourites
-- are the same trust level (member-level workspace preference) and can point at
-- both global and workspace items; ON DELETE CASCADE clears stars when a
-- workspace item is deleted. Whether the referenced item is actually VISIBLE to
-- the workspace (active global / own workspace item) is enforced app-side in
-- the toggle server action, matching how workspace_library_toggles trusts its
-- action for the same check.
-- ============================================================================

create table if not exists public.library_favourites (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  library_item_id uuid not null references public.library_items (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (workspace_id, library_item_id)
);

create index if not exists idx_library_favourites_workspace on public.library_favourites (workspace_id);
create index if not exists idx_library_favourites_item      on public.library_favourites (library_item_id);

alter table public.library_favourites enable row level security;

-- Full CRUD within your workspace; can't star on another workspace's behalf.
drop policy if exists "library_favourites_all_member" on public.library_favourites;
create policy "library_favourites_all_member"
  on public.library_favourites for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());
