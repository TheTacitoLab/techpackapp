-- ============================================================================
-- 0023 — PDF export spike: frozen lock-space dims + product share token
-- (idempotent / safe to re-run)
--
-- lock_width/lock_height: the slot's rendered box size (CSS px) captured at
-- the moment it is LOCKED — the frozen "design space" that makes rendering
-- size-independent. crop_x/crop_y are pixel offsets defined against the box
-- the user framed in, so any other renderer (the PDF, a future Konva stage)
-- must lay the image + pins out in THIS box and scale uniformly to its own
-- container. Nullable: slots locked before this migration have no captured
-- box; consumers fall back to treating their own box as the reference (the
-- framing is approximate for those until the slot is re-locked).
--
-- share_token: unguessable per-product token for the "View online" link in
-- exported PDFs (the /view/{token} destination ships later; the footer link
-- shape is what the spike needs).
-- ============================================================================

alter table public.canvas_slots
  add column if not exists lock_width numeric;

alter table public.canvas_slots
  add column if not exists lock_height numeric;

alter table public.products
  add column if not exists share_token uuid not null default gen_random_uuid();
