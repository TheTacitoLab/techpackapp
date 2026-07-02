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
