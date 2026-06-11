-- ============================================================================
-- 0008 - Master Library schema (idempotent / safe to re-run)
-- The two-layer reusable component library: a GLOBAL catalogue maintained by
-- TechPackApp platform admins (fabrics, trims, fasteners, stitch types, ...) plus
-- a per-WORKSPACE custom layer. Workspaces can hide individual global items via
-- workspace_library_toggles but can never edit/delete them. RLS lives in 0009;
-- global seed data (incl. stitch SVGs) lands in 0010.
-- ============================================================================

-- ---- Enum types --------------------------------------------------------------
do $$ begin
  create type public.library_category as enum (
    'fabric', 'trim', 'fastener', 'elastic', 'stitch_type',
    'thread', 'label_type', 'print_type', 'packaging', 'interlining'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.library_source as enum ('global', 'workspace');
exception when duplicate_object then null;
end $$;

-- ---- platform_admins ---------------------------------------------------------
-- TechPackApp staff who may write GLOBAL library rows. Populated manually in
-- Supabase (service role bypasses RLS); there is no in-app admin route in 3b.
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---- library_items -----------------------------------------------------------
-- One row per reusable component. `source` discriminates global vs workspace;
-- the CHECK ties workspace_id to that choice. `properties` holds the
-- category-specific fields (composition/gsm for fabrics, brand/gauge for zips...)
-- so categories stay flexible without per-category schemas. `image_url` carries
-- the stitch-diagram SVG (stored inline as a data URI) for stitch_type rows.
create table if not exists public.library_items (
  id           uuid primary key default gen_random_uuid(),
  category     public.library_category not null,
  source       public.library_source not null,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  properties   jsonb not null default '{}'::jsonb,
  image_url    text,
  is_active    boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint library_items_source_workspace_ck check (
    (source = 'global'    and workspace_id is null) or
    (source = 'workspace' and workspace_id is not null)
  )
);

-- ---- workspace_library_toggles ----------------------------------------------
-- Per-workspace hide flag for GLOBAL items. A row with hidden = true removes the
-- referenced global item from that workspace's resolved library. Absence of a
-- row means the global item is visible (visible-by-default).
create table if not exists public.workspace_library_toggles (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  library_item_id uuid not null references public.library_items (id) on delete cascade,
  hidden          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (workspace_id, library_item_id)
);

-- ---- Indexes -----------------------------------------------------------------
create index if not exists idx_library_items_category  on public.library_items (category);
create index if not exists idx_library_items_workspace on public.library_items (workspace_id);
create index if not exists idx_library_items_source    on public.library_items (source);
create index if not exists idx_wl_toggles_workspace    on public.workspace_library_toggles (workspace_id);
create index if not exists idx_wl_toggles_item         on public.workspace_library_toggles (library_item_id);

-- ---- updated_at maintenance (reuse public.set_updated_at from 0002) ----------
drop trigger if exists trg_library_items_updated_at on public.library_items;
create trigger trg_library_items_updated_at
  before update on public.library_items
  for each row execute function public.set_updated_at();
