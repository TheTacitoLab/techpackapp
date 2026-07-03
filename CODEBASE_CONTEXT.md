# TechPackApp — Codebase Context (handoff doc)

Audited directly from source on 2026-07-02, branch `claude/new-session-4kjtxh`. This is a reference for a fresh Claude session with no prior visibility into this repo — file paths and type/function names below are exact, not paraphrased.

---

## 1. STACK & ARCHITECTURE

**Framework/language:** Next.js **16.2.7** (App Router, Turbopack), React **19.2.4**, TypeScript **strict** (`tsconfig.json`). `npm run build` / `npm run lint` / `npm run typecheck` are the three verification commands (`package.json`).

> ⚠️ `AGENTS.md` (loaded into every session via `CLAUDE.md`) warns: *"This is NOT the Next.js you know. Breaking changes — read `node_modules/next/dist/docs/` before writing code."* Next 16 renamed `middleware.ts` → **`proxy.ts`** (route protection lives there, not in a `middleware.ts` file).

**Styling:** Tailwind CSS **v4**, CSS-first `@theme`/`@theme inline` blocks in `app/globals.css` — **no `tailwind.config.js`**. shadcn/ui, `"style": "new-york"`, base color `neutral`, CSS variables on (`components.json`). Icons: `lucide-react`. Toasts: `sonner`.

**State management:**
- **Zustand** (`stores/ui-store.ts`, single store `useUiStore`, persisted to localStorage as `"techpack-ui"`) for pure UI/client state: sidebar collapsed, per-section open/closed (`openSections: Record<string, boolean>`), active brand/collection filter, archived toggle.
- **TanStack Query v5** wired via `app/providers.tsx` (`Providers` component) — used by `hooks/use-products.ts` (`useProducts(workspaceId)`).
- Everything else (canvas pages/annotations, identity form, library, labels) is **server-fetched props + local `useState`**, mutated via **Next.js Server Actions** (`"use server"` files), with manual optimistic local-state patching instead of `router.refresh()` on hot paths (documented pattern, see §6).

**Backend/DB:** Supabase (Postgres + Auth + Storage) via `@supabase/ssr` and `@supabase/supabase-js`. Four client factories in `lib/supabase/`:
- `client.ts` — browser client (`createClient()`), used for direct-to-Storage uploads.
- `server.ts` — server component/action client (cookie-based).
- `proxy.ts` — used inside `proxy.ts` (route guard) to refresh the session.
- `auth.ts` — `getCurrentUser()` (React `cache()`-wrapped; returns `{ user, profile, workspace }` or `null`), used by page/layout guards.
- `action-context.ts` — `requireActionContext()`, a leaner 2-round-trip variant (`auth.getUser()` + a single-column `profiles` lookup) used inside every Server Action that only needs `workspaceId`/`userId`, not the full workspace row.

Row Level Security is enabled on every table, scoped by `workspace_id = public.auth_workspace_id()` (a `SECURITY DEFINER` helper, `supabase/migrations/0002_functions_and_triggers.sql`). Every server action **also** does an explicit workspace-ownership check before mutating (defense in depth — RLS is the real guard).

**Hosting/environment:** `.env.example` documents `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` only — no other secrets checked in. No CI config, no Vercel-specific files found in the repo.

### Folder structure (annotated)

```
app/
  (auth)/                       # bare-layout routes: login, signup, reset-password
  (app)/                        # authenticated routes, wrapped in AppShell (app/(app)/layout.tsx)
    dashboard/                  # dashboard/page.tsx + actions.ts (createProduct, etc.)
    products/
      page.tsx                  # product list (hierarchy-filtered)
      [id]/
        page.tsx                # THE tech pack — renders all 7 sections
        actions.ts               # identity save + product-level actions
        canvas-actions.ts        # ALL canvas/annotation/colourway server actions
        identity-schema.ts       # zod schema + option constants for Identity form
    settings/                   # brand/season/library/labels management
  auth/callback/route.ts        # PKCE code-exchange route handler
  layout.tsx                    # root layout: Inter font, Providers, Toaster
  providers.tsx                 # TanStack Query provider
  globals.css                   # Tailwind v4 @theme tokens (see §6)

components/
  canvas/                       # the shared annotation-canvas system (see §3)
  bom/bom-table.tsx             # generated Bill of Materials (read-only, derived)
  ui/                           # shadcn primitives (button, dialog, popover, table, …)
  app-shell.tsx, app-nav.tsx    # authenticated chrome (sidebar nav, top bar)
  identity-section.tsx          # Product Setup form
  library-manager.tsx, labels-manager.tsx, fabric-picker.tsx  # Settings-page managers
  library-item-fields.ts        # shared per-category field config (Settings + inline add)
  library-quick-add-form.tsx    # inline "add to library" sub-view used by pin editors
  library-colour-editor.tsx     # shared colour-variant rows editor
  hierarchy-dialogs.tsx         # Brand/Season/Collection CRUD dialogs
  progress-tracker.tsx, collapsible-section.tsx, section-icon.tsx, status-pill.tsx

lib/
  supabase/                     # client factories (see above)
  colour-sample.ts              # Colourways pixel sampler (§3)
  cover-geometry.ts             # shared image cover+transform math (§3)
  library.ts                    # getWorkspaceLibrary() — Master Library resolver
  utils.ts                      # cn() (clsx + tailwind-merge)

hooks/                          # use-products.ts (TanStack Query), use-debounce.ts
stores/ui-store.ts              # the one Zustand store
types/
  database.types.ts             # hand-written, shaped like `supabase gen types` output
  index.ts                      # domain type aliases + composed/resolved types
supabase/
  migrations/                   # 0001–0019, sequential, idempotent (see §2)
  config.toml, seed.sql
proxy.ts                        # route protection (Next 16's renamed middleware)
```

### Routing

App Router with route groups: `(auth)` (unauthenticated, bare layout) and `(app)` (authenticated, wrapped in `AppShell` from `app/(app)/layout.tsx`, which redirects to `/login` if `getCurrentUser()` returns null). The tech pack itself is a **single page**, `app/(app)/products/[id]/page.tsx` — there is no per-section sub-routing; all 7 sections render on one page inside `CollapsibleSection` accordions, each addressable via `#section-{key}` anchor (`id={`section-${sectionKey}`}` in `CollapsibleSection`). `proxy.ts` is Next 16's renamed `middleware.ts` and handles both auth redirects and Supabase session refresh.

---

## 2. DATA MODEL

Everything below is hand-verified against `types/database.types.ts` (`Database["public"]["Tables"]`) and the migration that created it — **not inferred**.

### Core hierarchy (Phase 1–2)
`workspaces` → `profiles` (1 per user, `role: user_role`) → `brands` → `collections` (brand + optional `season_id`) → `products`. `seasons` is workspace-level, referenced by both `products.season_id` and `collections.season_id`.

`products` row (the tech pack's root): `id, workspace_id, brand_id, collection_id, name, style_number, category, gender, size_range, season_id, designer_name, designer_email, factory_name, factory_country, sample_due_date, delivery_date, wholesale_price, retail_price, status: product_status, created_at, updated_at, archived_at`.

`product_status` enum: `draft | in_review | sent_to_factory | sample_received | approved | in_production`.

### Section system
`section_templates` (global reference data, `key` is the stable contract) × `product_sections` (per-product row, one per template key, `section_key` FK with `ON UPDATE CASCADE`, `status: section_status ('not_started'|'in_progress'|'complete')`, `sort_order`, `is_enabled`, `data: jsonb`).

**Current 7 sections** (final state after `supabase/migrations/0016_section_restructure.sql` — earlier migrations/comments referencing 6 sections or a standalone `construction` key are superseded):

| `key` | `label` | `icon` | sort | `export_to_pdf` | Status |
|---|---|---|---|---|---|
| `identity` | Product Setup | ClipboardList | 10 | true | **Live** |
| `assets` | Asset Upload | Images | 20 | false | **Live** |
| `technical_details` | Technical Details | Layers | 30 | true | **Live** |
| `branding` | Branding, Labelling & Packaging | Tag | 40 | true | Placeholder |
| `bom` | Bill of Materials | ListTree | 50 | true | **Live** (auto-generated, read-only) |
| `grading` | Grading | Table2 | 60 | true | Placeholder |
| `documents` | Supplementary Documents | Paperclip | 70 | true | Placeholder |

Placeholder sections render `"This section is coming in a later phase."` — see the `switch` in `renderSectionBody()`, `app/(app)/products/[id]/page.tsx:197-241`.

**Migration history note** (important for not being misled by old comments): `0004` seeded 6 sections including a standalone `construction` (label "Construction Details"). `0012` only relabeled. `0016` is the one that matters: it renamed `canvas`→`technical_details`, `measurements`→`grading`, `labels`→`branding`, **deleted the standalone `construction` section entirely** (`delete from section_templates where key = 'construction'`) with the comment *"absorbed into Technical Details in Stage 2"*, and added `assets`/`documents`. Any code comment mentioning "Construction Details" as a section is describing the pre-0016 state.

### Identity section data
`IdentitySectionData` (`types/index.ts:66-78`) — the `identity` row's `data` jsonb shape:
```ts
{
  product_description: string | null; key_features: string | null; fit_description: string | null;
  end_use: string | null; fit_type: string | null; internal_notes: string | null;
  last_saved: string | null;
}
```
Structural fields (name, style number, dates, prices, designer, factory, season) live directly on `products`, not duplicated here. Form schema: `app/(app)/products/[id]/identity-schema.ts` (`identityFormSchema`, zod, shared by the RHF client form and the `saveIdentitySection` action in `actions.ts`). Section completion (`in_progress`/`complete`) is computed from 5 "mandatory" fields (name, style_number, category, gender, size_range) — see `saveIdentitySection`.

### Master Library (Phase 3b)
`library_items`: `{ id, category: library_category, source: library_source, workspace_id: string|null, name, description, properties: jsonb, image_url, is_active, created_by, created_at, updated_at }`.
`library_category` enum: `fabric | trim | fastener | elastic | stitch_type | thread | label_type | print_type | packaging | interlining`.
`library_source`: `global | workspace`. `workspace_library_toggles` lets a workspace hide a global item (`hidden: boolean`) without deleting it.
`properties` is freeform jsonb per category — e.g. fabric: `composition, gsm, width_cm, construction, finish, stretch`; fastener: `brand, zip_type, gauge, pull_type`; colour variants live at `properties.colours: [{name, hex, pantone_tcx}]` (NOT a flat `colour` string — confirmed in `components/canvas/fabric-trim-data.ts:73`).
`ResolvedLibraryItem = LibraryItem & { isGlobal: boolean; isHidden: boolean }` — the shape every consumer (canvas picker, BOM) actually receives, produced by `lib/library.ts`'s `getWorkspaceLibrary(category?, { includeHidden? })`.

### Canvas system (Phase 4a+) — the shared engine behind Technical Details
One system powers image annotation for (currently) the Colourways and Fabrics & Trim layers, and (by data-model design, not yet by UI) Measurements and Construction too.

```
product_assets  (product's reusable image library; binaries in private Storage bucket `product-assets`)
  → canvas_pages   (template: 'single'|'split'|'quad'; sort_order)
    → canvas_slots   (slot_index; asset_id; crop_x/crop_y/zoom; is_locked)
      → canvas_annotations   (pins placed on a LOCKED slot only)
```

`canvas_annotations` row: `{ id, slot_id, workspace_id, layer_type: canvas_layer_type, reference_code, x, y, pin_type: 'point'|'line', end_x, end_y, label_offset_x, label_offset_y, colourway_id, data: jsonb, created_by, created_at, updated_at }`. `x`/`y`/`end_x`/`end_y` are **0.0–1.0 fractions of the slot's rendered size** (resolution-independent by design, per `0013_canvas_schema.sql` header comment). `label_offset_x/y` (added in `0018_annotation_label_offset.sql`) are signed fractions for the draggable reference-code badge, relative to the pin tip.

`canvas_layer_type` enum (13 values, `types/database.types.ts:640-653`): `fabric | trim | hardware | elastic | label_component | print | stitch | thread | packaging | measurement | construction_note | detail_callout | colourway`. Note: `label_component`, `print`, `thread`, `packaging`, `detail_callout` exist in the DB enum but have **no owning UI layer yet** (see `components/canvas/layers.ts`, §3/§5) — they're schema headroom, not wired to anything. `hardware` and `elastic` are **RETIRED** (0023 restructure): still physically in the DB enum (Postgres can't cheaply drop enum values) but owned by no layer, rejected by `createAnnotation`, offered nowhere in the UI — trims carry `data.trim_kind` instead, and all pre-0023 material pins were cleared in that migration.

`LAYER_PREFIX` (`types/index.ts`) — single source of truth mapping every `canvas_layer_type` to its reference-code prefix letter: `fabric→F, trim→T, hardware→H, elastic→E, label_component→L, print→P, stitch→S, thread→Th, packaging→Pk, measurement→M, construction_note→CN, detail_callout→DC, colourway→C` (the H/E entries persist only because the record must stay total over the DB enum). The zod enum in `canvas-actions.ts` (`LAYER_TYPES`) is derived from `Object.keys(LAYER_PREFIX)` **minus `RETIRED_LAYER_TYPES`** (`hardware`/`elastic`, retired in 0023, exported next to `LAYER_PREFIX`), so prefixes and accepted inputs can never drift apart.

**Reference-code generation (non-colourway layers):** `createAnnotation()` in `canvas-actions.ts:479-559` counts existing `canvas_annotations` for that `workspace_id` + `layer_type` scoped to the product (via a PostgREST embedded-filter join through `canvas_slots!inner(canvas_pages!inner(product_id))`), then assigns `${LAYER_PREFIX[layerType]}${count+1}`. **Simple, not concurrency-safe** (documented as an acceptable V1 tradeoff — two simultaneous same-layer creates could collide).

**Colourways use a separate, two-level scheme** — see §3.

`ResolvedSlot = CanvasSlot & { asset: ProductAsset | null; annotations: CanvasAnnotation[] }`; `ResolvedCanvasPage = CanvasPage & { slots: ResolvedSlot[] }` — server-assembled shapes (`app/(app)/products/[id]/page.tsx:143-162`) the whole canvas UI consumes; there is no client-side fetch, everything comes down as page props.

### Per-layer annotation `data` jsonb shapes (structured types)
Only two layers have a dedicated structured type; everything else is untyped/legacy:

- **`ColourwayAnnotationData`** (`types/index.ts:151-156`): `{ colour_name, hex, pantone, notes }` — all `string | null`.
- **`FabricTrimAnnotationData`** (`types/index.ts`): `{ library_item_id, library_item_name, category: LibraryCategory|null, composition, colour, gsm: number|null, trim_kind: TrimKind|null, placement, quantity: number|null, unit: 'per_metre'|'per_unit'|'per_kg'|null, supplier_code, notes }`. `TrimKind = 'fastener'|'elastic'|'binding'|'drawcord'|'other'` (0023): set only on trim pins (null for fabric), shown in the BOM/list panel, **never encoded in the reference code** — all trim pins share one plain T sequence.
- **Everything else** (measurement, construction_note, stitch, and any pin created before the dedicated editors existed): generic `{ label, notes }` only — read via `readLegacyLabelNotes` inline in `components/canvas/annotation-summary.ts`. **No dedicated type exists for measurement or construction data yet.**

---

## 3. COLOURWAYS — REFERENCE IMPLEMENTATION

This is the most recently completed, most rigorously verified module (two sessions: grouping/coding, then image-sampling + a popover-interaction bugfix). Treat it as the pattern for building any future dedicated layer editor (e.g. Construction).

### Component files
- `components/canvas/colourway-data.ts` — pure helpers: `isValidHex(value)`, `readColourwayData(data)` (defensive jsonb reader, falls back to legacy `label`→`colour_name`), `colourwayLabel(colourway)` → `"Navy (C1)"`.
- `components/canvas/colourway-pin-editor.tsx` — the editor UI (`ColourwayPinEditor`) **plus** two exported hooks, `useColourwayDraftFields` and `useColourwaySelectionDraft` (see "popover fix" below — these are important, not incidental).
- `lib/cover-geometry.ts` + `lib/colour-sample.ts` — the pixel sampler (below).
- Wiring: `components/canvas/page-canvas.tsx` (`DraftColourwayPin`, `AnnotationSlot`'s pick-mode state), `components/canvas/annotation-pin.tsx` (edit-mode wiring), `components/canvas/technical-details-section.tsx` (owns the optimistic colourway list), `components/canvas/annotation-list-panel.tsx` (grouped list rendering), `app/(app)/products/[id]/canvas-actions.ts` (§"Colourways" section, `createColourway`, `renameColourway`, `createColourwayAnnotation`).

### Grouping — data model + UI
`canvas_colourways` table (`supabase/migrations/0019_colourways.sql`): `{ id, product_id, workspace_id, name, sequence_number, created_at, updated_at }`, `unique(product_id, sequence_number)`. `sequence_number` is **stable forever** — never renumbered. `canvas_annotations.colourway_id` (nullable FK, `on delete cascade`) links a colourway-layer pin to its group; a CHECK constraint (`chk_colourway_id_matches_layer`) enforces `layer_type='colourway' ⟺ colourway_id is not null`.

Colourway **assignment is immutable after pin creation** — there is deliberately no "change colourway" action, only `renameColourway(id, name)` (name only, never touches `sequence_number` or any pin's `reference_code`).

UI: `TechnicalDetailsSection` owns `localColourways`/`syncedColourways` (optimistic list, React render-time resync pattern — see §6) and `lastUsedColourwayId` (which colourway a new pin defaults into). `AnnotationListPanel` renders Colourways specially: when `activeLayerKey === 'colourway'`, it receives `colourwayGroups: ColourwayGroup[]` (`{ colourway, annotations }[]`, built in `PageEditor`, never inside the panel) and renders one heading + sub-list per colourway instead of one flat list — the **only** layer that groups this way; explicitly documented as not a generic multi-level system.

### C1.1 / C2.1 reference-code generation
Deliberately a **separate code path** from `createAnnotation()` — see `canvas-actions.ts:720-923` header comment: *"do not fold them together."*
- `createColourway(productId, name?)`: `sequence_number = count(existing colourways for product) + 1`; default name `"Colourway {n}"` if omitted.
- `createColourwayAnnotation(slotId, x, y, colourwayId, data)`: resolves the target colourway (explicit id → else most-recent → else auto-creates "Colourway 1"), then counts existing `canvas_annotations` with that `colourway_id` and assigns `reference_code = "C{colourway.sequence_number}.{count+1}"` — e.g. first colourway's pins are `C1.1, C1.2, …`, second colourway's are `C2.1, C2.2, …`.
- `colourwayId = null` is a deliberate "zero-extra-steps" affordance: the very first colour pin on a product needs no colourway to exist yet.

### Pin/label dragging — NOT a library, fully custom
No drag library anywhere in the repo (confirmed: no `dnd-kit`, `react-dnd`, `interact.js`, `framer-motion`, `konva` in `package.json`). Pin dragging is custom pointer-event logic:
- `components/canvas/coords.ts` — the ONE shared coordinate helper: `clamp01(value)` and `clientToFraction(clientX, clientY, rect: DOMRect) → {x, y}`, used identically by click-to-place, tip-drag, and badge-drag so a click and a drag onto the same screen point always produce byte-identical fractions.
- `components/canvas/annotation-pin.tsx`'s `usePointerDrag(onDragEnd, onClick)` hook — a from-scratch click-vs-drag disambiguator: tracks `pointerdown`→window `pointermove`/`pointerup`, a `DRAG_THRESHOLD_PX = 4` movement threshold decides "click" (opens the popover) vs "drag" (moves something); callbacks are read through refs so window listeners never need re-binding mid-gesture.
- **Two independent drags** share one pin: dragging the **tip** (the 6px filled dot, `size-1.5`) moves the annotation's real `x`/`y` via `moveAnnotation()`; dragging the **badge** (the reference-code pill) peels only `label_offset_x/y` via `updateLabelOffset()`, connected to the tip by an SVG `LeaderLine`. Both patch local state optimistically then persist, with revert-on-error.
- Anchor precision is load-bearing and documented in detail in the `AnnotationPin` doc comment: the tip `<span>` is the pin's **only in-flow child**, positioned via `left/top = x*slotWidth, y*slotHeight` + `-translate-x-1/2 -translate-y-1/2`, so its exact center lands on the clicked pixel at any `stageZoom` (grid-wide magnifier) or per-slot framing `zoom` — both scale the whole subtree uniformly and can't perturb this local math.

### Cross-browser colour sampler — pure canvas, no library, no `EyeDropper`
Deliberately does **not** use the native `EyeDropper` API (Chromium-only, no Safari/Firefox support) — this was an explicit constraint from the build brief, verified and re-stated in code comments (`lib/colour-sample.ts` header).

- `lib/cover-geometry.ts`: `slotImageCssTransform(cropX, cropY, zoom)` → the CSS transform string (`translate(...) scale(...)`) used verbatim by **both** the framing (`FramingSlot`) and locked (`AnnotationSlot`) `<img>` renderers in `page-canvas.tsx`. `coverSampleTransform(naturalWidth, naturalHeight, boxWidth, boxHeight, cropX, cropY, zoom) → { scale, translateX, translateY }` — the SAME cover+pan+zoom math reproduced as an explicit affine transform, algebraically derived (shown in the file's doc comment) from the CSS behavior, so the visual renderer and the sampler can never drift apart. **Note:** `components/canvas/mini-template.tsx` (the page-overview/thumbnail-strip mini render) still has its own inline `translate()/scale()` transform string rather than calling `slotImageCssTransform` — a third, currently-undeduplicated copy of the same formula (harmless since it's non-interactive/no sampling happens there, but worth knowing if this math is ever touched again).
- `lib/colour-sample.ts`: `sampleColourAtPoint(asset, slot, slotRenderedWidth, slotRenderedHeight, clickXFraction, clickYFraction) → Promise<string | null>`. Loads the image into an in-memory `Image` with `crossOrigin = "anonymous"` (set before `src`), cached by URL (`Map<string, Promise<HTMLImageElement>>`, failed loads evicted so they're retryable), draws it onto an **offscreen** canvas using `ctx.setTransform(...)` from `coverSampleTransform`, then `ctx.getImageData(px, py, 1, 1)` → hex. Wrapped in try/catch; **any failure (CORS/SecurityError, load failure, zero-size slot) returns `null`, never throws**.
- **CORS finding** (documented in the file, no live Supabase connection was available to verify): the `product-assets` bucket is private, served via long-lived signed URLs; Supabase Storage serves permissive `Access-Control-Allow-Origin: *` on object/sign endpoints by default with no per-bucket dashboard toggle exposed — so **no manual CORS configuration step is expected to be needed**. The graceful-degradation path exists regardless.
- Integration: auto-samples at the exact click point **before** the pin editor opens (`AnnotationSlot.sampleAt`, called from `handleCanvasClick` in `page-canvas.tsx`, result passed as `ColourwayPinEditor`'s `initialHex`); a **"Re-sample from image"** button re-enters a dedicated **pick-mode** (`AnnotationSlot`'s `pickMode` state — a distinct flag, never reused/aliased with normal pin-placement state, so a sample click can never be mistaken for placing a new pin) with its own full-slot capture overlay (`z-30`) and an unobtrusive banner/Cancel button; Escape also exits pick-mode.

### The popover-close bugfix (important pattern, not just history)
First implementation faded the open pin-editor popover (opacity + `pointer-events-none`) during pick-mode instead of closing it — this **did not work**: Radix `PopoverContent` renders in a `Portal` to `document.body` with its own `DismissableLayer`/pointer-tracking that intercepts clicks independent of the CSS applied to the visible content, so it silently ate the "click to sample" gesture. **Fix, now the standing pattern:** genuinely control the `Popover`'s `open` prop (`false` during pick-mode, unmounting the portal entirely; `true` again once the sample resolves) — and because that unmounts `ColourwayPinEditor`, its draft form state (colour name/hex/Pantone/notes, and create-mode colourway selection) was **lifted out of the editor into the parent that renders the `Popover`** (`AnnotationPin` for edit mode, `DraftColourwayPin` in `page-canvas.tsx` for create mode — neither of which unmounts during the close/reopen cycle) via `useColourwayDraftFields(initial)` and `useColourwaySelectionDraft(colourways, lastUsedColourwayId)`, both exported from `colourway-pin-editor.tsx`. `ColourwayPinEditor` itself is now a fully controlled component with **zero internal `useState` for form fields**. **Anyone building a second dedicated pin editor with a similar "re-sample"/"re-pick" interaction should follow this exact pattern from the start**, not the fade approach.

### State management specific to this module
- `TechnicalDetailsSection`: `localColourways`/`syncedColourways` (optimistic colourway list, survives navigating overview↔edit), `lastUsedColourwayId`.
- `AnnotationSlot` (`page-canvas.tsx`): `draftPoint: { x, y, hex: string|null } | null` (new-pin draft, `hex` only meaningful for colourway), `pickMode: { resolve: (hex: string|null|undefined) => void } | null` — `resolve` is called with a hex string (success), `null` (sampled but failed), or `undefined` (cancelled without sampling) so callers can distinguish "no change" from "sampled but empty."
- `useColourwayDraftFields`/`useColourwaySelectionDraft` — per-editor-instance draft state, described above.

### Styling conventions in this module
- Per-layer colour is **inline `style`**, never a Tailwind token — explicitly because `bg-brand`/lime is reserved app-wide for progress/completion/active-state only. Since the workspace marker-colours feature, `ANNOTATION_LAYERS[].defaultColor` in `layers.ts` (e.g. Colourways = `#EC4899`) is only the BUILT-IN FALLBACK: the workspace can override each layer's colour (`workspaces.layer_colours` jsonb, migration `0020`), and every render-time consumer resolves through `useLayerColours()` (`layer-colours-context.tsx`, provided in the `(app)` layout) — edited from the Settings "Marker Colours" tab or the canvas toolbar's settings cog, both rendering the shared `components/settings/layer-colours-editor.tsx`.
- Popover content: `w-80 space-y-3` for dedicated editors (vs `w-64` for the generic label/notes fallback).
- Field pattern: `<Label className="text-xs">` + control, wrapped in `space-y-1.5`; buttons use `size="sm"`.
- Hex field: native `<input type="color">` swatch (`size-9 rounded border`) + text `<Input className="w-32 font-mono uppercase" maxLength={7}>`, side by side.

---

## 4. OTHER COMPLETED MODULES

### Fabrics & Trim (the other dedicated canvas layer editor, built one phase before Colourways)
`components/canvas/fabric-trim-pin-editor.tsx` (`FabricTrimPinEditor`) + `components/canvas/fabric-trim-data.ts`. Covers the **two material families** (`fabric|trim`, `FabricFamilyKey`) as one UI layer — the 0023 restructure absorbed the old `hardware`/`elastic` layer_types into `trim`, whose specific kind is the stored field `data.trim_kind` (`fastener|elastic|binding|drawcord|other`), chosen via a "Trim type" dropdown that appears when Trim is selected. Family is a 2-option segmented control, choosable only at creation (fixed forever after, since it determines the reference-code prefix F/T); `trim_kind` stays editable on existing trim pins (descriptive only, never in the code — all trim pins number through one plain T sequence). The Trim family's picker spans library categories `trim`+`fastener`+`elastic` in one list (`FABRIC_FAMILY_LIBRARY_CATEGORIES` — the Master Library keeps its finer categories, untouched by the restructure); picking a fastener/elastic item auto-fills the kind (`trimKindFromLibraryCategory`). Selecting a `FabricPicker` (`components/fabric-picker.tsx`, a cmdk/Command+Popover combobox over `ResolvedLibraryItem[]`) item denormalises fields onto the annotation via `fabricTrimDataFromLibraryItem()` (composition, gsm, supplier_code, category) so the BOM never needs a join back to `library_items`. The picker also carries the inline "add to library" entry point (both this editor and Construction's stitch picker; see §Master Library) — new-item default category for a trim pin comes from `libraryCategoryForTrimKind(trimKind)`. `readFabricTrimData()` falls back to legacy `{label}` for pre-editor pins and null-safes an invalid `trim_kind`. This is the module `components/bom/bom-table.tsx` reads from — the BOM is a pure derived view (two groups, Fabrics then Trims, reference-code sorted; a trim row's Category cell shows its kind, falling back to "Trim"), **no manual add-row**, described as "a preview of the future exported PDF's BOM page."

### Asset Upload (Phase 4b)
`components/canvas/asset-library.tsx` (`AssetLibrary` — grid, rename/delete), `components/canvas/asset-picker.tsx` (`AssetPicker` — combobox used when filling a canvas slot), `components/canvas/asset-upload-section.tsx` (`AssetUploadSection`, the `assets` section body), `components/canvas/asset-upload.ts` (`uploadAsset(file, productId, workspaceId)`, `defaultAssetName()`, `ACCEPTED_IMAGE_TYPES`). Upload is **browser-direct-to-Storage** (bypasses server actions entirely, since they have a ~4MB body limit) — `uploadAsset()` uploads to the private `product-assets` bucket, mints a 1-year signed URL, then calls the small `uploadAssetMetadata()` server action to persist just the row.

### Canvas pages/slots/framing (Phase 4c)
`components/canvas/canvas-templates.tsx` (`TemplatePickerDialog`, `GRID_CLASS`, `TemplateIcon` — single/split/quad layouts), `page-overview.tsx` (`PageOverview`/`PageCard` — drag-to-reorder grid of pages), `page-editor.tsx` (`PageEditor` — the two-axis nav: horizontal layer buttons + vertical page thumbnails + fullscreen Portal), `page-canvas.tsx` (`PageCanvas`/`SlotView`/`EmptySlot`/`FramingSlot`/`AnnotationSlot` — the actual image render + pan/zoom/lock state machine), `page-thumbnail-strip.tsx`, `page-name-editor.tsx` (inline double-click-to-rename, reused by both overview cards and the thumbnail strip), `mini-template.tsx` (non-interactive thumbnail render), `layer-button.tsx`, `layers.ts` (see §3/§5), `annotation-list-panel.tsx`, `annotation-summary.ts` (`getAnnotationSummary()` — the one place per-layer tooltip/list-row formatting is centralized).

### Master Library (Phase 3b)
`components/library-manager.tsx` (`LibraryManager`, Settings page) — CRUD over `library_items` with per-category dynamic property fields, global-item hide/show toggle. The per-category field definitions (`FIELD_CONFIG: Record<LibraryCategory, FieldDef[]>`), `CATEGORY_META`/`CATEGORY_SINGULAR` labels, colour helpers and `buildLibraryProperties()` live in the SHARED `components/library-item-fields.ts` (with `ColourEditor` in `components/library-colour-editor.tsx`) — one source of truth consumed by BOTH the Settings form and the annotation editors' inline quick-add (`components/library-quick-add-form.tsx`, `LibraryQuickAddForm` + `useInlineAddedLibraryItems`). Inline add is category-driven end-to-end: `FabricPicker` takes `onCreateNew(searchText)`/`createLabel` (a pinned action under the result list — the search text pre-fills the new item's name), the editor swaps its dialog body to the quick-add sub-view (NEVER a second dialog; all in-progress pin state stays mounted), and creation goes through the same `createLibraryItem` action (workspace-scoped, now returns the full row so the new item is auto-selected instantly; `router.refresh()` then syncs the server-passed library everywhere). A future layer (Branding & Labels) inherits this by passing its categories to the picker/form. Server actions in `app/(app)/settings/actions.ts`: `createLibraryItem`, `updateLibraryItem`, `deleteLibraryItem`, `toggleGlobalItem`. Resolved for consumption via `lib/library.ts`'s `getWorkspaceLibrary()`.

### Labels (Phase 2)
`components/labels-manager.tsx` (`LabelsManager`, Settings), `components/product-labels.tsx` (`ProductLabels`, the header chip-picker on the product page). Actions: `createLabel`, `updateLabel`, `deleteLabel`, `addLabelToProduct`, `removeLabelFromProduct` (`app/(app)/settings/actions.ts`). Simple `labels`/`product_labels` many-to-many, workspace-scoped.

### Identity / Product Setup (Phase 3c–3d)
`components/identity-section.tsx` (`IdentitySection`) — React Hook Form + zod (`identityFormSchema`), live status-indicator computation per field group (`computeCoreStatus`, `computeOwnershipStatus`, `computeProductionStatus` — referenced via `form.watch()`). Saves via `saveIdentitySection()` in `app/(app)/products/[id]/actions.ts`, which writes both `products` columns and the `identity` section's `data` jsonb in parallel, and recomputes `section_status`.

### Product hierarchy + dashboard (Phase 1–2)
`components/dashboard-client.tsx`, `components/product-card.tsx`, `components/create-product-dialog.tsx`, `components/hierarchy-dialogs.tsx` (Brand/Season/Collection create/rename/delete dialogs), `components/progress-tracker.tsx` (the slim per-product completion bar, consumed on both the dashboard and the sticky product-page header), `components/status-pill.tsx` (`STATUS_LABELS`, `StatusPill`), `components/product-status-control.tsx`. Filtering/active-brand/active-collection state lives in the Zustand `useUiStore`, not URL params.

---

## 5. CONSTRUCTION MODULE — CURRENT STATE

**There is no standalone Construction section, route, or page.** It was explicitly removed: `supabase/migrations/0016_section_restructure.sql` deletes the `construction` row from both `section_templates` and `product_sections` with the comment *"drops the standalone `construction` section (absorbed into Technical Details in Stage 2)"*.

**What exists today** — Construction is the **4th annotation layer inside Technical Details**, already scaffolded in the shared canvas system but with **no dedicated editor UI, no dedicated data type, and no dedicated summary formatting**:

- `components/canvas/layers.ts`, `ANNOTATION_LAYERS` array: `{ key: "construction", label: "Construction", icon: "Hammer", color: "#8B5CF6", types: ["construction_note", "stitch"], primaryType: "construction_note" }`. The layer button (`LayerButton`, in the horizontal nav row of `PageEditor`) already renders for it, with a live global annotation count, identically to Colourways/Fabrics/Measurements.
- `canvas_layer_type` enum already includes `construction_note` and `stitch` (also `label_component`, `print`, `thread`, `packaging`, `detail_callout` — unused by any layer at all).
- `LAYER_PREFIX` already maps `construction_note → "CN"`, `stitch → "S"`, so `createAnnotation()` (the generic, single-counter reference-code path — **not** the two-level colourway path) already works end-to-end for construction pins today, mechanically.
- **What's missing, concretely:**
  1. No `ConstructionAnnotationData` type in `types/index.ts` (compare `ColourwayAnnotationData`/`FabricTrimAnnotationData`).
  2. No `construction-pin-editor.tsx` / `construction-data.ts` files. `annotation-pin.tsx`'s `hasDedicatedEditor = isFabricFamily || isColourway` — **construction and measurement both fall through to the generic label/notes form** (the `<>...</>` branch at the bottom of `annotation-pin.tsx`'s `PopoverContent`), same as any layer with no dedicated editor.
  3. `getAnnotationSummary()` (`annotation-summary.ts`) has no `layer?.key === "construction"` branch — falls to the generic `readLegacyLabelNotes` case.
  4. No generated-table consumer analogous to `BomTable` (which reads Fabrics & Trim). No "Construction Details" section body exists to render one even if built — construction annotations would need a new home (either inside `technical_details`'s section body, or a case added to `renderSectionBody()` for one of the currently-placeholder sections).
  5. No image-sampling equivalent needed here (that's Colourways-specific), but the **pin/label-drag infrastructure, coordinate helpers, and pick-mode-style patterns are all layer-agnostic already** and would be reused as-is.

**Naming already implied elsewhere:** the DB enum value is `construction_note` (not `construction`), the layer key is `construction`, the historical (now-deleted) section key was `construction`, and the historical section label was "Construction Details" (`0012_section_labels.sql`, superseded). No test files or nav references exist beyond `layers.ts` and the enum. If a future session builds this, the natural pattern to mirror is Colourways or Fabrics & Trim exactly: a `construction-data.ts` (readers/type), a `construction-pin-editor.tsx`, a branch in `annotation-pin.tsx`'s `hasDedicatedEditor` + edit-mode dispatch, a branch in `DraftColourwayPin`-equivalent create flow (or reuse the simpler immediate-create path like Measurements would, since construction likely doesn't need Colourway's "defer creation until sub-type chosen" pattern — Fabrics & Trim needed it because sub-type picks the reference-code prefix; construction has only 2 sub-types, `construction_note`/`stitch`, so a `DraftFabricPin`-style deferred flow may or may not be warranted, worth deciding explicitly rather than assuming).

---

## 6. CONVENTIONS

**File naming:** kebab-case everywhere (`colourway-pin-editor.tsx`, `annotation-list-panel.tsx`). One primary export per file, named after the file (PascalCase component matching kebab-case filename). Data/helper modules end in `-data.ts` (`colourway-data.ts`, `fabric-trim-data.ts`) or are verb-first utility files (`cover-geometry.ts`, `colour-sample.ts`).

**Component/function naming:** `PascalCase` components, `camelCase` functions/hooks. Hooks are real hooks (`useColourwayDraftFields`, `usePointerDrag`, `useDebounce`) — not "helper functions that happen to start with use." Server actions are plain async functions in `"use server"` files, verb-first (`createAnnotation`, `updateSlotFraming`, `deleteAsset`), one file per domain (`canvas-actions.ts`, `settings/actions.ts`, `products/[id]/actions.ts`, `dashboard/actions.ts`).

**CSS:** Tailwind utility classes inline via `cn()` (`lib/utils.ts`, `clsx` + `tailwind-merge`) — no CSS modules, no styled-components. Design tokens are custom CSS variables in `app/globals.css` under `@theme`/`@theme inline`, consumed as Tailwind utilities (`bg-brand`, `text-sidebar-foreground`, `shadow-card`). Per-item dynamic colours (per-layer, per-status) are inline `style={{...}}`, never ad-hoc hex in `className`. Status colors: `--color-status-{draft|progress|review|factory|sample|approved|production}-{bg|fg}`.

**Server-action pattern** (stated explicitly in `canvas-actions.ts` header, followed everywhere): zod-parse inputs → `requireActionContext()` (throw if unauthenticated) → explicit workspace-ownership check (never trust a client-supplied id) → mutate → throw on Supabase error → `revalidatePath()`.

**Optimistic local state over `router.refresh()`:** hot paths (pin create/move/delete, colourway create/rename) mutate local component state directly and call the server action in the background (with revert-on-catch), rather than `router.refresh()`-ing the whole page. Where server data legitimately needs to resync into local state (e.g. after a `router.refresh()` elsewhere), the pattern is **render-time state adjustment**, not `useEffect`:
```ts
const [local, setLocal] = useState(prop);
const [synced, setSynced] = useState(prop);
if (prop !== synced) { setSynced(prop); setLocal(prop); }
```
(seen in `PageEditor.localPages`, `TechnicalDetailsSection.localColourways`, `PageNameEditor.displayName`).

**Defensive jsonb readers:** every `data: jsonb` reader (`readColourwayData`, `readFabricTrimData`, `readLegacyLabelNotes`) returns all-null on missing/malformed input rather than throwing, and is the ONLY place that shape is read — never inline `JSON` poking elsewhere.

**Shared geometry/coordinate math must have exactly one implementation** — explicitly called out and enforced in the Colourways session (`coords.ts`, `cover-geometry.ts`): if display math and interaction math (or two different interactions) need the same formula, extract it to one function both call, rather than risk drift. (The one known violation of this — `mini-template.tsx`'s inline transform — predates that rule being made explicit.)

**Comments:** doc comments explain WHY (a subtle invariant, a documented tradeoff, a "do not fold this into X" warning), not WHAT. Several files carry temporary diagnostic `console.log`/`console.time` instrumentation explicitly marked `// TEMP diagnostic` or `[TIMING]` — these are intentional, left in for an active performance investigation (pin-placement latency), not dead debug code to blindly strip.

**Explicitly avoided / decided against** (from code comments):
- `EyeDropper` API — deliberately not used anywhere, even as a progressive enhancement (Colourways sampler, see §3).
- `getSession()` on the server — reverted twice (`lib/supabase/auth.ts`, `lib/supabase/action-context.ts` comments) after it "coincided with app-wide server-action failures"; `getUser()` is the standing rule for any server-side auth check.
- Drag/DnD libraries — no `dnd-kit`/`react-dnd`/etc.; all pin/badge/page-reorder dragging is hand-rolled pointer events or native HTML5 `draggable`.
- Konva — mentioned repeatedly in comments as the **planned future replacement** for the current CSS/HTML pin rendering (`page-canvas.tsx` docblock: *"deliberately isolated so a future session can swap the CSS image/HTML-pin internals for Konva without touching navigation, layers, or fullscreen"*) — not yet done.
- Folding Colourways' two-level reference-code scheme into the generic `createAnnotation()` counter — explicitly called out as a permanent design decision, not a TODO.

---

## 7. OPEN QUESTIONS / KNOWN GAPS

Relevant to building Construction next, roughly in the order a session would hit them:

1. **Where does a Construction pin editor live, and does it need a deferred-create pattern?** Fabrics & Trim defers `createAnnotation` until save because sub-type choice determines the reference-code prefix (`DraftFabricPin`). Colourways defers for the same reason plus colourway-group choice (`DraftColourwayPin`). Construction has 2 sub-types (`construction_note`, `stitch`) mapped to prefixes `CN`/`S` — if sub-type needs choosing before creation the same deferred pattern applies; if there's always exactly one obvious type per interaction, the simpler immediate-create path (like Measurements currently uses, generic layer, no dedicated editor at all yet either) might suffice. **Not decided anywhere in the codebase.**
2. **No `ConstructionAnnotationData` type exists.** What fields does a construction-note or stitch-spec pin actually need? (SPI/stitch-per-inch, seam type, construction method are hinted at only in an old, now-superseded comment in `types/index.ts:59-64` about `construction_method` being a stale jsonb key from Phase 3c — not a spec for the new layer.)
3. **Measurements is in the same boat** (also `types: ["measurement"]`, also no dedicated editor/type/summary) — if Construction gets built, ask whether Measurements should get the same treatment in the same pass, since they're currently identical in maturity (both fully wired at the layer/DB level, both zero UI).
4. **No PDF export exists at all** (`README.md`: *"Deferred to later phases: canvas/Konva [done since], BOM [done since], measurements, construction/labels, PDF export, factory portal, versioning, billing"* — README is stale re: canvas/BOM but accurate that PDF export hasn't started). `export_to_pdf: boolean` exists on `section_templates` already (`true` for every section except `assets`) but nothing reads it yet.
5. **Where does a generated Construction "table" (BOM-equivalent) render, if one is wanted?** `BomTable` is a good template (derives its rows straight from canvas annotations, grouped, reference-code sorted) but there's no section slot for it yet — would need either a new `renderSectionBody()` case in `products/[id]/page.tsx` or to live inside the `technical_details` body itself.
6. **`mini-template.tsx`'s duplicated transform math** (§6) — low-priority but flagged: if any future geometry change touches `cover-geometry.ts`, remember this third copy exists and currently won't pick up the change automatically.
7. **Concurrency safety of reference-code counting** is a known, accepted V1 gap (`createAnnotation` and `createColourwayAnnotation` both count-then-insert, not atomic) — not blocking, but would need addressing before this is safe under real concurrent multi-user editing.
