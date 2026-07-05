-- ============================================================================
-- 0029 — Per-slot editable name (idempotent / safe to re-run)
--
-- An optional short name per canvas slot ("Front", "Back neck", "Left cuff").
-- Shown as the slot's box label on the PDF export and used to group the
-- callout column by slot (each slot's pins listed under its name). Null falls
-- back to the asset name, then "Slot N".
-- ============================================================================

alter table public.canvas_slots
  add column if not exists name text null;

comment on column public.canvas_slots.name is
  'Optional user-facing slot name (e.g. "Front", "Back neck"). PDF box label and callout-column group header. Null falls back to the asset name then "Slot N".';
