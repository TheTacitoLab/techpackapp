-- ============================================================================
-- 0022 — Per-user preferences (idempotent / safe to re-run)
--
-- Small per-user UI preferences as a jsonb map on `profiles`. First key:
--   hide_unlock_warning (boolean) — suppresses the "this slot has annotations,
--   re-framing may move them" confirm when unlocking a pinned slot. Set by the
--   dialog's "Don't show this again" and by the Settings → Workspace toggle.
--
-- Writes go through the existing `profiles_update_self` RLS policy (0003):
-- each user can only update their own row, so no new policy is needed.
-- ============================================================================

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
