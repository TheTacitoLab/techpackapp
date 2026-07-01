-- ============================================================================
-- 0007 — Labels system (idempotent / safe to re-run)
-- Workspace-scoped, free-form colour labels that can be attached to products
-- (many-to-many via product_labels). RLS mirrors the standard tenant pattern:
-- labels carry workspace_id directly; product_labels resolves via its parent
-- product + label, both of which must live in the caller's workspace.
-- ============================================================================

-- ---- labels ------------------------------------------------------------------
create table if not exists public.labels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  color        text not null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

-- ---- product_labels (join) ---------------------------------------------------
create table if not exists public.product_labels (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label_id   uuid not null references public.labels (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, label_id)
);

-- ---- Indexes -----------------------------------------------------------------
create index if not exists idx_labels_workspace          on public.labels (workspace_id);
create index if not exists idx_product_labels_product    on public.product_labels (product_id);
create index if not exists idx_product_labels_label      on public.product_labels (label_id);

-- ---- RLS ---------------------------------------------------------------------
alter table public.labels         enable row level security;
alter table public.product_labels enable row level security;

-- labels: full CRUD within your workspace, can't move a row across workspaces.
drop policy if exists "labels_all_member" on public.labels;
create policy "labels_all_member"
  on public.labels for all to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- product_labels: SELECT / INSERT / DELETE only (no UPDATE — it's a pure join).
-- Both the product and the label must belong to the caller's workspace.
drop policy if exists "product_labels_select_member" on public.product_labels;
create policy "product_labels_select_member"
  on public.product_labels for select to authenticated
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_labels.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "product_labels_insert_member" on public.product_labels;
create policy "product_labels_insert_member"
  on public.product_labels for insert to authenticated
  with check (
    exists (
      select 1 from public.products pr
      where pr.id = product_labels.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
    and exists (
      select 1 from public.labels l
      where l.id = product_labels.label_id
        and l.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "product_labels_delete_member" on public.product_labels;
create policy "product_labels_delete_member"
  on public.product_labels for delete to authenticated
  using (
    exists (
      select 1 from public.products pr
      where pr.id = product_labels.product_id
        and pr.workspace_id = public.auth_workspace_id()
    )
  );
