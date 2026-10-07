# Phase 3 — Extract all rules (task list for Claude Code)

Read CLAUDE.md, docs/SPEC.md and docs/EXTRACTION.md first. Phases 1 and 2 are merged and live. Phase 3 is done as several pull requests, one per part, so each can be read and checked on its own. Source PDFs are in `~/dndf/sources`; nothing secret goes into the repository.

1. **Part 1 — toolkit and v10 classes** (branch `phase-3-extraction`): the PDF reader, the class extractor, all thirteen v10 classes with their subclasses and option lists, a Library page to read them, and a character form that can pick any class. Done when `extract_classes.py --check` reports 0 differences from the hand-verified Bruiser and the tests build a sheet for every class, level and subclass.
2. **Part 2 — v10 chapters 1 and 2**: universal features and Special Reactions (word-for-word text for the sheet), crew roles, backgrounds, feats, character dreams, races and optional races. The character form picks race and background from the data.
3. **Part 3 — structure pass on the classes**: the numbers each class adds to the sheet (unarmored AC formulas, damage dice, pools, toggles), added by hand as for the Bruiser, with rows in docs/FORMULAS.md and tests. Review of the `auto` fields.
4. **Part 4 — v10 chapters 4, 5 and 7**: spell lists, Spirit Surges and Haki (public parts), the armory (armor, weapons, gear, Meitos).
5. **Part 5 — v8.8**: the same content from the v8.8 handbook. Identical entries are stored once and tagged with both versions; changed ones get per-version copies or `overrides`.
6. **Part 6 — secret data, to `~/dndf/secret` only**: Devil Fruits from the three encyclopedias and v8.8, generation tables, fruit Spirit Surges, DM chapters, the licensed Volo's stat blocks. Loading them into private Supabase tables is phase 6.

Out of scope for phase 3: the builder and level-up wizard (4), the Discord bot (5), granting and revealing fruits (6).
