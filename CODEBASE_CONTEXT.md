# GarSpec — Codebase Context (handoff doc)

Conventions and load-bearing patterns for a fresh session with no prior
visibility into this repo. For the full audited inventory — every table,
migration, feature, stub, and absence — read **`GARSPEC_BUILD_STATE.md`**
first; this document deliberately does not duplicate it.

Naming note: the app is **GarSpec** (formerly TechPackApp). Document-type
wording ("tech pack") and internal names (`lib/excel-techpack.ts`, the
`/techpack.pdf` and `/techpack.xlsx` routes, `renderTechPack*`) intentionally
keep the old word — it describes the artifact, not the brand.

---

## 1. Stack & architecture (short form)

- **Next.js 16.2.7** (App Router), React 19, TypeScript strict. Next 16
  renamed `middleware.ts` → **`proxy.ts`** — route protection lives there.
  `AGENTS.md` warns: read `node_modules/next/dist/docs/` before assuming
  Next.js conventions from training data.
- **Tailwind CSS v4** — CSS-first `@theme` in `app/globals.css`, no
  `tailwind.config.js`. shadcn/ui (new-york), lucide-react, sonner.
- **Supabase** (Postgres + RLS, Auth, Storage) via `@supabase/ssr`. Client
  factories in `lib/supabase/`: `client` (browser), `server` (RSC/actions),
  `proxy` (session refresh in proxy.ts), `auth` (`getCurrentUser()`,
  React-`cache()`-wrapped), `action-context` (`requireActionContext()`, the
  lean 2-round-trip variant every server action uses).
- **State:** one Zustand store (`stores/ui-store.ts`, persisted as
  localStorage `"garspec-ui"`) for UI state only. Everything else is
  server-fetched props + Server Actions; hot paths patch local state
  optimistically instead of `router.refresh()`. TanStack Query is wired in
  `app/providers.tsx` but essentially vestigial (`hooks/use-products.ts` is a
  self-described pattern stub).
- **Exports:** `@react-pdf/renderer` (`lib/pdf/`) and ExcelJS
  (`lib/excel-techpack.ts`), both consuming the same shared derivations
  (`lib/bom-rows.ts`, `lib/spec-sheet-resolve.ts`) so PDF == Excel == UI.
- RLS on every table, scoped by `workspace_id = public.auth_workspace_id()`
  (SECURITY DEFINER helper). Every server action ALSO does an explicit
  workspace-ownership check — defense in depth; RLS is the real guard.

## 2. The product page & sections

The tech pack is a **single page**, `app/(app)/products/[id]/page.tsx` — no
per-section sub-routing; sections render in `CollapsibleSection` accordions
addressable via `#section-{key}` anchors.

**6 sections** (final state after migrations 0016/0031/0036): `identity`
(Product Setup), `assets` (Asset Upload, `export_to_pdf=false`),
`technical_details` (Technical Details — the canvas), `bom` (Bill of
Materials, auto-generated read-only), `grading` (**Size Specifications** —
key kept for continuity), `documents` (Supplementary Documents —
placeholder). The old standalone `construction` (0016) and `branding` (0031)
sections were deleted; their concerns live in canvas layers. A Change Log
collapsible renders alongside sections but is not a `product_sections` row.

## 3. Canvas system — invariants worth knowing

- Data flow: `product_assets` → `canvas_pages` → `canvas_slots` →
  `canvas_annotations` (+ `canvas_colourways`). Uploads go browser-direct to
  the private `product-assets` bucket (server actions have a ~4MB limit);
  only metadata goes through an action.
- **Five layers** (`components/canvas/layers.ts`): Colourways, Fabrics & Trim,
  Measurements, Construction, Branding & Labels. Every layer now has a
  dedicated pin editor + `-data.ts` reader + structured `data` type in
  `types/index.ts` (`FabricTrimAnnotationData`, `ColourwayAnnotationData`,
  `MeasurementAnnotationData`, `ConstructionAnnotationData`,
  `BrandingLabelAnnotationData`).
- **Frozen design-space box** (0025): pin coords are 0–1 fractions; locking a
  slot freezes its rendered px size into `lock_width × lock_height`, and the
  whole box scales uniformly to the live container — image and pins share one
  frozen space and cannot drift on resize. Geometry/coordinate math has
  exactly ONE implementation per formula (`lib/cover-geometry.ts`,
  `components/canvas/coords.ts`) — never duplicate it.
- **Reference codes:** `LAYER_PREFIX` in `types/index.ts` is the single source
  of truth (F/T/M/CN/S/B/L…). Generic pins count-then-insert per product
  (documented as not concurrency-safe, accepted V1). **Colourways are a
  deliberately separate two-level scheme** (`C{seq}.{n}`,
  `createColourwayAnnotation`) — "do not fold them together" is a standing
  decision, not a TODO.
- Per-page annotation cap: `MAX_ANNOTATIONS_PER_PAGE = 12` (types/index.ts),
  enforced server-side in both create paths and mirrored in the UI.
- Marker colours resolve through `useLayerColours()`
  (`layer-colours-context.tsx`) — never read `defaultColor` directly. Saves go
  through the `update_layer_colours` RPC (0039 accepts all five layer keys).
- Pin/badge/page dragging is hand-rolled pointer events (no dnd-kit/react-dnd
  anywhere). `usePointerDrag` (4px threshold) disambiguates click vs drag.
- Colour sampling (`lib/colour-sample.ts`) replays the exact slot affine onto
  an offscreen 2D canvas — deliberately NOT the Chromium-only `EyeDropper`.
  Any failure returns `null` (manual hex entry), never throws.

## 4. Size Specifications — engine contract

- Multi-sheet per product; each sheet owns its demographic, sizing system,
  size run, sample sizes, mode (`auto`/`manual`), fabric type, profile.
- `lib/spec-grading.ts` is pure and dependency-free (runs under Node
  type-stripping for tests): `gradeSheet()` (Route A — walk outward from the
  sample, unrounded accumulator, 0.1cm display rounding, break-size handling)
  and `detectGrade()` (Route B — derive increments from 2+ entered sizes,
  pre-fill a reviewable profile draft). Computed values are NEVER persisted in
  auto mode; every consumer (UI, PDF, Excel) re-grades live through
  `lib/spec-sheet-resolve.ts`.
- Seeded reference data: 22 spec templates (255 POMs, migration 0034) and 3
  grading profiles (0035) — global read-only, duplicate-to-edit, same
  two-layer pattern as the Master Library.

## 5. Conventions

- **Files:** kebab-case; one primary export per file, named after it. Data
  readers end in `-data.ts`; server actions are verb-first plain async
  functions in `"use server"` files, one file per domain.
- **Server-action pattern** (stated in `canvas-actions.ts` header, followed
  everywhere): zod-parse → `requireActionContext()` → explicit
  workspace-ownership check → mutate → throw on Supabase error →
  `revalidatePath()`.
- **Optimistic state resync** is render-time adjustment, not `useEffect`:
  ```ts
  const [local, setLocal] = useState(prop);
  const [synced, setSynced] = useState(prop);
  if (prop !== synced) { setSynced(prop); setLocal(prop); }
  ```
- **Defensive jsonb readers:** every `data` reader returns all-null on
  malformed input and is the ONLY place that shape is read.
- **Styling:** `cn()` + theme tokens; per-layer/per-status dynamic colours are
  inline `style`, never ad-hoc hex in classNames. `bg-brand` (lime) is
  reserved app-wide for progress/completion/active states.
- **Radix popovers + capture overlays:** don't fade an open `PopoverContent`
  to let clicks through — its portal still intercepts them. Control the
  `open` prop (unmount during pick-mode) and lift draft form state into the
  parent that renders the Popover (see `useColourwayDraftFields` /
  `useColourwaySelectionDraft` in `colourway-pin-editor.tsx`). Follow this
  pattern for any editor with a "re-sample / re-pick" interaction.
- **Comments** explain WHY (invariants, tradeoffs, "do not fold this into X"),
  not WHAT.

## 6. Explicitly avoided / standing decisions

- `EyeDropper` API — never, not even as progressive enhancement.
- `getSession()` on the server — reverted twice; `getUser()` is the rule for
  any server-side auth decision.
- Drag/DnD libraries — all dragging is hand-rolled.
- Konva — the planned future replacement for CSS/HTML pin rendering;
  `page-canvas.tsx` is deliberately isolated so the swap won't touch
  navigation/layers/fullscreen. Not yet done.
- Version snapshots/diffs/restore — deliberate non-goal; the version number
  plus the version-grouped change log IS the versioning model
  (`lib/product-version.ts`).
- Manual BOM rows — the BOM is a pure derived view of Fabrics & Trim pins;
  unlisted-item rows are a later follow-up.

## 7. Verification

`npm test` (Node test runner over `lib/*.test.ts` — grading engine + Excel
builder), `npm run typecheck`, `npm run lint` (the 5 jsx-a11y alt-text
warnings on react-pdf `Image` are known false positives). Known stubs and
gaps (Export Hub placeholder, no `/view/{token}` share route yet, single-user
workspaces, etc.) are catalogued in `GARSPEC_BUILD_STATE.md` §4–5.
