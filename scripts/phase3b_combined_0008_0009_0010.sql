-- ============================================================================
-- COMBINED Phase 3b migrations: 0008 + 0009 + 0010 (apply in one paste)
-- Pure ASCII. Idempotent. Requires migrations 0001-0007 already applied.
-- Wrapped in a single transaction: if anything fails, nothing is committed.
-- ============================================================================
begin;

-- >>>>>>>>>> 0008_library_schema.sql >>>>>>>>>>
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

-- >>>>>>>>>> 0009_library_rls.sql >>>>>>>>>>
-- ============================================================================
-- 0009 - Master Library Row Level Security (idempotent / safe to re-run)
-- Rules:
--   library_items
--     - SELECT: any authenticated user sees ACTIVE global items + their own
--       workspace's items.
--     - Workspace items: full CRUD only within the caller's workspace.
--     - Global items: write (insert/update/delete) only for platform admins.
--       Written as SEPARATE policies so a normal workspace user can NEVER touch
--       a global row - neither the workspace policies (they require
--       source='workspace') nor the global policies (they require
--       is_platform_admin()) admit a global write by a non-admin.
--   workspace_library_toggles: full CRUD scoped to the caller's workspace.
--   platform_admins: members may read their own row (and admins read all);
--       no authenticated write path - rows are added manually via service role.
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

-- >>>>>>>>>> 0010_library_seed.sql >>>>>>>>>>
-- ============================================================================
-- 0010 - Master Library global seed (idempotent / safe to re-run)
-- Seeds the activewear default catalogue: every row is source='global',
-- workspace_id=null, is_active=true, created_by=null. Each insert is guarded by
-- `where not exists (... source='global' and category=... and name=...)` so
-- re-running never duplicates.
--
-- Colourways: fabrics/trims/zips/buttons/elastics/drawcords/thread carry a
-- `colours` array of {name, pantone_tcx, hex} under properties.colours (the
-- single standardized colour key - the seed list's per-category `colour_options`
-- field is folded into this). Seeded with the four common defaults
-- (Black / White / Navy / Volt); workspaces layer their own colourways on top.
--
-- Stitch types: the 14 stitch_type rows store a distinct 2-colour SVG diagram
-- (fabric #6B7280, stitch path #C8F000, 120x80 viewBox) inline in image_url as a
-- pre-computed base64 data URI (data:image/svg+xml;base64,...) stored as a plain
-- SQL string literal - no dollar-quoting, compatible with all SQL editors.
-- ============================================================================

-- ---- Category 1 - Fabrics (all carry colours) --------------------------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'fabric'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('Performance Poly Jersey','Moisture-wicking 4-way stretch single jersey for performance base and mid layers.','{"composition":"92% Polyester / 8% Elastane","gsm":180,"width_cm":150,"construction":"Single Jersey Knit","finish":"Moisture-wicking","stretch":"4-way"}'),
  ('Double Knit Scuba','Structured 2-way stretch double knit with body for moulded silhouettes.','{"composition":"95% Polyester / 5% Elastane","gsm":280,"width_cm":150,"construction":"Double Knit","finish":"Structured","stretch":"2-way"}'),
  ('Brushed Back Fleece','Cotton-rich loopback fleece with a brushed interior for warmth.','{"composition":"80% Cotton / 20% Polyester","gsm":320,"width_cm":180,"construction":"Loopback Fleece","finish":"Brushed interior","stretch":"None"}'),
  ('Tech Fleece Bonded','Bonded 3-layer technical fleece, warm and water-resistant.','{"composition":"100% Polyester","gsm":300,"width_cm":150,"construction":"Bonded 3-layer","finish":"Water-resistant","stretch":"None"}'),
  ('Power Mesh','Breathable 4-way stretch warp-knit mesh for panels and linings.','{"composition":"80% Nylon / 20% Elastane","gsm":130,"width_cm":150,"construction":"Warp Knit Mesh","finish":"Breathable","stretch":"4-way"}'),
  ('Birdseye Mesh','Quick-dry birdseye knit for breathable performance tops.','{"composition":"100% Polyester","gsm":140,"width_cm":160,"construction":"Birdseye Knit","finish":"Quick-dry","stretch":"None"}'),
  ('Ripstop Nylon','Lightweight DWR-coated ripstop woven for shells and outerwear.','{"composition":"100% Nylon","gsm":70,"width_cm":145,"construction":"Ripstop Woven","finish":"DWR coated","stretch":"None"}'),
  ('4-Way Stretch Woven','DWR-coated 4-way stretch woven for shorts and bottoms.','{"composition":"88% Polyester / 12% Elastane","gsm":200,"width_cm":145,"construction":"Plain Weave","finish":"DWR coated","stretch":"4-way"}'),
  ('Single Jersey Cotton','Combed 100% cotton single jersey for soft everyday tees.','{"composition":"100% Cotton","gsm":160,"width_cm":180,"construction":"Single Jersey","finish":"Combed","stretch":"None"}'),
  ('French Terry','Soft 2-way stretch French terry for joggers and crews.','{"composition":"95% Cotton / 5% Elastane","gsm":280,"width_cm":180,"construction":"French Terry Knit","finish":"Soft handle","stretch":"2-way"}'),
  ('Rib Knit 2x2','Tubular 2x2 rib for cuffs, collars and waistbands.','{"composition":"95% Cotton / 5% Elastane","gsm":240,"width_cm":90,"construction":"2x2 Rib","finish":"Tubular","stretch":"2-way"}'),
  ('Softshell 3-Layer','Wind- and water-resistant bonded softshell with 2-way stretch.','{"composition":"94% Polyester / 6% Elastane","gsm":310,"width_cm":150,"construction":"Bonded Softshell","finish":"Wind/water-resistant","stretch":"2-way"}'),
  ('Recycled Poly Jersey','GRS-certified recycled polyester single jersey, moisture-wicking.','{"composition":"100% Recycled Polyester (GRS)","gsm":175,"width_cm":150,"construction":"Single Jersey","finish":"Moisture-wicking","stretch":"None"}'),
  ('Honeycomb Knit','Textured 4-way stretch honeycomb knit with surface interest.','{"composition":"90% Polyester / 10% Elastane","gsm":220,"width_cm":150,"construction":"Honeycomb Knit","finish":"Textured","stretch":"4-way"}'),
  ('Interlock Smooth','Smooth-face 4-way stretch interlock for premium activewear.','{"composition":"92% Polyester / 8% Elastane","gsm":200,"width_cm":160,"construction":"Interlock Knit","finish":"Smooth face","stretch":"4-way"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'fabric'::public.library_category and li.name = v.name
);

-- ---- Category 2 - Trims & Tapes (textile trims carry colours) -----------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'trim'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description,
       case when v.wc then v.props::jsonb || jsonb_build_object('colours', cols.c) else v.props::jsonb end,
       true, null
from (values
  ('Branded Woven Neck Tape','Logo-printable woven neck tape for interior branding.','{"width_mm":20,"composition":"100% Polyester"}', true),
  ('Herringbone Twill Tape','Cotton herringbone twill tape for seam reinforcement.','{"width_mm":15,"composition":"100% Cotton"}', true),
  ('Fold-Over Binding','Stretch nylon fold-over binding for clean edges.','{"width_mm":20,"composition":"96% Nylon / 4% Elastane"}', true),
  ('Reflective Tape','Hi-vis TPU reflective tape with glass-bead surface.','{"width_mm":10,"composition":"TPU / Glass bead"}', false),
  ('Elastic Bias Binding','Stretch bias binding for neckline and armhole finishing.','{"width_mm":18,"composition":"90% Polyester / 10% Elastane"}', true),
  ('Grosgrain Ribbon','Polyester grosgrain ribbon for zip facing and detailing.','{"width_mm":25,"composition":"100% Polyester"}', true)
) as v(name, description, props, wc)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'trim'::public.library_category and li.name = v.name
);

-- ---- Category 3 - Fasteners & Hardware: zips + buttons/snaps (carry colours) --
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'fastener'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('YKK Coil Auto-Lock #3','YKK #3 nylon coil zip with auto-lock slider, matte finish.','{"brand":"YKK","zip_type":"Nylon Coil","gauge":"#3","pull_type":"Auto-lock slider","finish":"Matte"}'),
  ('YKK Coil Auto-Lock #5','YKK #5 nylon coil zip with auto-lock slider, matte finish.','{"brand":"YKK","zip_type":"Nylon Coil","gauge":"#5","pull_type":"Auto-lock slider","finish":"Matte"}'),
  ('YKK Vislon Moulded #5','YKK #5 Vislon moulded plastic zip, gloss finish.','{"brand":"YKK","zip_type":"Moulded Plastic","gauge":"#5","pull_type":"Auto-lock slider","finish":"Gloss"}'),
  ('YKK AquaGuard #5','YKK #5 AquaGuard water-resistant coil zip, matte finish.','{"brand":"YKK","zip_type":"Water-resistant Coil","gauge":"#5","pull_type":"Auto-lock slider","finish":"Matte"}'),
  ('YKK Metal Brass #5','YKK #5 metal brass zip with DA slider, antique brass finish.','{"brand":"YKK","zip_type":"Metal","gauge":"#5","pull_type":"DA slider","finish":"Antique brass"}'),
  ('YKK Two-Way Separating #5','YKK #5 two-way separating coil zip with dual auto-lock sliders.','{"brand":"YKK","zip_type":"Nylon Coil","gauge":"#5","pull_type":"Dual auto-lock","finish":"Matte"}'),
  ('RiRi Metal #6','RiRi #6 premium metal zip with polished puller.','{"brand":"RiRi","zip_type":"Metal","gauge":"#6","pull_type":"Premium puller","finish":"Polished"}'),
  ('Shank Button 18L','18-ligne nylon shank button, matte finish.','{"ligne":"18L","button_type":"Shank","material":"Nylon","finish":"Matte"}'),
  ('Sew-Through 24L','24-ligne 4-hole corozo button, natural finish.','{"ligne":"24L","button_type":"4-hole","material":"Corozo","finish":"Natural"}'),
  ('Ring Snap 15mm','15mm brass ring press stud, nickel-free.','{"size_mm":15,"button_type":"Press stud","material":"Brass","finish":"Nickel-free"}'),
  ('Jersey Snap 12mm','12mm brass jersey press stud, matte black.','{"size_mm":12,"button_type":"Press stud","material":"Brass","finish":"Matte black"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'fastener'::public.library_category and li.name = v.name
);

-- ---- Category 3 - Other hardware (no colours) --------------------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'fastener'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Cord Lock Toggle','20mm acetal cord-lock toggle, black.','{"size_mm":20,"material":"Acetal","finish":"Black"}'),
  ('Tri-Glide Adjuster','25mm acetal tri-glide strap adjuster, black.','{"size_mm":25,"material":"Acetal","finish":"Black"}'),
  ('D-Ring','25mm zinc-alloy D-ring, matte black.','{"size_mm":25,"material":"Zinc alloy","finish":"Matte black"}'),
  ('Ladder Lock Buckle','25mm acetal ladder-lock buckle, black.','{"size_mm":25,"material":"Acetal","finish":"Black"}'),
  ('Metal Eyelet','5mm brass eyelet, gunmetal finish.','{"size_mm":5,"material":"Brass","finish":"Gunmetal"}'),
  ('Drawcord End Aglet','4mm metal drawcord aglet, silver.','{"size_mm":4,"material":"Metal","finish":"Silver"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'fastener'::public.library_category and li.name = v.name
);

-- ---- Category 4 - Elastics & Cords (all carry colours) -----------------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'elastic'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('Flat Waistband Elastic 30mm','30mm flat woven waistband elastic, 130% stretch.','{"width_mm":30,"elastic_type":"Flat woven","stretch_pct":130,"composition":"65% Polyester / 35% Rubber"}'),
  ('Flat Waistband Elastic 40mm','40mm flat woven waistband elastic, 130% stretch.','{"width_mm":40,"elastic_type":"Flat woven","stretch_pct":130,"composition":"65% Polyester / 35% Rubber"}'),
  ('Branded Jacquard Elastic','35mm logo-knittable jacquard waistband elastic, 120% stretch.','{"width_mm":35,"elastic_type":"Jacquard woven","stretch_pct":120,"composition":"Logo-knittable"}'),
  ('Fold-Over Elastic (FOE)','15mm fold-over elastic for edge finishing, 140% stretch.','{"width_mm":15,"elastic_type":"Fold-over","stretch_pct":140,"composition":"90% Poly / 10% Elastane"}'),
  ('Braided Cord Elastic','3mm braided cord elastic, 150% stretch.','{"width_mm":3,"elastic_type":"Braided","stretch_pct":150,"composition":"Polyester wrapped"}'),
  ('Round Drawcord 6mm','6mm round drawcord with metal aglet tips.','{"diameter_mm":6,"cord_type":"Round","composition":"Polyester","tip_type":"Metal aglet"}'),
  ('Round Drawcord 4mm','4mm round drawcord, heat-sealed tips.','{"diameter_mm":4,"cord_type":"Round","composition":"Polyester","tip_type":"Heat-sealed"}'),
  ('Flat Drawcord 8mm','8mm flat woven drawcord, heat-sealed tips.','{"diameter_mm":8,"cord_type":"Flat woven","composition":"Polyester","tip_type":"Heat-sealed"}'),
  ('Hollow Drawcord 5mm','5mm hollow-braid drawcord with metal aglet tips.','{"diameter_mm":5,"cord_type":"Hollow braid","composition":"Polyester","tip_type":"Metal aglet"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'elastic'::public.library_category and li.name = v.name
);

-- ---- Category 5 - Stitch & Seam Types (distinct SVG diagrams in image_url) ----
-- image_url values are pre-computed base64 data URIs (data:image/svg+xml;base64,...)
-- stored as plain SQL string literals to avoid dollar-quote tokeniser issues.
insert into public.library_items (category, source, workspace_id, name, description, properties, image_url, is_active, created_by)
select v.cat, v.src, v.ws, v.name, v.description, v.props, v.image_url, true, null
from (values
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Overlock (3-thread)',
   '3-thread overlock for edge finishing and seams on knits.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"504","use_case":"Edge finishing, seams"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjgiIHk9IjMzIiB3aWR0aD0iNzQiIGhlaWdodD0iMTQiIHJ4PSIxIiBmaWxsPSIjNkI3MjgwIi8+PGcgc3Ryb2tlPSIjQzhGMDAwIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNODIgMzAgQzEwMCAzMCAxMDAgNTAgODIgNTAiLz48cGF0aCBkPSJNNjQgMzAgTDgyIDUwIE02NCA1MCBMODIgMzAiLz48L2c+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Overlock (4-thread)',
   '4-thread overlock with safety stitch for durable stretch seams.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"514","use_case":"Stretch seams"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjgiIHk9IjMzIiB3aWR0aD0iNzQiIGhlaWdodD0iMTQiIHJ4PSIxIiBmaWxsPSIjNkI3MjgwIi8+PGcgc3Ryb2tlPSIjQzhGMDAwIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNODIgMzAgQzEwMCAzMCAxMDAgNTAgODIgNTAiLz48cGF0aCBkPSJNNjQgMzAgTDgyIDUwIE02NCA1MCBMODIgMzAiLz48cGF0aCBkPSJNMTQgNDAgTDYwIDQwIiBzdHJva2UtZGFzaGFycmF5PSI1IDQiLz48L2c+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Flatlock (top)',
   'Flatlock top stitch joining butted edges flat for athletic seams.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"607","use_case":"Flat seams, athletic"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjMwIiB3aWR0aD0iNTAiIGhlaWdodD0iMjAiIGZpbGw9IiM2QjcyODAiLz48cmVjdCB4PSI2NCIgeT0iMzAiIHdpZHRoPSI1MCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzZCNzI4MCIvPjxnIHN0cm9rZT0iI0M4RjAwMCIgc3Ryb2tlLXdpZHRoPSIyLjUiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PHBhdGggZD0iTTQ2IDM2IEw3NCAzNiBNNDYgNDQgTDc0IDQ0IE01MCAzNiBMNTAgNDQgTTU4IDM2IEw1OCA0NCBNNjIgMzYgTDYyIDQ0IE03MCAzNiBMNzAgNDQiLz48L2c+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Coverstitch (2-needle)',
   '2-needle coverstitch with looper underside for hems and necklines.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"406","use_case":"Hems, necklines"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjI4IiB3aWR0aD0iMTA4IiBoZWlnaHQ9IjI0IiBmaWxsPSIjNkI3MjgwIi8+PGcgc3Ryb2tlPSIjQzhGMDAwIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiPjxsaW5lIHgxPSIxMiIgeTE9IjM2IiB4Mj0iMTA4IiB5Mj0iMzYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGxpbmUgeDE9IjEyIiB5MT0iNDQiIHgyPSIxMDgiIHkyPSI0NCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNMTIgNDQgTDI0IDM2IEwzNiA0NCBMNDggMzYgTDYwIDQ0IEw3MiAzNiBMODQgNDQgTDk2IDM2IEwxMDggNDQiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2Utb3BhY2l0eT0iMC41Ii8+PC9nPjwvc3ZnPg=='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Coverstitch (3-needle)',
   '3-needle coverstitch for wide hems and binding.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"407","use_case":"Wide hems, binding"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjI2IiB3aWR0aD0iMTA4IiBoZWlnaHQ9IjI4IiBmaWxsPSIjNkI3MjgwIi8+PGcgc3Ryb2tlPSIjQzhGMDAwIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiPjxsaW5lIHgxPSIxMiIgeTE9IjMzIiB4Mj0iMTA4IiB5Mj0iMzMiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGxpbmUgeDE9IjEyIiB5MT0iNDAiIHgyPSIxMDgiIHkyPSI0MCIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48bGluZSB4MT0iMTIiIHkxPSI0NyIgeDI9IjEwOCIgeTI9IjQ3IiBzdHJva2Utd2lkdGg9IjIuNSIvPjxwYXRoIGQ9Ik0xMiA0NyBMMjQgMzMgTDM2IDQ3IEw0OCAzMyBMNjAgNDcgTDcyIDMzIEw4NCA0NyBMOTYgMzMgTDEwOCA0NyIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1vcGFjaXR5PSIwLjUiLz48L2c+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Single Needle Lockstitch',
   'Single-needle lockstitch for topstitching and general construction.',
   '{"spi_range":"8-12","thread_weight":80,"iso_code":"301","use_case":"Topstitch, general"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjMwIiB3aWR0aD0iMTA4IiBoZWlnaHQ9IjIwIiBmaWxsPSIjNkI3MjgwIi8+PGxpbmUgeDE9IjEyIiB5MT0iNDAiIHgyPSIxMDgiIHkyPSI0MCIgc3Ryb2tlPSIjQzhGMDAwIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1kYXNoYXJyYXk9IjggNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Double Needle Lockstitch',
   'Twin-needle lockstitch producing two parallel topstitch rows.',
   '{"spi_range":"8-12","thread_weight":80,"iso_code":"301x2","use_case":"Parallel topstitch"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjI4IiB3aWR0aD0iMTA4IiBoZWlnaHQ9IjI0IiBmaWxsPSIjNkI3MjgwIi8+PGcgc3Ryb2tlPSIjQzhGMDAwIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1kYXNoYXJyYXk9IjggNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48bGluZSB4MT0iMTIiIHkxPSIzNSIgeDI9IjEwOCIgeTI9IjM1Ii8+PGxpbmUgeDE9IjEyIiB5MT0iNDUiIHgyPSIxMDgiIHkyPSI0NSIvPjwvZz48L3N2Zz4='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Bartack',
   'Dense bartack reinforcement at stress points such as pocket corners.',
   '{"spi_range":"42 stitches","thread_weight":80,"iso_code":"304","use_case":"Stress points"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjMwIiB3aWR0aD0iMTA4IiBoZWlnaHQ9IjIwIiBmaWxsPSIjNkI3MjgwIi8+PGcgc3Ryb2tlPSIjQzhGMDAwIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik00MCAzNSBMODAgMzUgTTQwIDQ1IEw4MCA0NSIgc3Ryb2tlLXdpZHRoPSIyLjUiLz48cGF0aCBkPSJNNDIgMzUgTDQ2IDQ1IEw1MCAzNSBMNTQgNDUgTDU4IDM1IEw2MiA0NSBMNjYgMzUgTDcwIDQ1IEw3NCAzNSBMNzggNDUiIHN0cm9rZS13aWR0aD0iMi41Ii8+PC9nPjwvc3ZnPg=='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Chainstitch',
   'Single-thread chainstitch loop chain for seams and decorative rows.',
   '{"spi_range":"8-10","thread_weight":80,"iso_code":"401","use_case":"Seams, decorative"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjMwIiB3aWR0aD0iMTA4IiBoZWlnaHQ9IjIwIiBmaWxsPSIjNkI3MjgwIi8+PHBhdGggZD0iTTE0IDQwIGM0IC03IDE0IC03IDE4IDAgYzQgNyAxNCA3IDE4IDAgYzQgLTcgMTQgLTcgMTggMCBjNCA3IDE0IDcgMTggMCBjNCAtNyAxNCAtNyAxOCAwIiBmaWxsPSJub25lIiBzdHJva2U9IiNDOEYwMDAiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Zigzag',
   'Zigzag stitch used to attach elastic and for stretch seams.',
   '{"spi_range":"6-8","thread_weight":80,"iso_code":"304","use_case":"Elastic attach"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjYiIHk9IjI4IiB3aWR0aD0iMTA4IiBoZWlnaHQ9IjI0IiBmaWxsPSIjNkI3MjgwIi8+PHBhdGggZD0iTTEyIDQ4IEwyNCAzMiBMMzYgNDggTDQ4IDMyIEw2MCA0OCBMNzIgMzIgTDg0IDQ4IEw5NiAzMiBMMTA4IDQ4IiBmaWxsPSJub25lIiBzdHJva2U9IiNDOEYwMDAiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'French Seam',
   'Enclosed French seam hiding raw edges inside a folded bundle.',
   '{"spi_range":"10-12","thread_weight":80,"iso_code":null,"use_case":"Enclosed seam"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxwYXRoIGQ9Ik0xMCAzNiBINzQgYTE0IDE0IDAgMCAxIDE0IDE0IGExNCAxNCAwIDAgMSAtMTQgMTQgSDQ0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PGxpbmUgeDE9Ijc4IiB5MT0iMzQiIHgyPSI2NCIgeTI9IjY2IiBzdHJva2U9IiNDOEYwMDAiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtZGFzaGFycmF5PSI2IDQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg=='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Flat Felled Seam',
   'Durable flat felled seam with two parallel topstitch rows.',
   '{"spi_range":"8-10","thread_weight":80,"iso_code":null,"use_case":"Durable, denim/outerwear"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjgiIHk9IjM0IiB3aWR0aD0iODQiIGhlaWdodD0iNyIgZmlsbD0iIzZCNzI4MCIvPjxyZWN0IHg9IjI4IiB5PSI0MyIgd2lkdGg9Ijg0IiBoZWlnaHQ9IjciIGZpbGw9IiM2QjcyODAiLz48ZyBzdHJva2U9IiNDOEYwMDAiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiPjxsaW5lIHgxPSI0MiIgeTE9IjMwIiB4Mj0iNDIiIHkyPSI1NCIvPjxsaW5lIHgxPSI2MiIgeTE9IjMwIiB4Mj0iNjIiIHkyPSI1NCIvPjwvZz48L3N2Zz4='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Bound Seam',
   'Bound seam with binding wrapping the raw edge for a clean interior.',
   '{"spi_range":"10-12","thread_weight":80,"iso_code":null,"use_case":"Clean interior finish"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjgiIHk9IjM2IiB3aWR0aD0iNjIiIGhlaWdodD0iMTAiIGZpbGw9IiM2QjcyODAiLz48cGF0aCBkPSJNNzAgMzAgSDg0IGE2IDYgMCAwIDEgNiA2IFY0NCBhNiA2IDAgMCAxIC02IDYgSDcwIiBmaWxsPSJub25lIiBzdHJva2U9IiNDOEYwMDAiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxsaW5lIHgxPSI3NCIgeTE9IjMwIiB4Mj0iNzQiIHkyPSI1MCIgc3Ryb2tlPSIjQzhGMDAwIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWRhc2hhcnJheT0iNSA0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Blind Hem',
   'Blind hem with a zigzag that periodically bites the garment fold.',
   '{"spi_range":"6-8","thread_weight":80,"iso_code":"103","use_case":"Invisible hem"}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjgiIHk9IjMyIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjYiIGZpbGw9IiM2QjcyODAiLz48cmVjdCB4PSIyMCIgeT0iNDYiIHdpZHRoPSI4OCIgaGVpZ2h0PSI2IiBmaWxsPSIjNkI3MjgwIi8+PHBhdGggZD0iTTI0IDQ5IEwzNiA0OSBMNDQgMzUgTDUyIDQ5IEw2NCA0OSBMNzIgMzUgTDgwIDQ5IEw5MiA0OSBMMTAwIDM1IiBmaWxsPSJub25lIiBzdHJva2U9IiNDOEYwMDAiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=')
) as v(cat, src, ws, name, description, props, image_url)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global'
    and li.category = 'stitch_type'::public.library_category
    and li.name = v.name
);

-- ---- Category 6 - Thread (all carry colours) ---------------------------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'thread'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('Coats Epic Poly 80','Coats Epic Tex spun polyester, 80 weight, general construction.','{"brand":"Coats","thread_ref":"Epic","weight":80,"thread_type":"Spun Polyester"}'),
  ('Coats Epic Poly 120','Coats Epic spun polyester, 120 weight, fine seams and overlocking.','{"brand":"Coats","thread_ref":"Epic","weight":120,"thread_type":"Spun Polyester"}'),
  ('Coats Gramax Bonded Nylon','Coats Gramax bonded nylon, 40 weight, heavy-duty seams.','{"brand":"Coats","thread_ref":"Gramax","weight":40,"thread_type":"Bonded Nylon"}'),
  ('Wooly Nylon (Overlock)','Textured wooly nylon for soft, stretchy overlock seams.','{"brand":"Generic","thread_ref":"Wooly Nylon","weight":null,"thread_type":"Textured Nylon"}'),
  ('Amann Saba C 80','Amann Saba C polyester-core thread, 80 weight.','{"brand":"Amann","thread_ref":"Saba C","weight":80,"thread_type":"Polyester Core"}'),
  ('Madeira Classic Rayon 40','Madeira Classic rayon embroidery thread, 40 weight, high sheen.','{"brand":"Madeira","thread_ref":"Classic Rayon","weight":40,"thread_type":"Embroidery Rayon"}'),
  ('Madeira Polyneon 40','Madeira Polyneon polyester embroidery thread, 40 weight.','{"brand":"Madeira","thread_ref":"Polyneon","weight":40,"thread_type":"Embroidery Polyester"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'thread'::public.library_category and li.name = v.name
);

-- ---- Category 7 - Labels & Branding (no colours) -----------------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'label_type'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Woven Main Label','Damask woven main label, centre-fold sew-in.','{"size_mm":"55x30mm","construction":"Damask woven","attachment":"Sew-in (centre fold)","wash_fastness":"High"}'),
  ('Woven Loop Label','Satin woven loop label sewn into the side seam.','{"size_mm":"15x40mm","construction":"Satin woven","attachment":"Sew-in side seam","wash_fastness":"High"}'),
  ('Printed Care Label','Printed satin care/content label, sew-in.','{"size_mm":"30x50mm","construction":"Printed satin","attachment":"Sew-in","wash_fastness":"High"}'),
  ('Heat Transfer Care Label','Tagless heat-transfer care label, heat-sealed.','{"size_mm":"40x50mm","construction":"Heat transfer","attachment":"Heat-seal (tagless)","wash_fastness":"High"}'),
  ('Silicone Heat Transfer Badge','Silicone heat-transfer branded badge, heat-pressed.','{"size_mm":"60x25mm","construction":"Silicone HT","attachment":"Heat-press","wash_fastness":"High"}'),
  ('Rubber PVC Patch','Moulded PVC branded patch, sew-on or heat-applied.','{"size_mm":"50x20mm","construction":"Moulded PVC","attachment":"Sew-on / heat","wash_fastness":"High"}'),
  ('Size Tab','Printed size tab sewn into the main label.','{"size_mm":"15x15mm","construction":"Printed","attachment":"Sew into main label","wash_fastness":"High"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'label_type'::public.library_category and li.name = v.name
);

-- ---- Category 8 - Print & Decoration Types (no colours) ----------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'print_type'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Screen Print (Plastisol)','Plastisol spot-colour screen print; separated layers, no gradients.','{"artwork_format":"AI / EPS vector","colour_mode":"Spot (Pantone)","max_colours":8,"placement_notes":"Separated layers, no gradients"}'),
  ('Water-Based Screen Print','Soft-handle water-based screen print.','{"artwork_format":"AI / EPS vector","colour_mode":"Spot","max_colours":6,"placement_notes":"Soft handle"}'),
  ('Sublimation Print','All-over dye sublimation print; full repeat with bleed.','{"artwork_format":"AI / PDF 150dpi+","colour_mode":"RGB (from CMYK)","max_colours":null,"placement_notes":"Full repeat, 5mm bleed"}'),
  ('DTG (Direct to Garment)','Direct-to-garment print with white base on darks.','{"artwork_format":"PNG / PDF 300dpi","colour_mode":"CMYK + white","max_colours":null,"placement_notes":"White base on darks"}'),
  ('Heat Transfer Vinyl','Cut heat-transfer vinyl; reverse image on carrier sheet.','{"artwork_format":"AI / PDF vector","colour_mode":"Spot","max_colours":4,"placement_notes":"Reverse image, carrier sheet"}'),
  ('Embroidery','Thread embroidery to Pantone thread matches.','{"artwork_format":"DST / EMB","colour_mode":"Pantone thread","max_colours":15,"placement_notes":"40-60k stitch max"}'),
  ('3D Puff Embroidery','Raised foam 3D puff embroidery.','{"artwork_format":"DST / EMB","colour_mode":"Pantone thread","max_colours":8,"placement_notes":"Raised foam"}'),
  ('Foil Print','Metallic foil print via adhesive and foil.','{"artwork_format":"AI / EPS vector","colour_mode":"Metallic","max_colours":2,"placement_notes":"Adhesive + foil"}'),
  ('Reflective Heat Transfer','Hi-vis reflective grey/silver heat transfer.','{"artwork_format":"AI / PDF vector","colour_mode":"Grey/silver","max_colours":1,"placement_notes":"Hi-vis"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'print_type'::public.library_category and li.name = v.name
);

-- ---- Category 9 - Packaging (no colours) -------------------------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'packaging'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Self-Seal Polybag 30x40cm','30x40cm LDPE self-seal polybag with vent holes.','{"size":"30x40cm","gauge_micron":50,"material":"LDPE","pkg_type":"Self-seal + vent holes"}'),
  ('Self-Seal Polybag 25x35cm','25x35cm LDPE self-seal polybag with vent holes.','{"size":"25x35cm","gauge_micron":50,"material":"LDPE","pkg_type":"Self-seal + vent holes"}'),
  ('Recycled Polybag','30x40cm recycled LDPE self-seal polybag.','{"size":"30x40cm","gauge_micron":50,"material":"Recycled LDPE","pkg_type":"Self-seal"}'),
  ('Branded Card Hangtag','50x80mm 350gsm branded card hangtag with string.','{"size":"50x80mm","material":"350gsm card","pkg_type":"String attached"}'),
  ('Recycled Kraft Hangtag','45x70mm 300gsm recycled kraft hangtag with string.','{"size":"45x70mm","material":"300gsm kraft","pkg_type":"String attached"}'),
  ('Acid-Free Tissue','50x75cm acid-free tissue wrap.','{"size":"50x75cm","material":"Acid-free","pkg_type":"Wrap"}'),
  ('Mailer Box','30x22x5cm branded E-flute mailer box.','{"size":"30x22x5cm","material":"E-flute cardboard","pkg_type":"Branded"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'packaging'::public.library_category and li.name = v.name
);

-- ---- Category 10 - Interlining & Interfacing (no colours) --------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'interlining'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Woven Fusible 40g','40g woven fusible interlining, bonds at 130 deg C.','{"gsm":40,"interlining_type":"Woven fusible","width_cm":90,"bonding_temp":"130 deg C","stretch_direction":"None"}'),
  ('Knit Fusible 30g','30g knit fusible interlining with cross-stretch, bonds at 125 deg C.','{"gsm":30,"interlining_type":"Knit fusible","width_cm":90,"bonding_temp":"125 deg C","stretch_direction":"Cross-stretch"}'),
  ('Non-Woven Fusible 50g','50g non-woven fusible interlining, bonds at 135 deg C.','{"gsm":50,"interlining_type":"Non-woven fusible","width_cm":90,"bonding_temp":"135 deg C","stretch_direction":"None"}'),
  ('Sew-In Canvas','220g sew-in canvas interlining for structured panels.','{"gsm":220,"interlining_type":"Sew-in","width_cm":90,"bonding_temp":null,"stretch_direction":"None"}'),
  ('Stretch Tricot Fusible','35g stretch tricot fusible with 2-way stretch, bonds at 120 deg C.','{"gsm":35,"interlining_type":"Tricot fusible","width_cm":90,"bonding_temp":"120 deg C","stretch_direction":"2-way"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'interlining'::public.library_category and li.name = v.name
);

commit;
