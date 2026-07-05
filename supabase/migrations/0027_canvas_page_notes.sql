-- ============================================================================
-- 0027 — Per-page canvas notes (idempotent / safe to re-run)
--
-- One free-text notes field per canvas page, authored in the canvas editor
-- and rendered in the "PAGE NOTES" box at the bottom of the canvas zone on
-- EVERY layer-page exported from that canvas page (the box always carries
-- ruled blank lines so printed copies give the factory somewhere to
-- handwrite, whether or not typed notes exist).
-- ============================================================================

alter table public.canvas_pages
  add column if not exists notes text null;

comment on column public.canvas_pages.notes is
  'Per-page notes shown in the PDF export''s "PAGE NOTES" box on every layer-page of this canvas page. Null when the user has typed none — the ruled box still renders.';
