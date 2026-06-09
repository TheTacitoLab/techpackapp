# TechPackApp

A commercial SaaS web app that lets fashion designers create industry-standard
tech packs visually and export them to factories. This repository is the
**Phase 1 foundation**: scaffold, brand design system, Supabase data model with
Row Level Security, email/password auth with route protection, and the
authenticated app shell with a data-driven dashboard. Product features (canvas,
BOM, measurements, PDF export, factory portal) come in later phases.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (CSS-first `@theme`, no `tailwind.config.js`)
- **shadcn/ui** (new-york style) + **Lucide** icons + **Inter** font + **sonner** toasts
- **Supabase** (PostgreSQL + Auth) via `@supabase/ssr`
- **Zustand** (client state) + **TanStack Query v5** (server-state fetching)
- **React Hook Form** + **Zod** (forms/validation)

Dark mode only, desktop-first (min 1280px). Brand: primary/accent `#C8F000`
(lime), background `#1A1A2E` (navy) — referenced via theme tokens, never raw hex.

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
`npm run typecheck`.

## Running the database migrations

The schema lives in `supabase/migrations/` and must be applied to your Supabase
project. Pick whichever fits your workflow.

**Option A — Supabase SQL Editor (no CLI):** open your project's SQL Editor and
run the files in order, then verify:

1. `0001_init_enums_and_tables.sql`
2. `0002_functions_and_triggers.sql`
3. `0003_rls_policies.sql`
4. `0004_seed_section_templates.sql`

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

- `workspaces`, `profiles`, `brands`, `seasons`, `collections`, `products`,
  `section_templates`, `product_sections` — the full relational hierarchy.
- A trigger (`handle_new_user`) that, on sign-up, creates the user's
  **workspace** (named from the workspace name they entered) and **profile**.
- **RLS on every table**: a user can only read/write rows in their own
  workspace; `section_templates` is global read-only reference data.
- A seed of the 6 default tech-pack sections.

## Folder structure

```
app/                  # routes (App Router)
  (auth)/             # login, signup, reset-password (bare layout)
  (app)/              # authenticated routes wrapped in AppShell
    dashboard/        # data-driven dashboard + createProduct server action
  layout.tsx          # root layout: dark mode, Inter, providers, Toaster
  providers.tsx       # TanStack Query provider
components/           # app components (AppShell, SectionCard, CollapsibleSection,
                      #   ProgressTracker, EmptyState, ...)
  ui/                 # shadcn/ui primitives
lib/                  # cn() util + Supabase clients (client/server/proxy/auth)
hooks/                # TanStack Query hooks
stores/               # Zustand stores
types/                # database.types.ts + domain types
supabase/             # config.toml, seed.sql, migrations/
proxy.ts              # Next.js 16 proxy (route protection + session refresh)
```

## Notes & assumptions

- Route protection lives in `proxy.ts` (Next.js 16 renamed `middleware` →
  `proxy`). Unauthenticated users hitting app routes are sent to `/login`;
  authenticated users on auth routes are sent to `/dashboard`.
- Email sign-up confirmation routes through `app/auth/callback` (exchanges the
  PKCE code for a session). In **Supabase → Auth → URL Configuration**, set the
  **Site URL** to your deployed origin and add `<origin>/**` to **Redirect
  URLs** (include `http://localhost:3000/**` for local dev). To skip the email
  step in V1, turn off **Confirm email** in Auth → Providers → Email.
- `/reset-password` sends the reset email; the update-password page is a later
  phase.
- Deferred to later phases (not built here): canvas/Konva, BOM, measurements,
  construction/labels, PDF export, factory portal, versioning, billing,
  Stripe/Resend/PostHog.
