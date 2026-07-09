-- ============================================================================
-- 0041 — Workspace colour library (idempotent / safe to re-run)
--
-- A small dedicated table for the workspace's reusable colours — NOT a
-- library_items category. The Master Library machinery (global/workspace
-- layers, per-workspace toggles, category property forms) is wrong-shaped for
-- colours: there is no global seeded colour set, and colours want a
-- swatch-first picker, not a property form. The library FEEDS pins but never
-- owns them: picking a library colour copies name/hex/pantone into the pin's
-- `data` jsonb (same as manual entry), so there is deliberately no FK from
-- canvas_annotations to this table — deleting a library colour must never
-- touch existing pins, and pins stay self-contained for the PDF/export
-- pipeline.
-- ============================================================================

create table if not exists public.workspace_colours (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  -- Stored as "#RRGGBB" (uppercase by app convention) — same shape the
  -- sampler emits and update_layer_colours() validates.
  hex          text not null
    constraint workspace_colours_hex_ck check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  pantone      text null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_workspace_colours_workspace
  on public.workspace_colours (workspace_id);

-- ---- updated_at maintenance (reuse public.set_updated_at from 0002) ----------

drop trigger if exists trg_workspace_colours_updated_at on public.workspace_colours;
create trigger trg_workspace_colours_updated_at
  before update on public.workspace_colours
  for each row execute function public.set_updated_at();

-- ---- RLS: direct workspace match, exactly like labels/brands -----------------

alter table public.workspace_colours enable row level security;

drop policy if exists "workspace_colours_all_member" on public.workspace_colours;
create policy "workspace_colours_all_member"
  on public.workspace_colours for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());
