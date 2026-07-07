-- Local seed run by `supabase db reset` (after migrations). Re-applies the
-- global section_templates only — users/workspaces come from the sign-up
-- trigger, never from seed data. Idempotent.
--
-- Must mirror the CURRENT template set (post-0031: six sections — the
-- standalone construction and branding sections are retired). Because this
-- runs AFTER migrations, seeding a stale key here would resurrect a retired
-- section on every reset.
insert into public.section_templates (key, label, icon, default_sort_order, is_default, export_to_pdf)
values
  ('identity',          'Product Setup',            'ClipboardList', 10, true, true),
  ('assets',            'Asset Upload',             'Images',        20, true, false),
  ('technical_details', 'Technical Details',        'Layers',        30, true, true),
  ('bom',               'Bill of Materials',        'ListTree',      50, true, true),
  ('grading',           'Grading',                  'Table2',        60, true, true),
  ('documents',         'Supplementary Documents',  'Paperclip',     70, true, true)
on conflict (key) do update
  set label              = excluded.label,
      icon               = excluded.icon,
      default_sort_order = excluded.default_sort_order,
      is_default         = excluded.is_default,
      export_to_pdf      = excluded.export_to_pdf;
