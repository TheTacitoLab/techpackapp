-- ============================================================================
-- 0002 — Functions and triggers
-- ============================================================================

-- ---- Caller's workspace_id (RLS-safe; never recurses) ------------------------
-- SECURITY DEFINER + empty search_path so RLS on `profiles` is bypassed when
-- resolving membership. Every other table's policies call this instead of
-- selecting from `profiles`, which is what prevents infinite RLS recursion.
create or replace function public.auth_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.workspace_id
  from public.profiles p
  where p.id = (select auth.uid())
$$;

grant execute on function public.auth_workspace_id() to authenticated, anon;

-- ---- updated_at maintenance --------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---- New-user bootstrap: create workspace, then profile ----------------------
-- Runs on every new auth.users row. Names the workspace from the signup
-- metadata (workspace_name), falling back to "<full name>'s Workspace", then
-- the email local-part, then a generic default.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  ws_name          text;
begin
  ws_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'workspace_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '') || '''s Workspace',
    nullif(split_part(new.email, '@', 1), '') || '''s Workspace',
    'My Workspace'
  );

  insert into public.workspaces (name, owner_id)
  values (ws_name, new.id)
  returning id into new_workspace_id;

  insert into public.profiles (id, workspace_id, full_name, role)
  values (
    new.id,
    new_workspace_id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'owner'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
