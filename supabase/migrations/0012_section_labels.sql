-- ============================================================================
-- 0012 — Friendlier section labels (UI text only, idempotent / safe to re-run)
-- Renames the display `label` of each section template to clearer, more
-- beginner-friendly names. Section `key`s are the stable contract and are NOT
-- touched — only the human-facing label changes. Labels are read dynamically
-- from `section_templates` everywhere (builder page, progress tracker), so this
-- single update propagates app-wide with no component changes. Re-running is a
-- no-op: the same values are written.
-- ============================================================================

update public.section_templates set label = 'Product Setup'                where key = 'identity';
update public.section_templates set label = 'Design & Colourways'           where key = 'canvas';
update public.section_templates set label = 'Materials & Components'        where key = 'bom';
update public.section_templates set label = 'Measurements & Fit'           where key = 'measurements';
update public.section_templates set label = 'Construction Details'          where key = 'construction';
update public.section_templates set label = 'Branding, Labels & Packaging'  where key = 'labels';
