-- ============================================================================
-- 0033 — Size Specifications schema (idempotent / safe to re-run)
--
-- The Spec Sheet system behind the "Size Specifications" section (the renamed
-- 'grading' section — rename lands in 0036): a three-step journey of
-- Choose Spec Template → enter sample measurements → apply a Grading Profile,
-- producing a live-graded sheet for every size in the product's run.
--
-- Two library tables follow the Master Library two-layer pattern (0008/0009):
-- GLOBAL seeded rows (workspace_id null, read-only for workspace users,
-- duplicate-to-edit) plus per-WORKSPACE custom rows. `public.library_source`
-- from 0008 is reused as the discriminator — same two values, same meaning.
--
--   spec_templates       — garment-type starting points ("T-Shirt / Tee", ...)
--   spec_template_poms   — each template's points of measure (code, hint,
--                          grade_category, sub_kind)
--   grading_profiles     — per-category increment rules + tolerances
--                          (Men's / Women's / Youth Unisex seeded in 0035)
--
-- Three product tables hold the per-product sheet:
--
--   product_spec_sheets  — one per product: template ref, mode, sample size,
--                          profile ref, knit/woven, unit
--   product_spec_rows    — the sheet's POM rows, COPIED from the template at
--                          creation so they're product-owned and fully editable
--   product_spec_values  — stored cell values. In auto mode ONLY the sample
--                          column is stored — every other size is computed
--                          live from sample + profile and never persisted
--                          (single source of truth, same philosophy as marker
--                          colours). Manual mode stores any cell.
--
-- Grade categories & sub-kinds (see docs/GarSpec_Grading_Profiles_Reference.md):
-- every POM is tagged with a grade_category; `small` POMs additionally carry a
-- sub_kind (shoulder/neck/cuff_opening/rise/strap) because the reference gives
-- each small point its own increment. Inseam is modelled as `fixed` +
-- sub_kind 'inseam': profiles carry an explicit `inseam` increment key
-- (adults 0 — inseam doesn't grade; youth 2.5 — it does), so the youth-inseam
-- nuance lives in profile DATA, not an engine special case.
--
-- Profile increment/tolerance jsonb key contract (read by lib/grading-engine.ts):
--   increments: primary_girth, secondary_girth, body_length, limb_length,
--               small_shoulder, small_neck, small_cuff_opening, small_rise,
--               small_strap, inseam           (missing key → increment 0)
--   tolerances: primary_girth, secondary_girth, body_length, limb_length,
--               small, fixed                  (per point-type, ± cm)
--
-- Seeds: templates in 0034, profiles in 0035, section rename in 0036.
-- ============================================================================

-- ---- Enum types --------------------------------------------------------------
do $$ begin
  create type public.spec_template_category as enum (
    'tops', 'bottoms', 'outerwear', 'performance', 'womenswear', 'accessories'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.spec_grade_category as enum (
    'primary_girth', 'secondary_girth', 'body_length', 'limb_length',
    'small', 'fixed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.spec_pom_sub_kind as enum (
    'shoulder', 'neck', 'cuff_opening', 'rise', 'strap', 'inseam'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.spec_sheet_mode as enum ('auto', 'manual');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.spec_fabric_type as enum ('knit', 'woven');
exception when duplicate_object then null;
end $$;

-- ---- spec_templates ----------------------------------------------------------
-- Garment-type starting points for the "Choose Spec Template" picker. Global
-- rows are the 20-template starter set (+2 optional accessories) from
-- docs/GarSpec_Spec_Templates_Reference.md; workspace rows are custom.
create table if not exists public.spec_templates (
  id           uuid primary key default gen_random_uuid(),
  source       public.library_source not null,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name         text not null,
  category     public.spec_template_category not null,
  description  text,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint spec_templates_source_workspace_ck check (
    (source = 'global'    and workspace_id is null) or
    (source = 'workspace' and workspace_id is not null)
  )
);

-- ---- spec_template_poms --------------------------------------------------------
-- A template's points of measure. `code` (POM1…) keeps the sheet and any future
-- diagram in sync; `how_to_measure` feeds the per-row hint tooltip. The CHECK
-- enforces the sub_kind contract: small POMs must say WHICH small point they
-- are; fixed POMs may be tagged 'inseam' (the only fixed point that grades on
-- youth profiles); every other category carries no sub_kind.
create table if not exists public.spec_template_poms (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references public.spec_templates (id) on delete cascade,
  code           text not null,
  name           text not null,
  how_to_measure text,
  grade_category public.spec_grade_category not null,
  sub_kind       public.spec_pom_sub_kind,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (template_id, code),
  constraint spec_template_poms_sub_kind_ck check (
    (grade_category = 'small' and sub_kind in ('shoulder', 'neck', 'cuff_opening', 'rise', 'strap')) or
    (grade_category = 'fixed' and (sub_kind is null or sub_kind = 'inseam')) or
    (grade_category not in ('small', 'fixed') and sub_kind is null)
  )
);

-- ---- grading_profiles ----------------------------------------------------------
-- Per-category increment rules that turn one sample column into a full graded
-- sheet. `size_run_labels` is the profile's default/reference run only — the
-- sheet's actual columns always come from the PRODUCT's size range (increments
-- are per step, not per label). `break_size_label` marks where the extended
-- increments kick in (steps whose UPPER size sits at/above it); null = no
-- break (youth). `extended_increments` may carry only the keys that differ
-- from base — the engine falls back per key.
create table if not exists public.grading_profiles (
  id                  uuid primary key default gen_random_uuid(),
  source              public.library_source not null,
  workspace_id        uuid references public.workspaces (id) on delete cascade,
  name                text not null,
  description         text,
  size_run_labels     text[] not null default '{}',
  break_size_label    text,
  base_increments     jsonb not null default '{}'::jsonb,
  extended_increments jsonb,
  tolerances_knit     jsonb not null default '{}'::jsonb,
  tolerances_woven    jsonb not null default '{}'::jsonb,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint grading_profiles_source_workspace_ck check (
    (source = 'global'    and workspace_id is null) or
    (source = 'workspace' and workspace_id is not null)
  )
);

-- ---- product_spec_sheets -------------------------------------------------------
-- One sheet per product. `template_name` is a display snapshot for the summary
-- bar so it survives template deletion (`template_id` goes null). In manual
-- mode `grading_profile_id` is irrelevant but kept, so switching back to auto
-- restores the last profile. `fabric_type` picks which tolerance set applies
-- (knit vs woven, per the reference). Unit is cm in V1.
create table if not exists public.product_spec_sheets (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null unique references public.products (id) on delete cascade,
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  template_id        uuid references public.spec_templates (id) on delete set null,
  template_name      text,
  mode               public.spec_sheet_mode not null default 'auto',
  sample_size_label  text,
  grading_profile_id uuid references public.grading_profiles (id) on delete set null,
  fabric_type        public.spec_fabric_type not null default 'knit',
  unit               text not null default 'cm',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---- product_spec_rows ---------------------------------------------------------
-- The sheet's POM rows — copied from the template at creation (or added by the
-- user) so they're product-owned and fully editable without touching the
-- template. `tolerance_override` (± cm) beats the profile's category default
-- when set. Same sub_kind CHECK as template POMs.
create table if not exists public.product_spec_rows (
  id                 uuid primary key default gen_random_uuid(),
  sheet_id           uuid not null references public.product_spec_sheets (id) on delete cascade,
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  code               text not null,
  name               text not null,
  how_to_measure     text,
  grade_category     public.spec_grade_category not null,
  sub_kind           public.spec_pom_sub_kind,
  tolerance_override numeric,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint product_spec_rows_sub_kind_ck check (
    (grade_category = 'small' and sub_kind in ('shoulder', 'neck', 'cuff_opening', 'rise', 'strap')) or
    (grade_category = 'fixed' and (sub_kind is null or sub_kind = 'inseam')) or
    (grade_category not in ('small', 'fixed') and sub_kind is null)
  )
);

-- ---- product_spec_values -------------------------------------------------------
-- Stored cell values, keyed (row, size label). Auto mode stores ONLY the
-- sample column; computed sizes are never persisted. Manual mode stores any
-- cell. `sheet_id` is denormalised so a sheet's values load in one query
-- without joining through rows.
create table if not exists public.product_spec_values (
  id           uuid primary key default gen_random_uuid(),
  sheet_id     uuid not null references public.product_spec_sheets (id) on delete cascade,
  row_id       uuid not null references public.product_spec_rows (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  size_label   text not null,
  value        numeric not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (row_id, size_label)
);

-- ---- Indexes -----------------------------------------------------------------
create index if not exists idx_spec_templates_workspace     on public.spec_templates (workspace_id);
create index if not exists idx_spec_templates_source        on public.spec_templates (source);
create index if not exists idx_spec_template_poms_template  on public.spec_template_poms (template_id);
create index if not exists idx_grading_profiles_workspace   on public.grading_profiles (workspace_id);
create index if not exists idx_grading_profiles_source      on public.grading_profiles (source);
create index if not exists idx_product_spec_sheets_product  on public.product_spec_sheets (product_id);
create index if not exists idx_product_spec_rows_sheet      on public.product_spec_rows (sheet_id);
create index if not exists idx_product_spec_values_sheet    on public.product_spec_values (sheet_id);
create index if not exists idx_product_spec_values_row      on public.product_spec_values (row_id);

-- ---- updated_at maintenance (reuse public.set_updated_at from 0002) ----------
drop trigger if exists trg_spec_templates_updated_at on public.spec_templates;
create trigger trg_spec_templates_updated_at
  before update on public.spec_templates
  for each row execute function public.set_updated_at();

drop trigger if exists trg_grading_profiles_updated_at on public.grading_profiles;
create trigger trg_grading_profiles_updated_at
  before update on public.grading_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_product_spec_sheets_updated_at on public.product_spec_sheets;
create trigger trg_product_spec_sheets_updated_at
  before update on public.product_spec_sheets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_product_spec_rows_updated_at on public.product_spec_rows;
create trigger trg_product_spec_rows_updated_at
  before update on public.product_spec_rows
  for each row execute function public.set_updated_at();

drop trigger if exists trg_product_spec_values_updated_at on public.product_spec_values;
create trigger trg_product_spec_values_updated_at
  before update on public.product_spec_values
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — library tables mirror 0009 (Master Library) exactly: one select policy
-- admitting active globals + own-workspace rows; workspace writes require
-- source='workspace'; global writes require public.is_platform_admin() (0009).
-- Seeded rows are therefore read-only for workspace users — duplicate-to-edit
-- happens in app code by inserting a workspace copy. Product tables use the
-- standard direct workspace-match policy (0019 canvas_colourways pattern).
-- ============================================================================

-- ---- spec_templates RLS --------------------------------------------------------
alter table public.spec_templates enable row level security;

drop policy if exists "spec_templates_select_visible" on public.spec_templates;
create policy "spec_templates_select_visible"
  on public.spec_templates for select to authenticated
  using (
    (source = 'global' and is_active = true)
    or workspace_id = public.auth_workspace_id()
  );

drop policy if exists "spec_templates_insert_workspace" on public.spec_templates;
create policy "spec_templates_insert_workspace"
  on public.spec_templates for insert to authenticated
  with check (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "spec_templates_update_workspace" on public.spec_templates;
create policy "spec_templates_update_workspace"
  on public.spec_templates for update to authenticated
  using (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  )
  with check (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "spec_templates_delete_workspace" on public.spec_templates;
create policy "spec_templates_delete_workspace"
  on public.spec_templates for delete to authenticated
  using (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "spec_templates_insert_global_admin" on public.spec_templates;
create policy "spec_templates_insert_global_admin"
  on public.spec_templates for insert to authenticated
  with check (source = 'global' and public.is_platform_admin());

drop policy if exists "spec_templates_update_global_admin" on public.spec_templates;
create policy "spec_templates_update_global_admin"
  on public.spec_templates for update to authenticated
  using (source = 'global' and public.is_platform_admin())
  with check (source = 'global' and public.is_platform_admin());

drop policy if exists "spec_templates_delete_global_admin" on public.spec_templates;
create policy "spec_templates_delete_global_admin"
  on public.spec_templates for delete to authenticated
  using (source = 'global' and public.is_platform_admin());

-- ---- spec_template_poms RLS ----------------------------------------------------
-- Child of spec_templates — parent-lookup policies (0014 canvas_slots pattern),
-- mirroring the parent's visibility/write rules.
alter table public.spec_template_poms enable row level security;

drop policy if exists "spec_template_poms_select_visible" on public.spec_template_poms;
create policy "spec_template_poms_select_visible"
  on public.spec_template_poms for select to authenticated
  using (
    exists (
      select 1 from public.spec_templates t
      where t.id = spec_template_poms.template_id
        and (
          (t.source = 'global' and t.is_active = true)
          or t.workspace_id = public.auth_workspace_id()
        )
    )
  );

drop policy if exists "spec_template_poms_write_workspace" on public.spec_template_poms;
create policy "spec_template_poms_write_workspace"
  on public.spec_template_poms for all to authenticated
  using (
    exists (
      select 1 from public.spec_templates t
      where t.id = spec_template_poms.template_id
        and t.source = 'workspace'
        and t.workspace_id = public.auth_workspace_id()
    )
  )
  with check (
    exists (
      select 1 from public.spec_templates t
      where t.id = spec_template_poms.template_id
        and t.source = 'workspace'
        and t.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "spec_template_poms_write_global_admin" on public.spec_template_poms;
create policy "spec_template_poms_write_global_admin"
  on public.spec_template_poms for all to authenticated
  using (
    exists (
      select 1 from public.spec_templates t
      where t.id = spec_template_poms.template_id
        and t.source = 'global'
    )
    and public.is_platform_admin()
  )
  with check (
    exists (
      select 1 from public.spec_templates t
      where t.id = spec_template_poms.template_id
        and t.source = 'global'
    )
    and public.is_platform_admin()
  );

-- ---- grading_profiles RLS ------------------------------------------------------
alter table public.grading_profiles enable row level security;

drop policy if exists "grading_profiles_select_visible" on public.grading_profiles;
create policy "grading_profiles_select_visible"
  on public.grading_profiles for select to authenticated
  using (
    (source = 'global' and is_active = true)
    or workspace_id = public.auth_workspace_id()
  );

drop policy if exists "grading_profiles_insert_workspace" on public.grading_profiles;
create policy "grading_profiles_insert_workspace"
  on public.grading_profiles for insert to authenticated
  with check (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "grading_profiles_update_workspace" on public.grading_profiles;
create policy "grading_profiles_update_workspace"
  on public.grading_profiles for update to authenticated
  using (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  )
  with check (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "grading_profiles_delete_workspace" on public.grading_profiles;
create policy "grading_profiles_delete_workspace"
  on public.grading_profiles for delete to authenticated
  using (
    source = 'workspace' and workspace_id = public.auth_workspace_id()
  );

drop policy if exists "grading_profiles_insert_global_admin" on public.grading_profiles;
create policy "grading_profiles_insert_global_admin"
  on public.grading_profiles for insert to authenticated
  with check (source = 'global' and public.is_platform_admin());

drop policy if exists "grading_profiles_update_global_admin" on public.grading_profiles;
create policy "grading_profiles_update_global_admin"
  on public.grading_profiles for update to authenticated
  using (source = 'global' and public.is_platform_admin())
  with check (source = 'global' and public.is_platform_admin());

drop policy if exists "grading_profiles_delete_global_admin" on public.grading_profiles;
create policy "grading_profiles_delete_global_admin"
  on public.grading_profiles for delete to authenticated
  using (source = 'global' and public.is_platform_admin());

-- ---- product sheet tables RLS ---------------------------------------------------
-- Direct workspace match for reads, PLUS a parent-ownership check in every
-- WITH CHECK (the 0014 canvas_slots pattern). The parent check matters:
-- foreign-key validation bypasses RLS, so without it a user could insert a
-- row claiming ANOTHER workspace's product_id/sheet_id/row_id while stamping
-- their own workspace_id — and because product_spec_sheets.product_id is
-- UNIQUE, a squatted (invisible, undeletable) sheet would permanently block
-- the rightful owner from ever creating theirs.
alter table public.product_spec_sheets enable row level security;

drop policy if exists "product_spec_sheets_all_member" on public.product_spec_sheets;
create policy "product_spec_sheets_all_member"
  on public.product_spec_sheets for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (
    workspace_id = public.auth_workspace_id()
    and exists (
      select 1 from public.products p
      where p.id = product_spec_sheets.product_id
        and p.workspace_id = public.auth_workspace_id()
    )
  );

alter table public.product_spec_rows enable row level security;

drop policy if exists "product_spec_rows_all_member" on public.product_spec_rows;
create policy "product_spec_rows_all_member"
  on public.product_spec_rows for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (
    workspace_id = public.auth_workspace_id()
    and exists (
      select 1 from public.product_spec_sheets s
      where s.id = product_spec_rows.sheet_id
        and s.workspace_id = public.auth_workspace_id()
    )
  );

alter table public.product_spec_values enable row level security;

drop policy if exists "product_spec_values_all_member" on public.product_spec_values;
create policy "product_spec_values_all_member"
  on public.product_spec_values for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (
    workspace_id = public.auth_workspace_id()
    and exists (
      select 1 from public.product_spec_sheets s
      where s.id = product_spec_values.sheet_id
        and s.workspace_id = public.auth_workspace_id()
    )
    and exists (
      select 1 from public.product_spec_rows r
      where r.id = product_spec_values.row_id
        and r.workspace_id = public.auth_workspace_id()
    )
  );
