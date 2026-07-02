-- ============================================================================
-- 0018 — Annotation label offset (idempotent / safe to re-run)
--
-- Lets a pin's reference-code BADGE be dragged clear of its TIP without moving
-- the annotated point itself. `label_offset_x` / `label_offset_y` are stored as
-- 0.0-1.0 fractions of the slot's rendered size — exactly like `x`/`y` — so the
-- badge position is scale-invariant at any zoom, reusing the proven coordinate
-- system. Both nullable with NO default: null means "not customised — render the
-- badge at its default position directly above the tip," so every existing pin
-- renders exactly as before with zero backfill.
-- ============================================================================
alter table public.canvas_annotations
  add column if not exists label_offset_x numeric null,
  add column if not exists label_offset_y numeric null;
