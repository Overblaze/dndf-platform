# Phase 3 — Extract all rules (task list for Claude Code)

Read CLAUDE.md, docs/SPEC.md and docs/EXTRACTION.md first. Phases 1 and 2 are merged and live. Phase 3 is done as several pull requests, one per part, so each can be read and checked on its own. Source PDFs are in `~/dndf/sources`; nothing secret goes into the repository.

1. **Part 1 — toolkit and v10 classes** (branch `phase-3-extraction`): the PDF reader, the class extractor, all thirteen v10 classes with their subclasses and option lists, a Library page to read them, and a character form that can pick any class. Done when `extract_classes.py --check` reports 0 differences from the hand-verified Bruiser and the tests build a sheet for every class, level and subclass.
2. **Part 2 — v10 chapters 1 and 2** (branch `phase-3-part-2`, stacked on part 1): universal features and all five Special Reactions (word-for-word text on the sheet), crew roles, backgrounds, feats, character dreams, races and optional races with their subraces. The character form picks race, subrace, background, crew role and feats from the data; background and crew role skills are added automatically.
3. **Part 3 — structure pass on the classes** (done for every class's own features, in `tools/extract/structure.py`; subclass numbers that are always on or behind a switch are in `SUBCLASS_STRUCTURE`, along with subclass pools and their scaling dice, the choices made inside a subclass (Germa Genetic Superpower, Rope Tricks, Mechadevil weapon systems, Botany lands, Steamtech devices), Pressure Gauge Points and Power Surges; dice in any feature's text become roll buttons; the numbers a character gives a companion are shown on its feature (a companion sheet of its own is not built); Ki chakras, Hybrid Point and Leadership Die spends are wired; Devilforged infusions (they depend on the fruit infused), Emanations, Abomination Splices and a few class options that only show text are still to do): the numbers each class adds to the sheet (unarmored AC formulas, damage dice, pools, toggles), added by hand as for the Bruiser, with rows in docs/FORMULAS.md and tests. Review of the `auto` fields.
4. **Part 4 — chapters 4 to 7, both versions** (branch `phase-3-part-4`, stacked on part 5): spell lists and custom spells, Spirit Surges and Haki (public parts), the player-facing Devil Fruit rules, and the armory. Armor and weapons become items the character form can pick. Structured gear, Dials and Meitos as inventory items wait for phase 7.
5. **Part 5 — v8.8** (branch `phase-3-part-5-v88`, stacked on part 2; done before parts 3 and 4 because the table has v8.8 characters): classes, races, backgrounds, feats, crew roles and general rules from the v8.8 handbook. Identical entries are stored once and tagged with both versions; changed ones get per-version copies. The site picks the handbook per character, and the Library switches between them.
6. **Part 6 — secret data, to `~/dndf/secret` only** (branch `phase-3-part-6-secret`, stacked on part 4; only the script is in the repository): Devil Fruits from the Expanded Encyclopedia, the v8.8 handbook and the Original Encyclopedia, the fruit advancements, generation tables and DM chapters. Still to do by hand: the six licensed Volo's stat blocks. Loading into private Supabase tables is phase 6.

Out of scope for phase 3: the builder and level-up wizard (4), the Discord bot (5), granting and revealing fruits (6).

**Phase 3 audit** (branch `phase3-audit`): `tools/extract/audit.py` compares the data with the PDFs in both directions. It found paragraphs cut at column breaks, split compounds, dropped chapter openings, table rows sliding left and one wrong use counter; all fixed in the reader, with `packages/engine/test/audit.test.ts` holding them fixed. Still open: the front matter (pages 1–8) is not extracted, and the six Volo's stat blocks.

## Phase 4 — builder, level-up, build editor, custom features
1. **Starting ability scores** (branch `phase4-ability-scores`): roll 4d6 drop the lowest, standard array, point buy, or typed in; with a column for race, improvement and feat bonuses.
2. **Level-up flow** (branch `phase4-level-up`): a Level up button on the sheet; pick the class (or a new one), average or rolled hit points, what the level gives, the subclass, option picks and the improvement or feat; one-step Undo.
3. **Custom and borrowed features** (branch `phase4-custom-features`): write your own feature with uses, dice, bonuses, a note and a switch; borrow any feature from the handbook, with its counter and pool.
4. **Guided builder** (branch `phase4-builder`): a new character is made one step at a time in the handbook's order (EH10 p.9–10), each step with the book's own text, a step picker, a review of the finished numbers and what is still open; "All on one page" stays available, and editing opens on one page.

5. **History with undo** (branch `phase4-history`): every logged change keeps the character as it was just before, in `character_history` (signed in) or this browser (last 60); the History dialog undoes back to any line, and the undo is itself a line.

6. **Feature swap** (branch `phase4-feature-swap`): take any class, subclass or option feature off a character and put it back; with Borrow a feature this is the build editor's "override".

7. **Custom class** (branch `phase4-custom-class`): write a class with its own hit die, saving throws, proficiencies, improvement levels and features by level; it sits beside the handbook's classes in the builder, level-up and multiclassing.

Phase 4 is complete. Not built: the builder walking a higher-level character through every choice owed level by level (its Review lists what is open instead).

## Phase 5 — Discord bot and printable sheet
1. **Printable sheet** (branch `phase5-print`): `#/print/<character id>` lays the character out for paper or a PDF, with or without the text of each feature (`?text=0` opens on the short one). The bot will render this page to make its PDFs.
2. **Discord bot** (branch `phase5-bot`, `bot/`): /roll, /hp, /rest, /dawn, /status, /sheet (PDF) and /party, on the shared engine. Secrets live in `~/dndf/secret/bot.env` on the mini PC; `bash bot/install-service.sh` runs it as a user service from `~/dndf/bot-live`. See `bot/README.md`.

## Deep review of phases 1–5 (branch `deep-review`)
Probes, a 1,400-character stress run and a browser pass with damaged saves and a full store. Fixed, each with a test:
- a class level past 20 (or below 1) crashed the sheet and the Level up dialog in classes with a level table;
- a weapon whose damage was not dice crashed the sheet, with no way back in; there was no crash screen anywhere;
- characters kept in the browser were never put into shape on loading, and one bad one broke the whole list;
- dice had no upper limit (`/roll 99999999d6` would stall the bot); a hit die roll could be 0, 99 or 2.5;
- counters shared by name between a custom class feature and a handbook feature, or two custom features;
- a feat listed twice counted twice; options stayed after the feature that held them was taken off;
- pools, hit dice and hit points could sit outside their range after an odd save; a long rest left hit points above a lowered maximum;
- a full browser store stopped saving silently; History kept a full copy of the character for every tap;
- the bot could overwrite a change made on the website a moment before; the database tests timed out on a busy machine.

Both open items were then closed on branch `save-conflicts`:
- **Saves never overwrite a change made elsewhere.** The browser store and the account store write a character only if it is still as this page last read it; otherwise the sheet stops saving and offers "Load the saved version" or "Keep this page's version" (the replaced version goes into History). The bot does the same. If the stored time differs but the content does not, the write goes ahead, so a quirk in how a time is written can never block saving.
- **Change logs older than 90 days are removed** once a day by the bot (`Db.pruneHistory`), and left out of the browser's own history. Only `character_history` is named; a character is never removed for its age, and a database test holds that.

## Phase 6 — Haki, Spirit Surges, Devil Fruits
- [x] Private content table and grants (`0003_secret_entries.sql`), with database tests that use stand-in entries; loader `npm run load-secret --workspace bot`.
- [ ] Haki features and "+ Spirit Surge" on the sheet: rarity tabs, prerequisites greyed out (never blocked), preview, log, undo.
- [ ] DM screen: grant a fruit or knowledge of one to a character, reveal it to the table, take it away.
- [ ] A granted fruit on the sheet (features, resources, rolls), "unknown until revealed" for everyone else, fruit advancements for holders.
- [ ] `/sheet` in Discord leaves an unrevealed fruit out when posted publicly.
- [ ] Audit the private data (a few fruit type lines are garbled by extraction).
