-- ============================================================================
-- 0025 — Frozen design-space box for locked slots (idempotent)
--
-- Root cause fixed (per the accepted diagnosis): annotation pins are stored
-- as 0–1 fractions of the SLOT BOX (strictly proportional to box size), but
-- a locked slot's frozen framing is not — the object-fit base scale is
-- recomputed from the CURRENT box (aspect-dependent) and the locked pan is
-- absolute local pixels. Rendered at a different container size/aspect, the
-- garment lands at different slot fractions than when the pins were placed,
-- so pins visibly drift (fullscreen toggle, smaller dashboard render).
--
-- Fix model: record the slot's local rendered pixel size AT LOCK TIME —
-- the exact coordinate space the framing pan was authored in — and render
-- the locked slot's image AND pins inside a fixed lock_width×lock_height
-- "design-space" box, uniformly scaled as one unit to fit the live
-- container. Image and pins then share one frozen coordinate space and can
-- never drift apart, at any container size (editor, fullscreen, dashboard,
-- and the eventual PDF).
--
-- Existing pins/locked slots are dummy data (confirmed) — cleared/reset here
-- rather than backfilling unknowable lock-time sizes, so every locked slot
-- going forward carries its design size; no legacy render path is needed.
-- ============================================================================

alter table public.canvas_slots
  add column if not exists lock_width numeric null,
  add column if not exists lock_height numeric null;

comment on column public.canvas_slots.lock_width is
  'Slot''s local rendered width (px) captured at lock time — the frozen design-space box the framing pan/zoom and every annotation fraction are laid out in. Null while unlocked.';
comment on column public.canvas_slots.lock_height is
  'See lock_width — the frozen design-space box height (px). Null while unlocked.';

-- Existing pins/locks are dummy data — clear annotations and reset locks so
-- every slot re-locks under the frozen design-space model.
delete from public.canvas_annotations;

update public.canvas_slots
  set is_locked = false, lock_width = null, lock_height = null
  where is_locked = true
     or lock_width is not null
     or lock_height is not null;
