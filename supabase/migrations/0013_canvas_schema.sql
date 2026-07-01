-- ============================================================================
-- 0013 — Canvas schema (idempotent / safe to re-run)
-- The shared canvas system behind three tech-pack sections (Design & Colourways,
-- Measurements & Fit, Construction Details). A product owns reusable image
-- ASSETS; canvas PAGES use a layout template (single/split/quad) made of SLOTS;
-- each filled + locked slot carries typed ANNOTATION pins. Pin coordinates are
-- stored as 0.0-1.0 fractions of the slot (resolution-independent, so the same
-- data drives responsive display and PDF export at any DPI). RLS lands in 0014;
-- the Storage bucket + policies in 0015.
-- ============================================================================

-- ---- Enum types --------------------------------------------------------------
do $$ begin
  create type public.canvas_template as enum ('single', 'split', 'quad');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.canvas_layer_type as enum (
    'fabric', 'trim', 'hardware', 'elastic', 'label_component', 'print',
    'stitch', 'thread', 'packaging', 'measurement', 'construction_note',
    'detail_callout'
  );
exception when duplicate_object then null;
end $$;

-- ---- product_assets ----------------------------------------------------------
-- A product's reusable image library (uploaded once, dropped into many slots).
-- Binaries live in the private `product-assets` Storage bucket (0015); this row
-- holds the metadata + resolved URL. `file_path` is the Storage object key
-- ({workspace_id}/{product_id}/{timestamp}_{filename}) used for deletion.
create table if not exists public.product_assets (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  file_path    text not null,
  file_url     text not null,
  width        integer,
  height       integer,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---- canvas_pages ------------------------------------------------------------
-- One layout page within a product's canvas. `template` fixes the slot count;
-- `sort_order` orders pages within the product.
create table if not exists public.canvas_pages (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  template     public.canvas_template not null,
  label        text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---- canvas_slots ------------------------------------------------------------
-- One image cell of a page (single=1, split=2, quad=4). `asset_id` is the chosen
-- image (null = empty); `crop_x/crop_y/zoom` frame it within the cell; locking a
-- slot gates annotation. UNIQUE keeps slot_index stable per page.
create table if not exists public.canvas_slots (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.canvas_pages (id) on delete cascade,
  slot_index  integer not null,
  asset_id    uuid references public.product_assets (id) on delete set null,
  crop_x      numeric not null default 0,
  crop_y      numeric not null default 0,
  zoom        numeric not null default 1,
  is_locked   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (page_id, slot_index)
);

-- ---- canvas_annotations ------------------------------------------------------
-- Typed pins on a locked slot. `x/y` (and `end_x/end_y` for two-point line pins)
-- are 0.0-1.0 fractions of the slot's rendered size. `reference_code` (F1, T3,
-- M1...) is assigned per product per layer_type by the createAnnotation server
-- action and is the join key into the generated BOM / measurement / construction
-- tables. `data` jsonb carries the per-layer payload (library item, composition,
-- gsm, measurement value/tolerance, stitch spi...) so layers stay schemaless.
create table if not exists public.canvas_annotations (
  id             uuid primary key default gen_random_uuid(),
  slot_id        uuid not null references public.canvas_slots (id) on delete cascade,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  layer_type     public.canvas_layer_type not null,
  reference_code text not null,
  x              numeric not null,
  y              numeric not null,
  pin_type       text not null default 'point',  -- 'point' | 'line'
  end_x          numeric,
  end_y          numeric,
  data           jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---- Indexes -----------------------------------------------------------------
create index if not exists idx_product_assets_product       on public.product_assets (product_id);
create index if not exists idx_canvas_pages_product         on public.canvas_pages (product_id);
create index if not exists idx_canvas_slots_page            on public.canvas_slots (page_id);
create index if not exists idx_canvas_annotations_slot      on public.canvas_annotations (slot_id);
create index if not exists idx_canvas_annotations_workspace on public.canvas_annotations (workspace_id);
create index if not exists idx_canvas_annotations_layer     on public.canvas_annotations (layer_type);

-- ---- updated_at maintenance (reuse public.set_updated_at from 0002) ----------
drop trigger if exists trg_canvas_pages_updated_at on public.canvas_pages;
create trigger trg_canvas_pages_updated_at
  before update on public.canvas_pages
  for each row execute function public.set_updated_at();

drop trigger if exists trg_canvas_annotations_updated_at on public.canvas_annotations;
create trigger trg_canvas_annotations_updated_at
  before update on public.canvas_annotations
  for each row execute function public.set_updated_at();
