# DnDF Platform — rules for Claude Code

A free, private D&D Beyond-style character platform for one Dungeons & Devil Fruits (One Piece 5e homebrew) table. Owner: Matt (GitHub `Overblaze`). Full product spec: `docs/SPEC.md`. Every formula: `docs/FORMULAS.md`. Look and feel: `docs/THEME.md`. How book data is extracted: `docs/EXTRACTION.md`. Current task list: `docs/KICKOFF.md`.

## Never do these
- Never commit source PDFs, Devil Fruit data, DM-only chapters, or anything from Volo's Guide / Monster Manual / other non-SRD WotC books. They live outside the repo in `~/dndf/sources` and `~/dndf/secret` and are loaded into private Supabase tables only.
- Never commit or print secrets: `.env*`, the Supabase service-role key, the Discord bot token or client secret. The Supabase URL and anon key are safe.
- Never push to `main`. Work on a branch, run tests, open a pull request with `gh pr create`, and say what to test.
- Never let the browser receive a Devil Fruit a player hasn't been granted. Secrecy is enforced by Supabase row-level security, not by hiding things in the UI.
- Never make the first person to sign in a DM. The bootstrap DM is the Discord username in `DM_BOOTSTRAP_DISCORD_USERNAME`.

## Always
- Book text shown to players is word-for-word, with book and page on every feature, option, item and rule.
- Every rule that has a number or choice becomes something usable: an action button, a resource with uses and recharge, a stat/skill change already in the totals, a toggle, or a tracker.
- The player has the final say: every number can be overridden (keep the calculated value visible with "use calculated"), no caps on features, feats, Haki, fruits or items, warnings never block.
- Math is automatic and explained: every derived number has a line-by-line breakdown. Each row of `docs/FORMULAS.md` gets a unit test in `packages/engine`.
- Each character is pinned to one rules version: `dndf-8.8` or `dndf-10`. Data entries carry `versions` and `source.page`.
- Keep the website and the Discord bot on the same engine package (`packages/engine`), so numbers can never disagree.
- Mobile first: everything must work on a phone at the table; touch targets at least 44 px.

## Stack
- `app/` Vite + React + TypeScript, deployed to GitHub Pages by `.github/workflows/deploy.yml` (base path `/dndf-platform/`).
- `packages/engine/` pure TypeScript rules engine + Vitest tests. No UI, no network.
- `data/rules/` public rules JSON (DnDF homebrew text is freely published by its authors). Validated by a JSON schema in CI.
- `data/reference/` freely licensed rulebooks for looking things up only (SRD 5.2.1, the 2024 rules). Never read by the engine or offered on the Build page; loaded lazily by the Library.
- `supabase/migrations/` numbered SQL: profiles, campaigns, members (role player/dm), characters (JSON doc + history), ships, secret_entries (fruits, DM chapters, licensed stat blocks), grants. RLS on every table.
- `bot/` (phase 5) Discord bot, discord.js, runs on Matt's Ubuntu mini PC as a systemd service; PDFs via Playwright rendering the app's print view.
- `tools/extract/` Python scripts that read PDFs from `~/dndf/sources` and emit JSON (public) or `~/dndf/secret/*.json` (private).
- CI: `.github/workflows/ci.yml` runs typecheck, tests, schema validation and a build on every PR.

## Table rulings already decided (campaign settings, DM can change)
- Haki attack bonus = 2 + ceil(Willpower / 2). Only used by custom or original-PHB Haki features; v8.8/v10 Haki uses normal attacks + Haki save DC.
- Long rest returns ALL spent hit dice.
- Healing Surge: up to floor(total hit dice / 2), minimum 1, limited by dice remaining.
- Players may edit their own bounty freely; the DM Guide formula is shown as "calculated".
- A bonus or penalty to "your speed" or "movement speed" (Offensive Defense) applies to every speed: walking, swimming, flying, climbing, burrowing. One that names the walking speed applies to walking only.
- A Chemist's fixed hit points per level are 5, the d8's average. The handbooks print "1d8 (or 6)", which is a slip.
