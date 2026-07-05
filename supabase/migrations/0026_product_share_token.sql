-- ============================================================================
-- 0026 — Product share token (idempotent / safe to re-run)
--
-- Unguessable per-product token for the "View online" link in exported PDFs
-- (the /view/{token} destination ships later; the PDF footer needs the URL
-- shape now). The lock-space dims this originally shipped alongside already
-- exist via 0025_slot_lock_dimensions.
-- ============================================================================

alter table public.products
  add column if not exists share_token uuid not null default gen_random_uuid();
