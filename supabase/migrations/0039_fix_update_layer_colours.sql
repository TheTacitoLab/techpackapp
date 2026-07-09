-- ============================================================================
-- 0039 — Fix update_layer_colours(): accept the branding_labels layer
--        (idempotent / safe to re-run)
--
-- 0020 created this function validating against the four layer keys that
-- existed at the time. 0024 added the Branding & Labels canvas layer
-- (app-side key `branding_labels` in components/canvas/layers.ts), but the
-- function's allow-list was never updated, so saving a Branding & Labels
-- marker colour raised "Unknown layer key: branding_labels".
--
-- This replaces the function with the full five-key list, matching the zod
-- schema in app/(app)/settings/actions.ts (derived from ANNOTATION_LAYERS).
-- Everything else is unchanged from 0020: SECURITY DEFINER scoped to
-- auth_workspace_id(), empty search_path, object-shape + '#RRGGBB' checks,
-- wholesale replace of the workspace's override map.
-- ============================================================================

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
    if entry.key not in ('colourway', 'fabric', 'measurement', 'construction', 'branding_labels') then
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
