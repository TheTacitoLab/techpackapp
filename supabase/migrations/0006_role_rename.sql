-- ============================================================================
-- 0006 — Rename user_role values + add approver (idempotent / safe to re-run)
-- PostgreSQL cannot rename enum values atomically alongside a remap, so we
-- build a new enum, remap the existing data, swap it in, and rename it back.
-- Mapping: owner → admin, editor → designer. Adds: approver. viewer/factory
-- are unchanged. The whole block is guarded on the presence of 'admin' so a
-- second run is a no-op.
-- ============================================================================

do $$
begin
  -- Only run the swap if the enum has not already been migrated.
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role'
      and e.enumlabel = 'admin'
  ) then
    -- 1. New enum with the final value set.
    create type public.user_role_new as enum (
      'admin', 'designer', 'approver', 'viewer', 'factory'
    );

    -- 2. Drop the column default before changing its type (the old default
    --    literal 'owner' is not a member of the new enum).
    alter table public.profiles alter column role drop default;

    -- 3. Remap + retype the column.
    alter table public.profiles
      alter column role type public.user_role_new
      using (
        case role::text
          when 'owner'  then 'admin'
          when 'editor' then 'designer'
          else role::text
        end
      )::public.user_role_new;

    -- 4. Drop the old type and rename the new one into its place.
    drop type public.user_role;
    alter type public.user_role_new rename to user_role;

    -- 5. Restore a default, now using the renamed value.
    alter table public.profiles
      alter column role set default 'admin'::public.user_role;
  end if;
end $$;

-- ---- New-user bootstrap: hand out 'admin' to new signups ---------------------
-- Recreate handle_new_user so fresh signups become workspace admins (was owner).
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
    'admin'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
