-- 0046 - Global Embellishment list: add nine items missing after 0044,
-- so this category holds thirteen global items in total. Idempotent:
-- guarded by name, so re-running inserts nothing.

insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'embellishment'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, '{}'::jsonb, true, null
from (values
  ('Screen Print', 'Ink printed directly onto a garment panel through a mesh screen.'),
  ('Heat Transfer', 'Pre-printed design applied with heat and pressure.'),
  ('Woven Badge', 'Woven badge sewn onto a garment.'),
  ('Silicone Badge', 'Moulded silicone badge applied to a garment surface.'),
  ('Reflective Print', 'Retro-reflective print for low-light visibility.'),
  ('Sublimation Print', 'Dye-sublimation print bonded into a garment panel.'),
  ('Deboss / Emboss', 'Design pressed into or raised from a material surface.'),
  ('Appliqué', 'Cut shape stitched onto a garment panel.'),
  ('Other', 'Any embellishment not covered by a standard type.')
) as v(name, description)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global'
    and li.category = 'embellishment'::public.library_category
    and li.name = v.name
);
