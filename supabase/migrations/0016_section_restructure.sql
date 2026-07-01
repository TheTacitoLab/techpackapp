-- ============================================================================
-- 0016 — Section restructure: six sections -> seven correctly named ones.
--
-- Renames keys (canvas->technical_details, measurements->grading,
-- labels->branding; product_sections.section_key cascades via the FK's
-- ON UPDATE CASCADE), drops the standalone `construction` section (absorbed
-- into Technical Details in Stage 2), adds the new `assets` and `documents`
-- sections, and introduces an `export_to_pdf` flag on section_templates.
--
-- Idempotent: guarded column add, key-scoped updates, delete-if-present,
-- upsert on insert, and a not-exists backfill. Safe to re-run.
-- ============================================================================

-- 1. Add export_to_pdf flag to section_templates
alter table public.section_templates
  add column if not exists export_to_pdf boolean not null default true;

-- 2. Rename keys (product_sections.section_key cascades via FK ON UPDATE CASCADE)
update public.section_templates set
  key = 'technical_details', label = 'Technical Details',
  icon = 'Layers', default_sort_order = 30, export_to_pdf = true
where key = 'canvas';

update public.section_templates set
  key = 'grading', label = 'Grading',
  icon = 'Table2', default_sort_order = 60, export_to_pdf = true
where key = 'measurements';

update public.section_templates set
  key = 'branding', label = 'Branding, Labelling & Packaging',
  icon = 'Tag', default_sort_order = 40, export_to_pdf = true
where key = 'labels';

-- 3. Update remaining existing sections
update public.section_templates set
  label = 'Product Setup', icon = 'ClipboardList',
  default_sort_order = 10, export_to_pdf = true
where key = 'identity';

update public.section_templates set
  label = 'Bill of Materials', icon = 'ListTree',
  default_sort_order = 50, export_to_pdf = true
where key = 'bom';

-- 4. Remove construction as a standalone section
delete from public.product_sections where section_key = 'construction';
delete from public.section_templates where key = 'construction';

-- 5. Insert new sections
insert into public.section_templates
  (key, label, icon, default_sort_order, is_default, export_to_pdf)
values
  ('assets', 'Asset Upload', 'Images', 20, true, false),
  ('documents', 'Supplementary Documents', 'Paperclip', 70, true, true)
on conflict (key) do update set
  label = excluded.label, icon = excluded.icon,
  default_sort_order = excluded.default_sort_order,
  export_to_pdf = excluded.export_to_pdf;

-- 6. Backfill new sections for existing products
insert into public.product_sections (product_id, section_key, status, sort_order, is_enabled, data)
select p.id, t.key, 'not_started', t.default_sort_order, true, '{}'::jsonb
from public.products p
cross join public.section_templates t
where t.key in ('assets', 'documents')
  and not exists (
    select 1 from public.product_sections ps
    where ps.product_id = p.id and ps.section_key = t.key
  );
