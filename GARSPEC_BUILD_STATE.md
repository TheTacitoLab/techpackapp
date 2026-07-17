# GarSpec — Build State Inventory

Read-only audit of the codebase as it exists on branch `claude/new-session-b2eecq` at commit `e672232` (2026-07-08). Every claim below is grounded in the actual code; anything uncertain is marked **unverified**. The most important distinction throughout: **implemented** vs **stubbed** vs **not present**.

> **Addendum — housekeeping session applied after this snapshot:** migration
> `0039` fixed the Branding & Labels marker-colour bug (§4); the TechPack →
> GarSpec rebrand sweep landed (shell/auth/metadata/package name, Zustand key
> now `garspec-ui`); the dead "View online" link was removed from the PDF
> footer (token plumbing kept); an `/update-password` page now completes the
> reset flow; the `[DIAG]`/`console.time` instrumentation was stripped; and
> `README.md`, `CODEBASE_CONTEXT.md` and the grading reference doc were
> corrected against reality. Statements below about those items describe the
> pre-session state.

> **Addendum — collections & navigation session (migrations 0040–0042):**
> product templates (0040) and the workspace colour library (0041) landed in
> earlier sessions; this session added **0042** — `collections.parent_id`
> (ONE level of nesting, DB trigger + server actions enforce depth) and
> `collection_labels` (workspace labels on collections, mirroring
> `product_labels`). New surfaces: **/collections** (visual dashboard of
> top-level collection cards — derived 4-image cover mosaics, brand/label
> chips, roll-up counts+progress incl. subs, pin toggles, search/brand/label
> filters), **/collections/[id]** (detail: editable labels, roll-up progress,
> sub-collection card row, direct-products grid with include-subs toggle,
> breadcrumb, "New Product" pre-selecting the collection) and **/archive**
> (archived products as a route). Per-user **pins** (max 10 products and/or
> collections, ordered `{type,id}` array in `profiles.preferences.pins`)
> render in the restructured sidebar: Dashboard / All Products / Collections
> / PINNED / (bottom) Settings, Archive, user menu. **Retired:** the
> active-brand/active-collection/show-archived Zustand model and its
> components (`brand-bootstrap`, `settings-brand-switcher`,
> `CreateCollectionDialogSimple`, sidebar collections list, launchpad
> "Switch Brand" link) — the launchpad is workspace-wide now; products
> placed in a collection adopt its brand server-side; sub-collections
> inherit the parent's brand. Statements below about the sidebar, launchpad
> brand scoping, or the archived toggle describe the pre-session state.

> **Addendum — Master Library session (migrations 0044–0045):** seven new
> global stitch types (No Visible Stitch, Single-Needle Topstitch,
> Twin-Needle Topstitch One Side / Straddling Seam, Flatlock, Turned Hem
> Single / Twin Stitch), each with an inline base64 SVG diagram rescaled to
> the library's 120×80 convention (0044). The `library_category` enum value
> `print_type` was **renamed to `embellishment`** — a real key rename
> (`ALTER TYPE … RENAME VALUE`), labels now "Embellishments"; the nine
> seeded print items carry over automatically and `canvas_layer_type`'s
> retired `print` value was deliberately left untouched. Four embellishment
> items added: Direct Embroidery, Blockout DTF, Sublimated Patch, Screen
> Print Sticker (0044). **Library favourites** landed per-workspace:
> `library_favourites` join table + RLS mirroring the toggles table (0045),
> `toggleFavouriteItem` server action, a star toggle on every item in
> Settings → Master Library, and a pinned "Favourites" group at the top of
> the shared annotation library picker (`fabric-picker.tsx`, driven by
> `ResolvedLibraryItem.isFavourite` + `lib/favourites.ts`). This session
> originally branched from a point without migration 0043; a follow-up
> reconciliation merge (`c6c17ad`) brought the partner-foundation branch in,
> so the sequence now runs 0042 → **0043 (partners)** → 0044 → 0045 on one
> branch — 0043 is applied live, 0044/0045 still need manual application.
> Statements below about the library category list or item counts describe
> the pre-session state.

---

## 1. Stack & Infrastructure

- **Framework:** Next.js **16.2.7** (App Router; note: middleware is renamed `proxy.ts` in this version — see `proxy.ts` + `lib/supabase/proxy.ts`). React **19.2.4**. TypeScript 5.
- **Language/style:** TypeScript throughout; Tailwind CSS **v4** (CSS-first config in `app/globals.css` `@theme` — there is **no** `tailwind.config.js`); shadcn/Radix UI components (`components/ui/`), lucide-react icons, sonner toasts, Inter font.
- **Canvas approach:** plain CSS/HTML — absolutely-positioned pin elements over `<img>` slots, CSS transforms for zoom/pan. **No Konva/canvas library** (a Konva swap is explicitly anticipated in comments — `components/canvas/page-canvas.tsx:174-189`).
- **Backend:** Supabase — Postgres + RLS, Auth (email/password via `@supabase/ssr` 0.12 / `supabase-js` 2.108), Storage (one private bucket `product-assets`). 38 SQL migrations in `supabase/migrations/`.
- **Hosting:** unverified. Auth callback handles Netlify's `x-forwarded-host` (`app/auth/callback/route.ts`), suggesting Netlify.
- **PDF:** `@react-pdf/renderer` **4.5.1**, server-side `renderToBuffer` (`lib/pdf/`).
- **Spreadsheet:** `exceljs` **4.4.0** (`lib/excel-techpack.ts`) — real .xlsx export exists.
- **State:** Zustand 5 (one UI store, `stores/ui-store.ts`, persisted as localStorage `techpack-ui`). TanStack Query v5 is wired in `app/providers.tsx` but essentially vestigial — the app is server-fetched props + Server Actions + `router.refresh()`; the only consumer (`hooks/use-products.ts`) self-describes as a "pattern stub".
- **Forms:** react-hook-form 7 + zod 4 (`@hookform/resolvers`); zod also re-validates inside every server action.
- **App name — inconsistent (partial rebrand in progress):** app shell/auth/metadata still say **"TechPack" / "TechPackApp"** (`app/layout.tsx`, `components/app-shell.tsx`, `app/(auth)/layout.tsx`); export and spec surfaces say **"GarSpec"** (`lib/pdf/branding.ts` `PDF_BRAND_NAME`, Excel `workbook.creator`, "GarSpec standard" in spec/profile pickers, `docs/GarSpec_*.md`).
- **Brand colours** (`app/globals.css`): lime accent `#C8F000` (`--color-brand`, focus ring), navy `#1A1A2E` (`--primary`, sidebar), warm-neutral light background `#F6F5F3` (a `.dark` theme is defined but **not applied by default**). PDF chrome: ink `#1C1917`, muted `#78716C`, hairline `#D6D3D1`, link blue `#2563EB`.
- **Share domain:** `SHARE_BASE_URL = "https://app.garspec.com/view/"` (`lib/pdf/branding.ts`), marked "pending final confirmation". The `/view/{token}` route itself is **not built** (see §4).
- **Desktop-only:** app shell enforces `min-w-[1280px]` (`components/app-shell.tsx`).

---

## 2. Data Model

**Latest migration: 0038.** 25 public tables, **all RLS-enabled** (no gaps found). Central scoping helper: `public.auth_workspace_id()` (SECURITY DEFINER; returns the caller's single `profiles.workspace_id`). There is no `is_workspace_member` — membership is "row's `workspace_id` = caller's workspace" (one workspace per user).

### Migrations in order

| # | What it does |
|---|---|
| 0001 | Enums `user_role`, `product_status`, `section_status`; tables `workspaces`, `profiles`, `brands`, `seasons`, `collections`, `products`, `section_templates`, `product_sections` |
| 0002 | `auth_workspace_id()` RLS helper, `set_updated_at()` trigger fn, `handle_new_user()` (auto workspace+profile on signup) |
| 0003 | RLS enabled + workspace-scoped policies on all 8 base tables |
| 0004 | Seeds 6 section templates (identity, canvas, bom, measurements, construction, labels) |
| 0005 | `products.archived_at` (soft archive) |
| 0006 | `user_role` rename → `admin, designer, approver, viewer, factory` |
| 0007 | `labels` + `product_labels` (workspace colour tags on products) + RLS |
| 0008 | Library schema: `platform_admins`, `library_items` (global/workspace two-layer), `workspace_library_toggles`; enums `library_category`, `library_source` |
| 0009 | Library RLS + `is_platform_admin()` helper |
| 0010 | Seeds **96 global library items** across 10 categories (see below) |
| 0011 | Product identity columns: designer/factory/dates/wholesale+retail price/season_id |
| 0012 | Section display-label rename (keys unchanged) |
| 0013 | Canvas schema: `product_assets`, `canvas_pages`, `canvas_slots`, `canvas_annotations`; enums `canvas_template`, `canvas_layer_type` |
| 0014 | Canvas RLS |
| 0015 | Private Storage bucket `product-assets` + 4 object policies (first path segment must equal caller's workspace_id) |
| 0016 | Section restructure: adds `export_to_pdf`; renames canvas→`technical_details`, measurements→`grading`, labels→`branding`; drops `construction`; adds `assets`, `documents` |
| 0017 | Adds `colourway` layer enum value |
| 0018 | `canvas_annotations.label_offset_x/y` (draggable code badge) |
| 0019 | `canvas_colourways` table + `colourway_id` FK/CHECK on annotations |
| 0020 | `workspaces.layer_colours` jsonb + `update_layer_colours()` fn (**only validates 4 layer keys — see bug in §4**) |
| 0021 | `canvas_slots.fit_mode` ('fill'/'fit') |
| 0022 | `profiles.preferences` jsonb |
| 0023 | Trim restructure (data reset of fabric/trim/hardware/elastic pins; hardware/elastic retired in app) |
| 0024 | Adds `branding` + `label` layer enum values |
| 0025 | `canvas_slots.lock_width/lock_height` (frozen design-space box; annotation data reset) |
| 0026 | `products.share_token` uuid (default `gen_random_uuid()`; `/view/{token}` "ships later") |
| 0027 | `canvas_pages.notes` |
| 0028 | Adds `triple` canvas template |
| 0029 | `canvas_slots.name` |
| 0030 | Data fix: realign `product_sections.sort_order` |
| 0031 | Deletes the standalone `branding` section (absorbed into canvas layer) |
| 0032 | `products.hero_asset_id` (PDF cover image) |
| 0033 | Spec schema: `spec_templates`, `spec_template_poms`, `grading_profiles`, `product_spec_sheets`, `product_spec_rows`, `product_spec_values` + 5 spec enums + RLS |
| 0034 | Seeds **22 global spec templates** with **255 POMs** total |
| 0035 | Seeds **3 global grading profiles** (Men's, Women's, Youth Unisex) |
| 0036 | Relabels `grading` section → "Size Specifications" (key unchanged) |
| 0037 | Multi-sheet: drops sheet-per-product UNIQUE; adds `name`, `demographic`, `sizing_system`, `size_run[]`, `sample_sizes[]`, `is_complete`; enums `spec_demographic`, `spec_sizing_system`; status backfill |
| 0038 | `products.version_major/minor`, `product_sections.completed_manually`, append-only `product_change_log` table |

### Tables (final state; all RLS-enabled; `ws` = `workspace_id` FK)

- **workspaces** — name, owner_id, `layer_colours` jsonb. Owner-only UPDATE; member colour edits go through `update_layer_colours()` RPC.
- **profiles** — id = auth.users.id (1:1), ws, full_name, role (`user_role`, default `admin`), `preferences` jsonb.
- **brands** — ws, name, `logo_url`. **seasons** — ws, name, year. **collections** — ws, brand_id, season_id.
- **products** — ws, brand_id, collection_id, name, style_number, category, gender, `size_range` (free text), status, archived_at, designer_name/email, factory_name/country, sample_due_date, delivery_date, wholesale_price/retail_price numeric(10,2), season_id, `share_token` uuid, hero_asset_id, `version_major`/`version_minor`.
- **section_templates** — key UNIQUE, label, icon, default_sort_order, `export_to_pdf`. Global read-only; **6 rows** final: identity(10), assets(20, export_to_pdf=false), technical_details(30), bom(50), grading(60), documents(70). Sort 40 vacant (branding removed).
- **product_sections** — product_id, section_key (FK→templates.key ON UPDATE CASCADE), status enum, sort_order, is_enabled, `data` jsonb, `completed_manually`. UNIQUE(product_id, section_key).
- **labels** / **product_labels** — workspace colour tags M:N to products.
- **platform_admins** — staff allowed to write global library rows (populated manually via service role; no in-app path).
- **library_items** — category, source (`global`/`workspace`), ws nullable (CHECK source↔ws), name, description, `properties` jsonb, image_url, is_active. **workspace_library_toggles** — hide global items per workspace.
- **product_assets** — product_id, ws, name, file_path, file_url, width/height.
- **canvas_pages** — product_id, ws, template (`single|split|triple|quad`), label, `notes`, sort_order. Pages belong to the **product**, not a section.
- **canvas_slots** — page_id, slot_index, asset_id, crop_x/crop_y/zoom, is_locked, `fit_mode`, `lock_width`/`lock_height`, `name`. UNIQUE(page_id, slot_index).
- **canvas_annotations** — slot_id, ws, layer_type, reference_code, x/y (0–1 fractions), pin_type (`point`/`line`), end_x/end_y, `label_offset_x/y`, colourway_id (+CHECK matches layer), `data` jsonb.
- **canvas_colourways** — product_id, ws, name, sequence_number (UNIQUE per product).
- **spec_templates** / **spec_template_poms** — two-layer library; POMs: code, name, how_to_measure, grade_category, sub_kind, sort_order (UNIQUE(template_id, code)).
- **grading_profiles** — two-layer library; size_run_labels[], break_size_label, base_increments/extended_increments jsonb, tolerances_knit/woven jsonb.
- **product_spec_sheets** — product_id (many per product since 0037), template_id/template_name, mode (`auto`/`manual`), sample_size_label (grading anchor), grading_profile_id, fabric_type (`knit`/`woven`), unit (`'cm'` hardcoded V1), name, demographic, sizing_system, size_run[], sample_sizes[], is_complete.
- **product_spec_rows** / **product_spec_values** — product-owned copies of POM rows + entered values (UNIQUE(row_id, size_label); `tolerance_override` per row).
- **product_change_log** — **append-only** (SELECT+INSERT policies only): product_id, ws, version, area, description, `data` jsonb, actor_id (nullable, deliberately unpopulated pending collaboration).

### Enums (final values)

- `user_role`: admin, designer, approver, viewer, factory — **inert** (no team/permissions logic anywhere).
- `product_status`: draft, in_review, sent_to_factory, sample_received, approved, in_production.
- `section_status`: not_started, in_progress, complete.
- `library_category` (10): fabric, trim, fastener, elastic, stitch_type, thread, label_type, print_type, packaging, interlining.
- `library_source`: global, workspace.
- `canvas_template`: single, split, quad, triple.
- `canvas_layer_type` (15 in DB): fabric, trim, hardware, elastic, label_component, print, stitch, thread, packaging, measurement, construction_note, detail_callout, colourway, branding, label. Retired in-app but kept in DB (`RETIRED_LAYER_TYPES`, `types/index.ts`): hardware, elastic, label_component, print.
- Spec enums: `spec_template_category` (tops, bottoms, outerwear, performance, womenswear, accessories), `spec_grade_category` (primary_girth, secondary_girth, body_length, limb_length, small, fixed), `spec_pom_sub_kind` (shoulder, neck, cuff_opening, rise, strap, inseam), `spec_sheet_mode` (auto, manual), `spec_fabric_type` (knit, woven), `spec_demographic` (youth, mens, womens, custom), `spec_sizing_system` (alpha, numeric).

### Seeded master-library data (global, read-only to workspaces)

- **section_templates:** 6 rows (above).
- **library_items:** **96 rows** (verified by counting seed tuples in 0010): fabric 15, trim 6, fastener 17 (11 zips/buttons + 6 hardware), elastic 9, stitch_type 14 (each with an inline base64 SVG diagram), thread 7, label_type 7, print_type 9, packaging 7, interlining 5. Fabrics/trims/fasteners/elastics/thread carry default colourways (Black/White/Navy/Volt) in `properties.colours`.
- **spec_templates:** **22 rows** — tops 5 (T-Shirt/Tee, Long-Sleeve Tee, Polo, Hoodie/Sweatshirt, Vest/Tank), bottoms 5 (Joggers, Shorts, Leggings, Trousers, Jeans), outerwear 2 (Zip Hoodie/Track Jacket, Jacket/Coat), performance 3 (Football Jersey, Sports Shorts, Base Layer), womenswear 5 (Sports Bra, Crop Top, Dress, Skirt, Bodysuit), accessories 2 (Beanie/Cap, Bag/Tote) — with **255 POM rows** total.
- **grading_profiles:** **3 rows** — Men's (S–6XL, break at 2XL, extended increments), Women's (XS–6XL, break 2XL, incl. `small_strap`), Youth Unisex (YXXS–YXL, no break, inseam grades 2.5). Knit/woven tolerance sets per profile.

### Functions, triggers, storage

- Functions: `auth_workspace_id()`, `is_platform_admin()`, `update_layer_colours(jsonb)` (all SECURITY DEFINER), `set_updated_at()`, `handle_new_user()`.
- Triggers: `on_auth_user_created` (auth.users); `updated_at` triggers on products, library_items, canvas_pages, canvas_annotations, canvas_colourways, and all 5 spec tables.
- Storage: one private bucket **`product-assets`**; key convention `{workspace_id}/{product_id}/{timestamp}_{filename}` (brand logos under `{workspace_id}/brand-logos/`); 4 policies (read/insert/update/delete) requiring first path segment = `auth_workspace_id()`.

---

## 3. Features — implemented

### Auth & workspaces
- Email/password only (no OAuth): signup with full name + workspace name (`app/(auth)/signup/page.tsx`, supports email-confirmation flow), login, password-reset **request** (no update-password page — reset link redirects to `/login`), PKCE callback (`app/auth/callback/route.ts`), sign-out in the user menu.
- Workspace auto-created on signup by the `handle_new_user()` trigger; **strictly one workspace per user, single-user** — no members, invites, or role enforcement.
- Route protection: `proxy.ts` (Next 16 middleware) redirects unauthenticated → `/login` and authenticated → `/dashboard`; defense-in-depth via `getCurrentUser()` in layouts/pages and `requireActionContext()` + explicit workspace-ownership checks in every server action; RLS is the real guard.

### Product structure
- Hierarchy: workspace → brands → collections (brand + optional season) → products; `seasons` workspace-level. CRUD via `app/(app)/dashboard/actions.ts` + `components/hierarchy-dialogs.tsx`.
- **Product Setup** (identity) section — `components/identity-section.tsx`, saved by `saveIdentitySection`: Core Identity (name*, style_number, category, gender, free-text `size_range`, season, product_description, key_features, fit_description), Brand & Ownership (designer name/email), Production Tracking (factory name/country, sample due, delivery, wholesale/retail price — **£ hardcoded**), Use & Fit (end_use, fit_type), Admin & Metadata (read-only status/version/dates + `internal_notes`, excluded from export and change log). Structural fields → `products` columns; narrative fields → `identity` section `data` jsonb (merge-preserves legacy keys).
- Structured sizing does **not** live on the product — each Spec Sheet owns its own size run (see Size Specifications).
- Hero asset (PDF cover) pickable in Asset Upload; product soft-archive + unarchive; `duplicateProduct` (copies product + sections, resets completion/status/style number).

### Dashboard / navigation / app shell
- Fixed-viewport shell (`components/app-shell.tsx`), collapsible dark-navy sidebar (`components/app-nav.tsx`): All Products, Archived, Collections (filtered by active brand), Settings + user menu. Collapse/brand/collection/archived state in Zustand.
- `/dashboard` = Launchpad (`components/launchpad-client.tsx`): 4 stat cards, per-collection progress, "Needs Attention" heuristics (no-section drafts, stalled >7 days, missing style number; capped 5), quick actions, 5 recently updated. `/products` = searchable/filterable product-card grid. `/` redirects to `/dashboard`.
- Product page = sticky header (breadcrumb, style #, progress bar, version chip, Quick Export, labels, status control) over one-page accordion sections (`#section-{key}` anchors, open state persisted).
- Section list (6 completable): Product Setup, Asset Upload, Technical Details, Bill of Materials, Size Specifications, Supplementary Documents (placeholder) + an always-present Change Log collapsible (not a section row, not counted in progress).

### Canvas annotation (Technical Details / shared engine)
- Data flow: `product_assets` → `canvas_pages` → `canvas_slots` → `canvas_annotations` (+ `canvas_colourways`). Uploads go browser→Storage directly (server-action 4MB limit avoided); server actions in `app/(app)/products/[id]/canvas-actions.ts` (zod parse → auth ctx → ownership check → mutate → revalidate).
- **Five layers** (`components/canvas/layers.ts`): Colourways `#EC4899`, Fabrics & Trim `#3B82F6`, Measurements `#F59E0B`, Construction `#8B5CF6`, Branding & Labels `#14B8A6`. Layer→types mapping: fabric+trim, construction_note+stitch, branding+label.
- **Reference codes** (`LAYER_PREFIX`, `types/index.ts`): F/T/M/CN/S/B/L, allocated `prefix + (product-wide count of that type + 1)` (count+1 is explicitly "not concurrency-safe", accepted V1). **Colourways differ:** separate entity per product with `sequence_number`; pins coded `C{seq}.{n}`; first pin auto-creates "Colourway 1".
- **Pin types:** `point` (tip dot + leader line + draggable code badge; badge drag persists `label_offset_x/y`, clamped; 4px drag threshold disambiguates tip-move vs badge-peel) and `line` (measurement dimension lines with arrowheads + midpoint value pill). No area/box pin type.
- **Per-layer `data` jsonb:** fabric/trim (library item, composition, colour, gsm, width_cm, trim_kind, placement, qty, unit per_metre/per_unit/per_kg, unit_cost, supplier_code, notes), colourway (colour_name, hex, pantone, notes), construction (stitch library item/SPI/thread colour, or note), measurement (name, value, unit cm/mm/in, notes), branding/label (type, library item, width/height mm, placement, colour, notes). Legacy `{label, notes}` pins surfaced via fallbacks, never auto-migrated.
- **Design-space / frozen-box model:** coordinates are 0–1 fractions of the slot; locking a slot freezes its rendered px size into `lock_width × lock_height` and thereafter the whole box scales uniformly (`k = min(w/designW, h/designH)`) so pins and image can never drift on container resize (the 0025 fix). Unlock keeps annotations. Slot fit modes `fill` (cover) / `fit` (contain, default for new placements); framing = wheel/button zoom (0.25–4×) + clamped pan, persisted debounced ~400ms. Separate stage zoom (0.5–4×) magnifies the whole page grid (client-only). Confirm dialogs for "Lock without framing?" and unlock-with-pins (per-user "don't show again" preference).
- **Page model:** pages belong to the product and are shared by sections; templates single/split/triple/quad (1/2/3/4 slots). **Per-page annotation cap = 12** (`MAX_ANNOTATIONS_PER_PAGE`, counted across all slots and layers; amber warning from 10; enforced server-side in both create actions and client-side with a "Duplicate page" suggestion toast). **No page-count limit.** Page duplication copies slots/framing/lock state/notes but **no annotations**. Page notes (≤2000 chars) render in a PDF "PAGE NOTES" box. Rename, delete (cascades), drag-reorder.
- **All-layers view:** read-only composite of every layer's pins at full opacity — explicitly "what the PDF page will show"; placement inert in this mode.
- **Marker colours:** workspace-customizable per layer (`workspaces.layer_colours` + `update_layer_colours` RPC), resolved everywhere through `useLayerColours()`; live optimistic recolour. (One real bug here — §4.)
- **Colour sampling:** cross-browser pixel sampler (`lib/colour-sample.ts`) replays the exact slot affine onto an offscreen 2D canvas (deliberately not the Chromium-only EyeDropper); colourway pin placement auto-samples at the click point; failures degrade to manual hex entry.
- Two surfaces: `PageOverview` (card grid with composite thumbnails, drag-reorder) and fullscreen `PageEditor` (layer buttons, thumbnail strip, annotation list panel, marker-colour editor, stage zoom).

### Section completion / progress
- `lib/section-status.ts` is the single write path. Two kinds: **manual** (`completed_manually`, durable — recomputes never demote it) and **auto**.
- Auto rules: identity complete when 5 core fields filled; assets complete when ≥1 asset and every asset is placed in a slot or is hero; grading complete when every spec sheet `is_complete`; technical_details and bom are **manual-complete only** (auto provides a content-aware not_started/in_progress floor); documents always not_started.
- Manual toggle component per section; auto-complete sections show a non-clickable green badge. Progress bars ("X of Y sections complete") on product header, dashboard, and collection cards; Change Log excluded from denominators.

### Versioning / change log (migration 0038)
- Version = `products.version_major/minor` (starts v1.0); header chip → dialog bumps minor (v1.1) or major (v2.0) with an optional note (≤500). **Deliberately no snapshots/diffs/restore** — "the number plus the version-grouped change log IS the versioning model" (`lib/product-version.ts`).
- `product_change_log` is append-only (RLS: SELECT+INSERT only). `logChange` (`lib/change-log.ts`) stamps the current version and swallows its own failures (best-effort), except the version-bump entry which is written directly and surfaces errors. Areas: product_setup, assets, pages, technical_details, colourways, fabric_trim, measurements, construction, branding, specs, version.
- Deliberately never logged: slot framing, pin moves/offsets, lock/unlock, page notes, internal notes, completion marks, exports/views, workspace-library CRUD.
- UI: `components/change-log-section.tsx` groups entries by version (bump note as header, "Current" badge), newest first, fetch limit 200. **Not rendered on the PDF.**

### BOM
- **Read-only, auto-generated** from Fabrics & Trim canvas pins (`layer_type ∈ {fabric, trim}`) via shared `lib/bom-rows.ts`; no manual rows (noted as later follow-up). Empty state links to the canvas section.
- Columns: Item # (reference code), Category (Fabric / trim kind), Item Name, Composition/Detail (+GSM), Colour, **Width (cm)** (fabric only), Placement, Quantity, Unit (per m/unit/kg), **Unit cost** (2dp), **Total** (qty × unit cost), Notes. Grouped Fabrics then Trims in code order. No grand total on screen or PDF (grand total exists only in Excel).
- Materials library: two-layer (96 seeded global items + workspace items; globals hideable per workspace, never editable); per-category property forms; workspace CRUD in Settings → Master Library.

### PDF export
- Full document at `GET /products/{id}/techpack.pdf` (auth + workspace-scoped; `?layers=`, `?bom=0`, `?specs=0` filters); single composed page at `GET /products/{id}/pdf?pageId=` (inline preview). Both landscape A4, Helvetica, document-wide page numbering. **Neither route accepts a share token — no unauthenticated access path.**
- **Page order** (`lib/pdf/render-techpack-document.tsx`): ① Cover → ② Colour Palette page (only when the palette doesn't fit the cover band) → ③ canvas pages in sort order → ④ BOM pages → ⑤ Size Specification pages. **No change-log page.**
- **Cover** (`render-cover-page.tsx`): brand logo (or name), "TECH PACK" + version/date; product name, style/collection/season line; meta rows (Brand, Status, Collection, Season, Designer); Description; Intended Use; **Key Fabrics strip** (max 5, deduped, fabric-family pins only); hero image (contain-fit; falls back to first filled slot image); bottom **colour palette band** (Pantone-style swatch cards grouped by colourway) when it fits. Every block conditional — sparse products render a clean minimal cover.
- **Canvas pages** (`render-techpack-page.tsx`): the frozen lock-box contain-fitted into each slot cell (WYSIWYG with the editor); all-layers pin rendering in resolved layer colours; measurement lines with arrowheads and value pills; PAGE NOTES box; right-hand **callout column grouped layer → slot → pins** (colour-keyed layer headings, numeric-aware code order, points-budget greedy fit with "+N more, see the online tech pack" overflow); header (logo, style name/number/season, page title, version/date, Page X of Y, designer); footer (confidentiality line + clickable "View online: app.garspec.com/view/…" link + GarSpec brand).
- **BOM pages** (`render-bom-page.tsx`): dynamic columns (all-empty columns dropped), Fabrics/Trims group headers with "(continued)" on page splits, fixed-row-height pagination.
- **Spec pages** (`render-spec-sheet-page.tsx`): one titled table per sheet ("Size Specification — {name}"); Code/Measurement/Tol± columns + one column per size; sample columns tinted and tagged SAMPLE; auto-mode columns **re-graded live at export time** via the same engine as the UI (computed values never persisted); caption naming grading profile + knit/woven tolerance basis; wide runs chunk at ~13 size columns; "(continued)" pagination.
- **Quick Export dialog** (`components/quick-export-dialog.tsx`): all five annotation layers as **pre-ticked** checkboxes + "Also include" Bill of Materials and Size Specifications (both pre-ticked); cover always included; builds the `techpack.pdf` URL (defaults = no params). "Export Excel" button included. "More options" links to the placeholder Export Hub.
- Share links: `products.share_token` exists and the footer prints `app.garspec.com/view/{token}` — but that destination is **not built** (print-only today).

### Excel export
- `GET /products/{id}/techpack.xlsx` (auth + workspace-scoped) → ExcelJS workbook (`lib/excel-techpack.ts`): **BOM tab** (13 columns incl. Category as a real column, frozen header, numeric cells, live `SUM()` TOTAL row — ERP-import friendly: no merged cells, no "—" placeholders) + **one tab per spec sheet** ("Spec - {name}", frozen Code/Measurement/Tol panes, info block, tinted sample columns with cell note) + an **Info tab** only when both are empty (prevents zero-sheet file). Same shared derivations as PDF/UI (`lib/bom-rows.ts`, `lib/spec-sheet-resolve.ts`), so numbers match everywhere. **Ignores the Quick Export toggles — always whole-product in V1.**

### Size Specifications / grading
- Multi-sheet per product (0037): Youth/Men's/Women's/custom sheets coexist; each sheet self-contained (own demographic, sizing system, size run, sample sizes, mode, fabric type, profile). Section status auto-derives from all sheets' `is_complete`.
- **Stepped flow** (`components/spec/spec-sheet-flow.tsx`, `STEP_LABELS`): ① **Template** → ② **Size range** (demographic → sizing system (women's only) → tick sizes from ladder) → ③ **Sample** (pick 1–2 sizes; first = grading anchor, second feeds Route B) → ④ **Measurements** (live table, sample columns editable) → ⑤ **Grading** (manual / auto from profile / detect) → done view ("Your Spec Sheet" + Mark complete). Entry lands on the first unfinished step.
- **Templates:** 22 seeded global (6 categories) + workspace-custom; template POMs copied into product-owned rows at sheet creation; rows addable/editable after.
- **Grading profiles:** 3 seeded global (Men's, Women's, Youth Unisex) + workspace-custom via a profile dialog. Increment model is per grade-category per size step, with a **break size** switching to extended increments (e.g. Men's primary girth 2.5 base / 3.5 above 2XL); knit/woven tolerance sets; per-row tolerance override.
- **Engine** (`lib/spec-grading.ts`, pure functions): **Route A** `gradeSheet()` walks outward from the sample size in both directions accumulating increments unrounded (no drift), displaying each cell rounded to 0.1; break resolution handles exact match, ladder position (big-and-tall runs grade extended throughout), and no-relationship (base throughout). **Live re-grade** on every keystroke via `useMemo`; computed values never persisted (auto mode stores only the sample column).
- **Route B — BUILT** (not stubbed): `detectGrade()` (`lib/spec-grading.ts:464-576`) derives per-key increments from 2+ entered sample sizes (per-step deltas averaged per grade category; break inference with 3+ sizes; inconsistent/negative keys flagged), opens the profile dialog pre-filled for review (flagged keys amber) — nothing applied until saved. Button disabled with hint until a second size has measurements. Extensively unit-tested. (The reference doc `docs/GarSpec_Grading_Profiles_Reference.md` still says "Route B comes later" — the doc is stale, the code is shipped.)
- **Manual mode:** snapshots the computed grid into editable stored cells; switching back to auto prunes non-sample values behind a confirm dialog.
- Sizing systems: youth ladder YXXS–YXL; men's S–6XL; women's alpha XS–6XL **or** numeric 0–24 (even); custom free-entry. `parseSizeRun` normalizes labels (XXL→2XL etc.).
- **Spec sheets render on the PDF export: YES** (`lib/pdf/render-spec-sheet-page.tsx`) and in Excel — all via the shared resolver `lib/spec-sheet-resolve.ts`.

### Other sections
- **Supplementary Documents** (`documents`): section row exists, renders "This section is coming in a later phase." — pure placeholder, no content model.
- **Labels/packaging as a section: removed** (0031). Its concerns live on as the Branding & Labels canvas layer + workspace label tags. Product-tagging labels (colour chips, filterable) are live.
- **Settings** (5 tabs): Brands (brand/season CRUD + per-brand logo upload used on PDFs), Labels (tag CRUD), Marker Colours (workspace layer colours — see bug), Master Library (two-layer manager incl. hide-globals), Workspace (one real preference: hide-unlock-warning; plus 3 "coming in Phase 3" placeholder cards).

---

## 4. Features — stubbed / partial / TODO

- **Export Hub** — `app/(app)/products/[id]/export/page.tsx` is a "coming soon" placeholder page (auth-checked, empty state, `TODO (Session 2)` header comment). Quick Export's "More options" links to it with a TODO.
- **Public share route `/view/{token}` — not built.** `share_token` column and `app.garspec.com/view/` footer links exist (migration 0026 comment: "ships later"); no route serves them; PDF routes are auth-only. Fallback token string `"preview-no-token"` in both PDF routes.
- **⚠️ Real bug — Branding & Labels marker colour can't be saved:** the editor and app-side zod derive 5 layer keys from `ANNOTATION_LAYERS`, but DB function `update_layer_colours` (0020, pre-dates the 0024 layer) only accepts `colourway, fabric, measurement, construction` and raises `Unknown layer key: branding_labels` on save (verified in `supabase/migrations/0020_workspace_layer_colours.sql:47-48` vs `app/(app)/settings/actions.ts:109-135`).
- **Supplementary Documents section** — placeholder body only (see §3).
- **Settings → Workspace placeholders** — Team Members, Billing, Export Preferences cards all "coming in Phase 3".
- **Update-password page absent** — password reset is request-only; the email redirect lands on `/login` with no set-new-password screen.
- **Roles inert** — `user_role` enum (admin/designer/approver/viewer/factory) exists with no membership, invite, or permission logic; `product_change_log.actor_id` deliberately unpopulated pending collaboration.
- **Excel export ignores Quick Export selections** — whole-product only; per-section selection "arrives with the Export Hub" (route comment).
- **PDF callout icons deferred** — stitch/branding SVG icons don't render in callout rows (react-pdf can't take SVG icon sources); colour swatches only.
- **WebP images unsupported in PDF** — degrade to an "Image unavailable" box.
- **Konva swap pending** — canvas pin internals deliberately isolated for a future swap (`page-canvas.tsx` comments).
- **Diagnostic logging left in** — `console.time`/`console.log` round-trip instrumentation in `createAnnotation` (`canvas-actions.ts:954-1036`) and several `[DIAG]` console.error lines in `page-canvas.tsx`.
- **Reference-code allocation not concurrency-safe** — count+1 scheme, accepted V1 (comment suggests DB sequence later).
- **`hooks/use-products.ts`** — self-described React Query "pattern stub"; the library is otherwise unused.
- **`supplier_code`** field exists on fabric/trim pins but no seed data carries it.
- **Manual BOM rows** — not possible; BOM is annotation-derived only (noted in code as a later follow-up).
- **Legacy pin data** — old `{label, notes}` pins display via fallbacks, never auto-migrated.
- **Legacy slots without lock dims** — PDF geometry marks them `approximate: true` until re-locked.
- **Stale docs in-repo** (do not trust for planning): `README.md` (describes a "Phase 1 foundation" without canvas/BOM/PDF — all exist now), `CODEBASE_CONTEXT.md` (2026-07-02; claims 7 sections with branding + grading placeholders — wrong on both), `docs/GarSpec_Grading_Profiles_Reference.md` ("Route B comes later" — it's built).
- **Partial rebrand** — "GarSpec" on export/spec surfaces vs "TechPack/TechPackApp" in shell, auth, and metadata; share domain "pending final confirmation".
- **Unit hardcoded to cm** in spec sheets (V1); currency hardcoded to £ in identity pricing fields.

---

## 5. Not present

- **No multi-user/team features** — no members, invites, sharing, or permissions (single user per workspace).
- **No billing/Stripe** (placeholder card only). **No factory portal.** **No transactional email service** (Resend etc.) — only Supabase auth emails. **No analytics** (PostHog etc.).
- **No public/customer-facing anything** — no share route, no factory view, no customer-facing size charts.
- **No OAuth providers.** **No update-password flow.**
- **No version snapshots/restore/diffing** (deliberate design decision, not an omission).
- **No Excel import**, no CSV export, no per-page PDF export button (removed; only WYSIWYG preview + full doc).
- **No Konva/drawing canvas**, no free-drawing or shape annotation, no area/box pin type.
- **No dark mode in effect** (`.dark` theme defined but never applied), **no responsive/mobile layout** (min-width 1280 enforced), **no i18n** (en only, £ hardcoded).
- **No unit conversion** in specs (cm only), no imperial toggle.
- **No E2E/component test infrastructure** (no Playwright/Cypress/Vitest/Jest) — only Node test-runner unit tests (§6).
- **No CI config visible in the repo** (no `.github/workflows/`) — unverified whether CI exists elsewhere.

---

## 6. Tests & verification

- **Test setup:** Node's built-in test runner over TS via a custom loader (`npm test` → `node --import ./scripts/test-loader.mjs --test "lib/*.test.ts"`).
- **`lib/spec-grading.test.ts`** — the grading engine: `parseSizeRun` (ladders, synonyms, numeric even/odd spans, comma lists, combo sizes), sample-size defaults, `gradeSheet` (outward grading both directions, break boundaries incl. normalization/ladder/no-relationship cases, fixed rows and small sub-kinds, youth vs adult inseam, 0.1 rounding with no drift on long runs, empty/edge cases), `detectGrade` (two-size linear detection, three-size break splitting, non-adjacent sizes, inconsistent-data flagging), increment/tolerance key resolution. Fixtures use the actual seeded 0035 numbers, so tests double as a seed-data spot check.
- **`lib/excel-techpack.test.ts`** — the Excel workbook builder.
- **Run results at this commit** (verified in this audit): `npm test` → **64/64 pass** (15 suites); `npm run typecheck` (tsc --noEmit) → **pass**; `npm run lint` → **0 errors**, 5 warnings (jsx-a11y alt-text on react-pdf `Image` components — false positives for PDF rendering). `next build` not run (requires Supabase env) — **unverified**.
- No tests exist for server actions, components, RLS, or exports beyond the two files above.

---

## 7. Branch & recent commits

- **Branch:** `claude/new-session-b2eecq` at commit `e672232` (2026-07-08).
- Last 10 commits (`git log --oneline -10`):

```
e672232 Section completion + Change Log + versioning
7ab3d2e Quick Export: all sections as pre-ticked checkboxes, BOM decoupled from fabric layer
e0c0699 Excel export: BOM + Spec Sheets as one .xlsx workbook
d4bbdc1 Size Specifications: grading-flow UX tweaks + em-dash cleanup
a5ba87c Size Specifications: spec pages on the PDF export + Route B grade detection
df43df7 Size Specifications: cast section-status reconcile to enum in 0037
7741921 Size Specifications: harden multi-sheet reflow (review fixes)
75bb288 Size Specifications: multi-sheet, demographic-aware stepped reflow
9126699 Size Specifications: spec sheets, seeded templates/profiles, live grading engine
88d6cce Cover upgrade: fabrics strip + colourway palette, logo in every page header
```
