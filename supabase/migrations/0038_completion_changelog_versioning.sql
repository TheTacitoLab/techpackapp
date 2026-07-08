-- ============================================================================
-- 0038 — Section completion, Change Log, product versioning
--        (idempotent / safe to re-run)
--
-- Three connected pieces of tech-pack version control:
--
--   1. DURABLE section completion. `product_sections.status` already stores
--      the tick, but the two existing writers (identity save, spec roll-up)
--      recompute it on every mutation — so a deliberate human "Mark complete"
--      could be silently demoted by the next edit. `completed_manually`
--      records that the completion was a human declaration: while it is true,
--      the automatic recomputes never demote the section; only an explicit
--      un-mark clears it (and re-derives the automatic status). Sections
--      completed by the auto rules keep completed_manually = false and keep
--      re-evaluating as their content changes.
--
--   2. `product_change_log` — an append-only record of every SPECIFICATION
--      change (annotations, BOM data, spec sheets, pages, product setup),
--      written by the `logChange` helper from the spec-mutating server
--      actions. Meta activity (page notes, exports, views, collapse state,
--      completion marks) is deliberately never logged. `version` stamps the
--      product's version label at write time so the log groups cleanly by
--      version; `area` is a small app-defined slug (see lib/change-log.ts);
--      `data` carries optional structured metadata (e.g. the bump note).
--      `actor_id` is nullable and UNPOPULATED for now — it exists so the log
--      is collaboration-ready without a second migration once multi-user
--      lands. Rows are append-only: no updated_at column or trigger (same as
--      product_assets / canvas_slots).
--
--   3. Product versioning. The product carries a manual version number
--      (v{major}.{minor}, starting at v1.0) shown in the header and on the
--      exports. The user bumps it ("New version") when sending the factory an
--      updated pack; the change log keeps recording under the current version.
--      NO snapshot/restore or version diffing here — that is a deliberate
--      later enhancement; this is only the durable number + the bump + the
--      grouped log.
-- ============================================================================

-- ---- products: the manual version number --------------------------------------
-- Label is derived as v{major}.{minor} (lib/product-version.ts). A minor bump
-- increments minor; a major bump increments major and resets minor to 0.
alter table public.products
  add column if not exists version_major integer not null default 1,
  add column if not exists version_minor integer not null default 0;

-- ---- product_sections: durable manual completion --------------------------------
-- True only when a human pressed "Mark complete"; automatic recomputes skip
-- demotion while set. Existing 'complete' rows were produced by the automatic
-- rules, so the false default is the correct backfill for them.
alter table public.product_sections
  add column if not exists completed_manually boolean not null default false;

-- ---- product_change_log ----------------------------------------------------------
create table if not exists public.product_change_log (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version      text not null,
  area         text not null,
  description  text not null,
  data         jsonb not null default '{}'::jsonb,
  actor_id     uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- The one read path is "this product's entries, newest first" — a composite
-- index serves both the filter and the order.
create index if not exists idx_product_change_log_product_created
  on public.product_change_log (product_id, created_at desc);

-- ---- RLS -------------------------------------------------------------------------
-- SELECT + INSERT only — the append-only contract is ENFORCED here, not just
-- documented: with no UPDATE/DELETE policy, RLS denies both outright, so the
-- log cannot be rewritten or pruned even with a hand-crafted PostgREST call.
-- (Product deletion still clears its entries — the FK cascade bypasses RLS.)
-- INSERT keeps the 0033 pattern: workspace match plus a parent-ownership
-- EXISTS (FK validation bypasses RLS, so without it a row could claim another
-- workspace's product_id while stamping its own workspace_id).
alter table public.product_change_log enable row level security;

drop policy if exists "product_change_log_all_member" on public.product_change_log;

drop policy if exists "product_change_log_select_member" on public.product_change_log;
create policy "product_change_log_select_member"
  on public.product_change_log for select to authenticated
  using (workspace_id = public.auth_workspace_id());

drop policy if exists "product_change_log_insert_member" on public.product_change_log;
create policy "product_change_log_insert_member"
  on public.product_change_log for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and exists (
      select 1 from public.products p
      where p.id = product_change_log.product_id
        and p.workspace_id = public.auth_workspace_id()
    )
  );

-- ---- Reconcile the derived Asset Upload section status ----------------------------
-- Same rationale as 0037's grading reconcile: the assets auto-derivation is
-- new in this release and NOTHING ever wrote this section's status before, so
-- every existing row is stuck at its insert-time 'not_started' and would stay
-- wrong until some asset mutation happens to fire a recompute. Mirror
-- computeAutoSectionStatus('assets'): not_started with zero assets, complete
-- when every asset is placed in a canvas slot or is the hero, else
-- in_progress. Gated on completed_manually = false so re-runs never demote a
-- manual tick (idempotent).
update public.product_sections ps
set status = (case
  when not exists (
    select 1 from public.product_assets a where a.product_id = ps.product_id
  ) then 'not_started'
  when not exists (
    select 1
    from public.product_assets a
    where a.product_id = ps.product_id
      and a.id is distinct from (
        select p.hero_asset_id from public.products p where p.id = ps.product_id
      )
      and not exists (
        select 1
        from public.canvas_slots cs
        join public.canvas_pages cp on cp.id = cs.page_id
        where cp.product_id = ps.product_id
          and cs.asset_id = a.id
      )
  ) then 'complete'
  else 'in_progress'
end)::public.section_status
where ps.section_key = 'assets'
  and ps.completed_manually = false;
