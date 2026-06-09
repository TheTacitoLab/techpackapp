-- Local seed run by `supabase db reset` (after migrations). Re-applies the
-- global section_templates only — users/workspaces come from the sign-up
-- trigger, never from seed data. Idempotent.
insert into public.section_templates (key, label, icon, default_sort_order, is_default)
values
  ('identity',     'Product Identity',   'Tag',        10, true),
  ('canvas',       'Design Canvas',      'PenTool',    20, true),
  ('bom',          'Bill of Materials',  'ListTree',   30, true),
  ('measurements', 'Measurements',       'Ruler',      40, true),
  ('construction', 'Construction',       'Hammer',     50, true),
  ('labels',       'Labels & Packaging', 'BookMarked', 60, true)
on conflict (key) do update
  set label              = excluded.label,
      icon               = excluded.icon,
      default_sort_order = excluded.default_sort_order,
      is_default         = excluded.is_default;
