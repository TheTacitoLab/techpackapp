-- ============================================================================
-- 0036 — Rename the 'grading' section to "Size Specifications" (idempotent /
-- safe to re-run)
--
-- The placeholder Grading section becomes the live Size Specifications section
-- (schema 0033, seeds 0034/0035). The KEY stays 'grading' — it's the stable
-- code contract (renderSectionBody switch, openSections localStorage,
-- #section-grading anchors); only the user-facing label and icon change.
-- Naming lock: section = "Size Specifications" · table = "Spec Sheet" ·
-- rules = "Grading Profile" · entry action = "Choose Spec Template".
--
-- 'Ruler' must exist in components/section-icon.tsx's allowlist (added in the
-- same change) or it silently falls back to the generic Component icon.
-- supabase/seed.sql mirrors this row and is updated in the same change —
-- it re-upserts templates after migrations on every `supabase db reset`.
-- ============================================================================

update public.section_templates set
  label = 'Size Specifications', icon = 'Ruler'
where key = 'grading';
