-- ============================================================================
-- 0023 — Fabrics & Trim restructure: two material families (idempotent)
--
-- The Fabrics & Trim annotation layer collapses from four layer_types
-- (fabric / trim / hardware / elastic) to TWO material families:
--   'fabric' — prefix F, unchanged.
--   'trim'   — prefix T, now an UMBRELLA over sub-types (fastener, elastic,
--              binding, drawcord, other). The sub-type lives in the
--              annotation's existing `data` jsonb as `trim_kind` — a stored
--              field shown in the BOM, NEVER encoded in the reference code
--              (all trim pins are plain T1, T2, T3…).
--
-- Existing pins of the affected layer_types are CLEARED here (confirmed
-- acceptable) rather than migrated — old H/E reference codes have no clean
-- mapping into the single T sequence, so a fresh start is the clean cut.
-- No new columns: `trim_kind` is jsonb-internal.
-- ============================================================================

-- 1. Clear existing annotations for the affected material layer types.
delete from public.canvas_annotations
where layer_type in ('fabric', 'trim', 'hardware', 'elastic');

-- 2. The `canvas_layer_type` enum still physically contains 'hardware' and
--    'elastic': Postgres has no cheap way to remove enum values (it takes a
--    full new-type-and-column swap), and unused values are harmless. The app
--    simply stops using them — `createAnnotation` no longer accepts them and
--    no UI offers them (see RETIRED_LAYER_TYPES in types/index.ts).
