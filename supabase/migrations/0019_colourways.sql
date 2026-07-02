-- ============================================================================
-- 0019 — Colourways (idempotent / safe to re-run)
--
-- A product can have MULTIPLE named colourways (Navy, Grey, Olive…). Each is a
-- group; its pins get two-level reference codes C{sequence}.{n} (C1.1, C1.2 for
-- the first colourway; C2.1 for the second) — a distinct scheme from every
-- other layer's single product-wide counter. `sequence_number` is stable per
-- product (never renumbered), which is why colourway assignment is immutable
-- after a pin is placed: changing it would force a renumber. Renaming is free
-- (it never touches sequence_number or any reference_code).
-- ============================================================================

create table if not exists public.canvas_colourways (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null,
  sequence_number integer not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, sequence_number)
);

create index if not exists idx_canvas_colourways_product
  on public.canvas_colourways (product_id);

-- Link annotations to their colourway (cascade so deleting a colourway removes
-- its pins). Nullable because only colourway pins carry it — enforced below.
alter table public.canvas_annotations
  add column if not exists colourway_id uuid null
    references public.canvas_colourways (id) on delete cascade;

-- Backfill: 'colourway' layer_type pins from before this session (placed via
-- the old generic single-counter path, so they carry codes like C1/C2 and no
-- colourway_id) would violate the CHECK constraint below. For each product
-- with such orphans, reuse its lowest-sequence colourway if one already
-- exists, else create "Colourway 1"; assign every orphan to it and renumber
-- their reference codes C{sequence}.{n} in creation order. Idempotent: the
-- WHERE clauses only ever match rows still missing colourway_id, so a re-run
-- after a successful backfill touches nothing.
do $$
declare
  prod record;
  ann record;
  cw_id uuid;
  next_seq integer;
  n integer;
begin
  for prod in
    select distinct cp.product_id, ca.workspace_id
    from public.canvas_annotations ca
    join public.canvas_slots cs on cs.id = ca.slot_id
    join public.canvas_pages cp on cp.id = cs.page_id
    where ca.layer_type = 'colourway' and ca.colourway_id is null
  loop
    select id into cw_id
    from public.canvas_colourways
    where product_id = prod.product_id
    order by sequence_number asc
    limit 1;

    if cw_id is null then
      select coalesce(max(sequence_number), 0) + 1 into next_seq
      from public.canvas_colourways
      where product_id = prod.product_id;

      insert into public.canvas_colourways (product_id, workspace_id, name, sequence_number)
      values (prod.product_id, prod.workspace_id, 'Colourway 1', next_seq)
      returning id into cw_id;
    end if;

    n := 0;
    for ann in
      select ca.id
      from public.canvas_annotations ca
      join public.canvas_slots cs on cs.id = ca.slot_id
      join public.canvas_pages cp on cp.id = cs.page_id
      where cp.product_id = prod.product_id
        and ca.layer_type = 'colourway'
        and ca.colourway_id is null
      order by ca.created_at asc
    loop
      n := n + 1;
      update public.canvas_annotations
      set colourway_id = cw_id,
          reference_code = 'C' || (
            select sequence_number from public.canvas_colourways where id = cw_id
          ) || '.' || n
      where id = ann.id;
    end loop;
  end loop;
end $$;

-- Integrity: a colourway pin MUST have a colourway_id; every other layer type
-- MUST NOT. Guarded existence check because Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS`.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'chk_colourway_id_matches_layer'
      and table_name = 'canvas_annotations'
  ) then
    alter table public.canvas_annotations
      add constraint chk_colourway_id_matches_layer
      check (
        (layer_type = 'colourway' and colourway_id is not null)
        or (layer_type != 'colourway' and colourway_id is null)
      );
  end if;
end $$;

create index if not exists idx_canvas_annotations_colourway
  on public.canvas_annotations (colourway_id);

-- ---- RLS: direct workspace match, exactly like every other canvas table ------
alter table public.canvas_colourways enable row level security;

drop policy if exists "canvas_colourways_all_member" on public.canvas_colourways;
create policy "canvas_colourways_all_member"
  on public.canvas_colourways for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- ---- updated_at maintenance (reuse public.set_updated_at from 0002) ----------
drop trigger if exists trg_canvas_colourways_updated_at on public.canvas_colourways;
create trigger trg_canvas_colourways_updated_at
  before update on public.canvas_colourways
  for each row execute function public.set_updated_at();
