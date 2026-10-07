# Phase 2 — Engine + live sheet (task list for Claude Code)

Read CLAUDE.md, docs/SPEC.md, docs/FORMULAS.md and docs/THEME.md first. Work on a branch named `phase-2-engine-sheet` and finish with one pull request. Phase 1 (foundation) is merged and live.

1. **Every row of docs/FORMULAS.md has an engine test**: Core 5e, DnDF, Bruiser, Rests, Ships and the Devilforged (v8.8) example. Kaito's values come from deriving his saved character, not from calling formulas one by one.
2. **Character document**: one JSON `doc` per character (saved in `characters.doc`), pinned to a rules version, holding choices, equipment, overrides and play state. `deriveSheet(doc, rules)` in `packages/engine` turns it into every number on the sheet with a line-by-line breakdown.
3. **Data-driven features**: class tables, resources, toggles, trackers, dice and "when used" effects are read from `data/rules/`; structured fields may be added to `bruiser.json`, book text may not change.
4. **Live sheet** (phone first), built on the Bruiser: HP and temp HP with damage/heal, AC, initiative, speed, proficiency, Willpower and Haki DC, abilities/saves/skills with one-tap rolls, attacks, actions grouped by Action / Bonus action / Reaction / Special Reaction, resources as pips, toggles that change the numbers, trackers, conditions, exhaustion, death saves (Dream Point rescue, "I Won't Abandon My Dreams"), word-for-word text with page on tap.
5. **Overrides**: tap any number for its breakdown; set your own value; "use calculated" brings the book value back. Edited values are outlined.
6. **Rests**: short (hit dice rolled for you, Fury needs the training confirmed), long (all hit dice back by table ruling) and dawn, each with a preview before applying.
7. **Saving**: signed-in players' characters live in Supabase (`characters`, with a `character_history` line per action); signed-out visitors can try the sheet with characters kept in the browser.
8. **Creating a character**: a simple Bruiser form and a one-tap sample (Kaito). The book's 12-step builder is phase 4.
9. Open the pull request with `gh pr create`; its description lists what to click to test.

Out of scope for phase 2: other classes and races (phase 3), the builder and level-up wizard (4), the Discord bot (5), Haki features, Spirit Surges and Devil Fruits (6), inventory and spells (7), ships, bounty and the party view (8).
