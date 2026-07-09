# GarSpec

A commercial SaaS web app that lets fashion designers create industry-standard
tech packs visually and export them to factories. The working feature set:
product hierarchy (brands → collections → products), a canvas annotation system
(five layers: Colourways, Fabrics & Trim, Measurements, Construction,
Branding & Labels), an auto-generated Bill of Materials, multi-sheet Size
Specifications with a live grading engine (auto-grade from seeded profiles or
detect the grade from entered samples), PDF export (cover, canvas pages, BOM,
spec sheets), Excel export (BOM + spec sheets), section completion tracking,
and product versioning with an append-only change log.

For the full audited inventory of what exists (and what's stubbed or absent),
see `GARSPEC_BUILD_STATE.md`.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (CSS-first `@theme`, no `tailwind.config.js`)
- **shadcn/ui** (new-york style) + **Lucide** icons + **Inter** font + **sonner** toasts
- **Supabase** (PostgreSQL + RLS, Auth, Storage) via `@supabase/ssr`
- **@react-pdf/renderer** (PDF export) + **ExcelJS** (.xlsx export)
- **Zustand** (client UI state) + **React Hook Form** + **Zod**

Light warm-neutral theme, desktop-first (min 1280px). Brand accent `#C8F000`
(lime, reserved for progress/completion/active states), primary/sidebar
`#1A1A2E` (navy) — referenced via theme tokens, never raw hex.

## Required environment variables

Copy `.env.example` to `.env.local` and fill in the values from your Supabase
project (**Settings → API**):

```bash
cp .env.example .env.local
```

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL, e.g. `https://abcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon (publishable) key — safe for the browser |

> Never put the `service_role` / secret key in a `NEXT_PUBLIC_` variable.

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`,
`npm run typecheck`, `npm test` (grading-engine + Excel unit tests).

## Running the database migrations

The schema lives in `supabase/migrations/` (`0001` … `0039`, sequential and
idempotent) and must be applied to your Supabase project **in order**.

**Option A — Supabase SQL Editor (no CLI):** open your project's SQL Editor and
run the files in numeric order.

**Option B — Supabase CLI (hosted project):**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option C — Local stack (Docker):**

```bash
supabase start
supabase db reset    # applies migrations/ then seed.sql
# regenerate exact types from the running schema:
supabase gen types typescript --local > types/database.types.ts
# point .env.local at the URL + anon key printed by `supabase start`
```

`types/database.types.ts` is hand-written to match the migrations and is shaped
exactly like `supabase gen types` output, so regenerating it is a drop-in.

### What the schema gives you

- The full relational model: workspace hierarchy, products and sections,
  canvas pages/slots/annotations/colourways, the two-layer Master Library,
  spec templates/grading profiles/spec sheets, and the product change log.
- **RLS on every table**, scoped by the `auth_workspace_id()` helper; global
  library rows are read-only reference data.
- A trigger (`handle_new_user`) that, on sign-up, creates the user's
  **workspace** (named from the workspace name they entered) and **profile**.
- Seeded reference data: 6 section templates, ~96 Master Library items,
  22 spec templates (255 POMs), and 3 grading profiles (Men's, Women's,
  Youth Unisex).

## Folder structure

```
app/                  # routes (App Router)
  (auth)/             # login, signup, reset-password, update-password
  (app)/              # authenticated routes wrapped in AppShell
    dashboard/        # launchpad dashboard + hierarchy server actions
    products/[id]/    # THE tech pack page + actions, canvas-actions, spec-actions
      techpack.pdf/   # full-document PDF export route
      techpack.xlsx/  # Excel export route
      pdf/            # single-page PDF preview route
      export/         # Export Hub (placeholder)
  auth/callback/      # PKCE code-exchange route handler
components/           # app components (AppShell, sections, dialogs, ...)
  canvas/             # the shared annotation-canvas system
  spec/               # Size Specifications stepped flow + grading UI
  bom/                # generated Bill of Materials table
  settings/           # Settings page tabs
  ui/                 # shadcn/ui primitives
lib/                  # grading engine, BOM rows, change log, Supabase clients, ...
  pdf/                # @react-pdf/renderer document (cover, pages, BOM, specs)
hooks/                # small client hooks
stores/               # Zustand UI store
types/                # database.types.ts + domain types
supabase/             # config.toml, seed.sql, migrations/
proxy.ts              # Next.js 16 proxy (route protection + session refresh)
```

## Notes & assumptions

- Route protection lives in `proxy.ts` (Next.js 16 renamed `middleware` →
  `proxy`). Unauthenticated users hitting app routes are sent to `/login`;
  authenticated users on auth routes are sent to `/dashboard`.
- Email sign-up confirmation and password recovery route through
  `app/auth/callback` (exchanges the PKCE code for a session). In
  **Supabase → Auth → URL Configuration**, set the **Site URL** to your
  deployed origin and add `<origin>/**` to **Redirect URLs** (include
  `http://localhost:3000/**` for local dev).
- Password reset: `/reset-password` sends the email; the link lands on
  `/update-password` (via the callback) to set the new password.
- Not built (deliberately or yet): the public `/view/{token}` share route
  (PDF footers omit the link until it ships), Export Hub (placeholder page),
  team members/multi-user, billing, factory portal, transactional email.
