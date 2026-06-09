-- ============================================================================
-- 0001 — Enums and tables (idempotent / safe to re-run)
-- The full relational hierarchy for TechPackApp. Tenant isolation is by
-- `workspace_id`; child tables without one (product_sections) resolve via their
-- parent. RLS is enabled in 0003.
-- ============================================================================

-- ---- Enum types --------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('owner', 'editor', 'viewer', 'factory');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_status as enum (
    'draft', 'in_review', 'sent_to_factory', 'sample_received', 'approved', 'in_production'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.section_status as enum ('not_started', 'in_progress', 'complete');
exception when duplicate_object then null;
end $$;

-- ---- workspaces --------------------------------------------------------------
-- One licensed account. Billing/licensing attaches here later.
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---- profiles ----------------------------------------------------------------
-- 1:1 with auth.users (id is both PK and FK). Auto-created by the trigger in 0002.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  full_name    text,
  role         public.user_role not null default 'owner',
  created_at   timestamptz not null default now()
);

-- ---- brands ------------------------------------------------------------------
create table if not exists public.brands (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  logo_url     text,
  created_at   timestamptz not null default now()
);

-- ---- seasons -----------------------------------------------------------------
create table if not exists public.seasons (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  year         integer not null,
  created_at   timestamptz not null default now()
);

-- ---- collections -------------------------------------------------------------
create table if not exists public.collections (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id     uuid not null references public.brands (id) on delete cascade,
  season_id    uuid references public.seasons (id) on delete set null,
  name         text not null,
  created_at   timestamptz not null default now()
);

-- ---- products ----------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  brand_id      uuid references public.brands (id) on delete set null,
  collection_id uuid references public.collections (id) on delete set null,
  name          text not null,
  style_number  text,
  category      text,
  gender        text,
  size_range    text,
  status        public.product_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---- section_templates -------------------------------------------------------
-- Global, read-only reference data (the V1 section catalogue). Seeded in 0004.
create table if not exists public.section_templates (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique,
  label              text not null,
  icon               text not null,
  default_sort_order integer not null default 0,
  is_default         boolean not null default true
);

-- ---- product_sections --------------------------------------------------------
-- One row per enabled section per product. `data` holds the section's content
-- so sections stay flexible without per-section schemas.
create table if not exists public.product_sections (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  section_key text not null references public.section_templates (key) on update cascade,
  status      public.section_status not null default 'not_started',
  sort_order  integer not null default 0,
  is_enabled  boolean not null default true,
  data        jsonb not null default '{}'::jsonb,
  unique (product_id, section_key)
);

-- ---- Indexes (tenant filters + foreign keys) ---------------------------------
create index if not exists idx_profiles_workspace       on public.profiles (workspace_id);
create index if not exists idx_brands_workspace          on public.brands (workspace_id);
create index if not exists idx_seasons_workspace         on public.seasons (workspace_id);
create index if not exists idx_collections_workspace     on public.collections (workspace_id);
create index if not exists idx_collections_brand         on public.collections (brand_id);
create index if not exists idx_products_workspace        on public.products (workspace_id);
create index if not exists idx_products_brand            on public.products (brand_id);
create index if not exists idx_products_collection       on public.products (collection_id);
create index if not exists idx_product_sections_product  on public.product_sections (product_id);
create index if not exists idx_product_sections_key      on public.product_sections (section_key);
