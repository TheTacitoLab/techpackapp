-- ============================================================================
-- 0043 — Partner foundation (idempotent / safe to re-run)
--
-- P1 of the partner-collaboration arc: the Partner directory, saveable
-- Visibility Profiles, and scope grants. NO auth, NO portal — this session
-- only stores who partners are, what they're intended to see, and where.
-- Three concerns, kept distinct:
--
--   partners            — WHO: the directory record (a trim's supplier, a
--                         product's factory), referenced across the app and —
--                         from P2 — the thing granted portal access.
--   partner_grants      — WHICH records: brand / collection / product scope,
--                         each paired with a visibility profile.
--   visibility_profiles — WHAT within a record: named, reusable field-group
--                         toggle maps ("Factory Merchandiser", "Brand
--                         Review"). Hidden groups are REMOVED from the
--                         partner view (P2's resolver), never shown locked.
--
-- `partner_contacts.access_enabled` stores INTENT only — P2's auth acts on
-- it; nothing in P1 reads it beyond display.
--
-- field_groups jsonb contract (canonical list lives in types/visibility.ts —
-- `VISIBILITY_GROUPS` — the single source both the builder UI and P2's
-- resolver import; every leaf is a boolean):
--   product_setup:       core_identity, description_fit, production_tracking,
--                        pricing
--   technical_drawings:  flats_annotations, colourways, page_notes
--   bill_of_materials:   materials_construction, costs
--   size_specifications: measurements_grading, tolerances
--   documents:           attachments
-- Pricing and costs are their own groups and default OFF in every new
-- profile — deliberately enabled or never seen.
-- ============================================================================

-- ---- Enum types --------------------------------------------------------------

-- Type drives where a partner appears: supplier/factory show in the
-- fabric/trim supplier pickers; factory/brand_client/collaborator are the
-- ones that get portal access later; brand_client is never a material
-- supplier.
do $$ begin
  create type public.partner_type as enum (
    'supplier', 'factory', 'brand_client', 'collaborator'
  );
exception when duplicate_object then null;
end $$;

-- The three scope levels a grant can target. A sub-collection is just a
-- collection (0042 nesting), so it needs no value of its own.
do $$ begin
  create type public.partner_grant_subject as enum (
    'brand', 'collection', 'product'
  );
exception when duplicate_object then null;
end $$;

-- ---- partners ------------------------------------------------------------------
create table if not exists public.partners (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  type         public.partner_type not null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---- partner_contacts ----------------------------------------------------------
-- Email is nullable on purpose: a yarn mill named on a BOM never logs in and
-- needs no address. `access_enabled` is the P2 hand-off flag — toggling it in
-- P1 stores intent, nothing more (no auth exists yet).
create table if not exists public.partner_contacts (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners (id) on delete cascade,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  full_name      text not null,
  email          text,
  is_primary     boolean not null default false,
  access_enabled boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- At most one primary contact per partner (partial unique — non-primary rows
-- are unconstrained).
create unique index if not exists idx_partner_contacts_one_primary
  on public.partner_contacts (partner_id) where is_primary;

-- ---- visibility_profiles ---------------------------------------------------------
-- `field_groups` holds the toggle map per the contract in the header. The DB
-- keeps it loose jsonb; shape is enforced by the zod schema in
-- partner-actions (derived from VISIBILITY_GROUPS, strict). `is_default`
-- marks the profile grant forms preselect.
create table if not exists public.visibility_profiles (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  field_groups jsonb not null default '{}'::jsonb,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---- partner_grants --------------------------------------------------------------
-- One row = "this partner can see this subject through this profile".
-- `subject_id` is polymorphic over subject_type (brand/collection/product),
-- so no FK — the server actions verify the subject lives in the caller's
-- workspace before insert, and revoked/deleted subjects just leave a dangling
-- grant that resolves to nothing in P2 (harmless, and revocable in the UI).
-- Profile FK is RESTRICT: deleting a profile that grants still use must fail
-- (the app surfaces "in use by N grants" before it gets here). Partner
-- deletion sweeps its grants via CASCADE.
create table if not exists public.partner_grants (
  id                    uuid not null primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  partner_id            uuid not null references public.partners (id) on delete cascade,
  subject_type          public.partner_grant_subject not null,
  subject_id            uuid not null,
  visibility_profile_id uuid not null references public.visibility_profiles (id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (partner_id, subject_type, subject_id)
);

-- ---- Indexes -----------------------------------------------------------------
create index if not exists idx_partners_workspace            on public.partners (workspace_id);
create index if not exists idx_partner_contacts_partner      on public.partner_contacts (partner_id);
create index if not exists idx_partner_contacts_workspace    on public.partner_contacts (workspace_id);
create index if not exists idx_visibility_profiles_workspace on public.visibility_profiles (workspace_id);
create index if not exists idx_partner_grants_workspace      on public.partner_grants (workspace_id);
create index if not exists idx_partner_grants_partner        on public.partner_grants (partner_id);
create index if not exists idx_partner_grants_profile        on public.partner_grants (visibility_profile_id);

-- ---- updated_at maintenance (reuse public.set_updated_at from 0002) ----------
drop trigger if exists trg_partners_updated_at on public.partners;
create trigger trg_partners_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

drop trigger if exists trg_partner_contacts_updated_at on public.partner_contacts;
create trigger trg_partner_contacts_updated_at
  before update on public.partner_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_visibility_profiles_updated_at on public.visibility_profiles;
create trigger trg_visibility_profiles_updated_at
  before update on public.visibility_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_partner_grants_updated_at on public.partner_grants;
create trigger trg_partner_grants_updated_at
  before update on public.partner_grants
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — standard direct workspace-match policies (0019 canvas_colourways
-- pattern) on all four tables. Partners are plain workspace data in P1; the
-- partner-facing read path (published versions through grants) is P2's
-- concern and will arrive as its own policies/routes, not by widening these.
-- ============================================================================

alter table public.partners enable row level security;

drop policy if exists "partners_select_member" on public.partners;
create policy "partners_select_member"
  on public.partners for select to authenticated
  using (workspace_id = public.auth_workspace_id());

drop policy if exists "partners_insert_member" on public.partners;
create policy "partners_insert_member"
  on public.partners for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "partners_update_member" on public.partners;
create policy "partners_update_member"
  on public.partners for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "partners_delete_member" on public.partners;
create policy "partners_delete_member"
  on public.partners for delete to authenticated
  using (workspace_id = public.auth_workspace_id());

alter table public.partner_contacts enable row level security;

drop policy if exists "partner_contacts_select_member" on public.partner_contacts;
create policy "partner_contacts_select_member"
  on public.partner_contacts for select to authenticated
  using (workspace_id = public.auth_workspace_id());

drop policy if exists "partner_contacts_insert_member" on public.partner_contacts;
create policy "partner_contacts_insert_member"
  on public.partner_contacts for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    -- The parent partner must be ours too — the workspace column alone would
    -- let a crafted insert hang our contact on another workspace's partner.
    and exists (
      select 1 from public.partners p
      where p.id = partner_contacts.partner_id
        and p.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "partner_contacts_update_member" on public.partner_contacts;
create policy "partner_contacts_update_member"
  on public.partner_contacts for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "partner_contacts_delete_member" on public.partner_contacts;
create policy "partner_contacts_delete_member"
  on public.partner_contacts for delete to authenticated
  using (workspace_id = public.auth_workspace_id());

alter table public.visibility_profiles enable row level security;

drop policy if exists "visibility_profiles_select_member" on public.visibility_profiles;
create policy "visibility_profiles_select_member"
  on public.visibility_profiles for select to authenticated
  using (workspace_id = public.auth_workspace_id());

drop policy if exists "visibility_profiles_insert_member" on public.visibility_profiles;
create policy "visibility_profiles_insert_member"
  on public.visibility_profiles for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "visibility_profiles_update_member" on public.visibility_profiles;
create policy "visibility_profiles_update_member"
  on public.visibility_profiles for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

drop policy if exists "visibility_profiles_delete_member" on public.visibility_profiles;
create policy "visibility_profiles_delete_member"
  on public.visibility_profiles for delete to authenticated
  using (workspace_id = public.auth_workspace_id());

alter table public.partner_grants enable row level security;

drop policy if exists "partner_grants_select_member" on public.partner_grants;
create policy "partner_grants_select_member"
  on public.partner_grants for select to authenticated
  using (workspace_id = public.auth_workspace_id());

drop policy if exists "partner_grants_insert_member" on public.partner_grants;
create policy "partner_grants_insert_member"
  on public.partner_grants for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    -- Both referenced rows must be ours (subject_id is checked in the server
    -- action — it's polymorphic, so it can't be checked generically here
    -- without a per-type branch; partner and profile CAN be).
    and exists (
      select 1 from public.partners p
      where p.id = partner_grants.partner_id
        and p.workspace_id = public.auth_workspace_id()
    )
    and exists (
      select 1 from public.visibility_profiles vp
      where vp.id = partner_grants.visibility_profile_id
        and vp.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "partner_grants_update_member" on public.partner_grants;
create policy "partner_grants_update_member"
  on public.partner_grants for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (
    workspace_id = public.auth_workspace_id()
    and exists (
      select 1 from public.visibility_profiles vp
      where vp.id = partner_grants.visibility_profile_id
        and vp.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "partner_grants_delete_member" on public.partner_grants;
create policy "partner_grants_delete_member"
  on public.partner_grants for delete to authenticated
  using (workspace_id = public.auth_workspace_id());

-- ============================================================================
-- Seed: the "Factory Merchandiser" starter profile — everything ON except
-- pricing and BOM costs (the 90% case; proves the model). Seeded for every
-- EXISTING workspace here (idempotent by name), and for every FUTURE
-- workspace via the handle_new_user() recreation below. Keep this jsonb in
-- lockstep with `factoryMerchandiserFieldGroups()` in lib/visibility-profiles.ts.
-- ============================================================================

insert into public.visibility_profiles (workspace_id, name, field_groups, is_default)
select
  w.id,
  'Factory Merchandiser',
  '{
    "product_setup":       {"core_identity": true, "description_fit": true, "production_tracking": true, "pricing": false},
    "technical_drawings":  {"flats_annotations": true, "colourways": true, "page_notes": true},
    "bill_of_materials":   {"materials_construction": true, "costs": false},
    "size_specifications": {"measurements_grading": true, "tolerances": true},
    "documents":           {"attachments": true}
  }'::jsonb,
  true
from public.workspaces w
where not exists (
  select 1 from public.visibility_profiles vp
  where vp.workspace_id = w.id
    and vp.name = 'Factory Merchandiser'
);

-- ---- New-user bootstrap: also seed the starter profile ------------------------
-- Recreated from 0006 verbatim, plus the visibility-profile insert at the end,
-- so new workspaces start with the same profile existing ones were seeded.
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

  insert into public.visibility_profiles (workspace_id, name, field_groups, is_default)
  values (
    new_workspace_id,
    'Factory Merchandiser',
    '{
      "product_setup":       {"core_identity": true, "description_fit": true, "production_tracking": true, "pricing": false},
      "technical_drawings":  {"flats_annotations": true, "colourways": true, "page_notes": true},
      "bill_of_materials":   {"materials_construction": true, "costs": false},
      "size_specifications": {"measurements_grading": true, "tolerances": true},
      "documents":           {"attachments": true}
    }'::jsonb,
    true
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
