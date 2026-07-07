-- ============================================================================
-- 0031 — Retire the standalone "Branding, Labelling & Packaging" section.
--
-- Its concerns are covered elsewhere: branding & labels by the Branding &
-- Labels CANVAS LAYER inside Technical Details (canvas_layer_type
-- 'branding'/'label' — untouched here), and packaging by adding a canvas
-- page named "Packaging". The seven-section tech pack becomes six; the
-- product page's "X of N sections complete" denominator follows the enabled
-- product_sections rows, so it updates automatically.
--
-- Mirrors 0016's removal of the standalone `construction` section:
-- delete-if-present from both tables, so re-runs are a no-op. Safe to re-run.
-- ============================================================================

delete from public.product_sections where section_key = 'branding';
delete from public.section_templates where key = 'branding';
