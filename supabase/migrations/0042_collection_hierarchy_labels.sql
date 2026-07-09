-- ============================================================================
-- 0042 — Collection hierarchy + collection labels (idempotent / safe to re-run)
--
-- Collections gain ONE level of nesting: a collection may have a parent_id,
-- and a collection that has a parent can never itself be a parent. The depth
-- rule is enforced both in the server actions (friendly errors) and by the
-- trigger below (hard backstop).
--
-- Collections also become taggable with the existing workspace `labels`
-- vocabulary via a `collection_labels` join table that mirrors
-- `product_labels` (0007) exactly — same shape, same RLS pattern.
-- ============================================================================

-- ---- collections.parent_id -------------------------------------------------

-- ON DELETE NO ACTION (statement-end check), deliberately NOT RESTRICT:
-- deleting a parent that still has sub-collections must fail (and does — the
-- children still reference it when the statement ends), but deleting a brand
-- CASCADEs away parent and child collections in the same statement, and
-- RESTRICT's immediate per-row check would abort that cascade depending on
-- deletion order. NO ACTION gives the same single-delete guarantee without
-- breaking the brand cascade.
alter table public.collections
  add column if not exists parent_id uuid
    references public.collections (id) on delete no action;

create index if not exists idx_collections_parent
  on public.collections (parent_id);

-- ---- depth guard: one level of nesting only ---------------------------------

create or replace function public.enforce_collection_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_row record;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A collection cannot be its own parent';
  end if;

  select c.parent_id, c.workspace_id
    into parent_row
    from public.collections c
   where c.id = new.parent_id;

  -- A missing parent falls through to the FK violation.
  if found then
    if parent_row.workspace_id <> new.workspace_id then
      raise exception 'Parent collection belongs to a different workspace';
    end if;
    if parent_row.parent_id is not null then
      raise exception 'Collections can only nest one level deep';
    end if;
  end if;

  -- A collection that has children cannot itself be given a parent.
  if exists (
    select 1 from public.collections c where c.parent_id = new.id
  ) then
    raise exception 'A collection with sub-collections cannot be nested under a parent';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_collections_depth on public.collections;
create trigger trg_collections_depth
  before insert or update of parent_id on public.collections
  for each row execute function public.enforce_collection_depth();

-- ---- collection_labels join table (mirrors product_labels, 0007) ------------

create table if not exists public.collection_labels (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  label_id      uuid not null references public.labels (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (collection_id, label_id)
);

create index if not exists idx_collection_labels_collection
  on public.collection_labels (collection_id);
create index if not exists idx_collection_labels_label
  on public.collection_labels (label_id);

alter table public.collection_labels enable row level security;

-- collection_labels: SELECT / INSERT / DELETE only (no UPDATE — it's a pure
-- join). Both the collection and the label must belong to the caller's
-- workspace.
drop policy if exists "collection_labels_select_member" on public.collection_labels;
create policy "collection_labels_select_member"
  on public.collection_labels for select to authenticated
  using (
    exists (
      select 1 from public.collections co
      where co.id = collection_labels.collection_id
        and co.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "collection_labels_insert_member" on public.collection_labels;
create policy "collection_labels_insert_member"
  on public.collection_labels for insert to authenticated
  with check (
    exists (
      select 1 from public.collections co
      where co.id = collection_labels.collection_id
        and co.workspace_id = public.auth_workspace_id()
    )
    and exists (
      select 1 from public.labels l
      where l.id = collection_labels.label_id
        and l.workspace_id = public.auth_workspace_id()
    )
  );

drop policy if exists "collection_labels_delete_member" on public.collection_labels;
create policy "collection_labels_delete_member"
  on public.collection_labels for delete to authenticated
  using (
    exists (
      select 1 from public.collections co
      where co.id = collection_labels.collection_id
        and co.workspace_id = public.auth_workspace_id()
    )
  );
