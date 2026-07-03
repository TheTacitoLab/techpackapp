-- ============================================================================
-- 0021 — Slot image fit mode (idempotent / safe to re-run)
--
-- How a filled canvas slot fits its image:
--   'fill' — object-fit: cover; the image covers the whole slot, cropping
--            whatever overflows the slot's aspect ratio (the original and only
--            behaviour before this migration).
--   'fit'  — object-fit: contain; the ENTIRE image is visible, letterboxed
--            where the aspect ratios differ — a tall garment flat in a wide
--            slot is never chopped top/bottom.
--
-- The default is 'fill' so every EXISTING slot keeps rendering bit-for-bit as
-- it does today (no pin drifts anywhere). The app sets 'fit' explicitly when
-- an image is newly placed into a slot (fillSlot), because seeing the whole
-- garment is the right starting point for garment work.
-- ============================================================================

alter table public.canvas_slots
  add column if not exists fit_mode text not null default 'fill'
  check (fit_mode in ('fill', 'fit'));
