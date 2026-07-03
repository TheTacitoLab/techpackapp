-- ============================================================================
-- 0020 — Workspace layer marker colours (idempotent / safe to re-run)
--
-- One set of per-layer annotation marker colours per workspace, stored as a
-- small jsonb map on `workspaces` (Option A: the values are a tiny bounded set
-- always read/written together — no need for a dedicated table). Shape:
--   { "colourway": "#RRGGBB", "fabric": ..., "measurement": ..., "construction": ... }
-- keyed by the layer keys in components/canvas/layers.ts. Missing keys fall
-- back to the built-in default colour in the app; '{}' means "all defaults".
--
-- Writes go through `update_layer_colours()` rather than a direct UPDATE:
-- RLS on `workspaces` (0003) only lets the OWNER update the row, but marker
-- colours are an everyday workspace preference every member may change (the
-- same trust level as labels or library items, which are member-writable).
-- A SECURITY DEFINER function scoped to auth_workspace_id() — the established
-- pattern from 0002 — grants exactly that: members can set THIS column on
-- THEIR workspace, without opening up `name`/`owner_id` to member updates.
-- ============================================================================

alter table public.workspaces
  add column if not exists layer_colours jsonb not null default '{}'::jsonb;

-- Replaces the caller's workspace layer_colours map wholesale (the UI always
-- saves the full override map). Validates shape server-side — object only,
-- known layer keys only, '#RRGGBB' string values only — so bad payloads can
-- never land even if the app-layer validation is bypassed.
create or replace function public.update_layer_colours(colours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
  entry record;
begin
  ws_id := public.auth_workspace_id();
  if ws_id is null then
    raise exception 'No workspace for the current user';
  end if;

  if colours is null or jsonb_typeof(colours) <> 'object' then
    raise exception 'layer_colours must be a JSON object';
  end if;

  for entry in select key, value from jsonb_each(colours) loop
    if entry.key not in ('colourway', 'fabric', 'measurement', 'construction') then
      raise exception 'Unknown layer key: %', entry.key;
    end if;
    if jsonb_typeof(entry.value) <> 'string'
       or (entry.value #>> '{}') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'Invalid colour for layer %: expected "#RRGGBB"', entry.key;
    end if;
  end loop;

  update public.workspaces
  set layer_colours = colours
  where id = ws_id;
end;
$$;

revoke all on function public.update_layer_colours(jsonb) from public, anon;
grant execute on function public.update_layer_colours(jsonb) to authenticated;
