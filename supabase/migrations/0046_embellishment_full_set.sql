-- 0046 - Add nine global Embellishment items missing after 0044, for a set
-- of thirteen. Idempotent: guarded by name, so re-running inserts nothing.

insert into public.library_items (category, source, workspace_id, name, properties, is_active, created_by)
select 'embellishment'::public.library_category, 'global'::public.library_source, null,
       v.name, '{}'::jsonb, true, null
from (values
  ('Screen Print'),
  ('Heat Transfer'),
  ('Woven Badge'),
  ('Silicone Badge'),
  ('Reflective Print'),
  ('Sublimation Print'),
  ('Deboss / Emboss'),
  ('Appliqué'),
  ('Other')
) as v(name)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global'
    and li.category = 'embellishment'::public.library_category
    and li.name = v.name
);
