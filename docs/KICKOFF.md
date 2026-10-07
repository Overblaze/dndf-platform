# Phase 1 — Foundation (task list for Claude Code)

Read CLAUDE.md, docs/SPEC.md, docs/FORMULAS.md and docs/THEME.md first. Work on a branch named `phase-1-foundation` and finish with one pull request. Ask Matt for anything you need instead of guessing (he will paste values into the terminal, never into files you commit).

1. **Scaffold the monorepo** (npm workspaces): `app/` (Vite + React + TypeScript, base `/dndf-platform/`), `packages/engine/` (TypeScript + Vitest), `data/rules/`, `tools/extract/`, `supabase/migrations/`. Add `.gitignore` covering `node_modules`, `dist`, `.env*` (except `.env.example`), `sources/`, `secret/`, `*.pdf`.
2. **Theme**: CSS variables and fonts from docs/THEME.md; an app shell with top bar (compass + "DnDF" logo, nav: Sheet, Build, Library, Ship, Crew, DM), parchment grid background, mobile-first.
3. **Supabase client + Discord sign-in**: `.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; "Sign in with Discord" via Supabase Auth; show the signed-in Discord name.
4. **Database migrations** (`supabase/migrations/0001_init.sql` …): profiles (id = auth user, discord_username, display_name), campaigns, campaign_members (role 'player' | 'dm'), characters (owner, campaign, rules_version, doc jsonb, updated_at), character_history (character, actor, change jsonb, at), app_settings (key/value). Row-level security on every table: players read/write their own characters; DMs of a campaign read/write all in it; members read campaign basics. A trigger that creates a profile on sign-up and makes the user DM only if their Discord username equals the `dm_bootstrap_discord_username` row in app_settings. Write the migration and also a short `supabase/README.md` saying to run files in order in the SQL editor and how to set that app_settings row.
5. **Schema + validator**: JSON Schema for rules entries (see SPEC "Data schema"); a `npm run validate` script that checks everything in `data/rules/`. `data/rules/dndf-10/bruiser.json` must pass.
6. **Engine start**: in `packages/engine`, implement ability modifier, proficiency bonus, Willpower, Haki/Devil Fruit DCs, and the Bruiser rows of docs/FORMULAS.md for Kaito, with Vitest tests that reproduce every "Kaito" value.
7. **CI and deploy**: `.github/workflows/ci.yml` (install, typecheck, test, validate, build) on pull requests; `.github/workflows/deploy.yml` building `app/` with repo Actions variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and deploying to GitHub Pages on push to `main`.
8. **README**: one paragraph on what this is, how to run locally (`npm install`, `npm run dev`), and a link to docs/.
9. Open the pull request with `gh pr create`; its description lists what to click to test, and reminds Matt to run the SQL migrations in Supabase after merging and to set the bootstrap DM username.

Out of scope for phase 1: the character sheet UI, extraction of other classes, Devil Fruits, the Discord bot.
