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
- [x] Haki features and "+ Spirit Surge" on the sheet: rarity, tabs, prerequisites greyed out and never blocked, preview of changed numbers, log, remove. Haki roll buttons scale with Willpower; Haki Purist; Standard Advancements wired where they have a number.
- [x] Campaigns: the DM page creates a campaign, adds members, grants a fruit or knowledge of one, reveals it, takes it away; the Crew page puts your character in the campaign and shows who is known to have a fruit.
- [x] A granted fruit on the sheet: a Fruit tab (only when granted) with the book text, charges or Beast Form uses back at dawn, Fruit DC and attack; features with roll buttons on Combat; fruits only known about; Devil Fruit advancements in "+ Spirit Surge". The fruit is never in the saved character, so printed sheets and the bot's PDF leave it out.
- [x] The bot does its sums on the whole sheet, the granted fruit included: `/dawn` refills fruit charges and `/status` counts them. While a fruit is unrevealed, a reply other players can read is the one the sheet without the fruit gives; `private: true` shows everything.
- [x] `/sheet` in Discord never includes a fruit, revealed or not: the fruit is not in the saved character the PDF is drawn from.
- [x] `tools/extract/audit_secret.py` audits the private data and prints counts only (`--where` adds book and page, never names or text).
- [x] Fixed what the audit found: a beast's stat block beside or under a fruit is read in column order and kept apart from the fruit's features (it had been read into the middle of them, and had swallowed 14 fruits whole in the v8.8 handbook); a beast's name set large inside a sentence is no longer a new feature; a fruit printed over numbered pages is one fruit. Features that stop mid-sentence: 311 → 5.
- [ ] Left from the audit, all small: 8 appearance lines and 7 awakenings that stop mid-sentence, 8 features with no text, 4 fruits with no appearance. `python3 tools/extract/audit_secret.py --where` lists the pages.

## Racial traits (branch `race-choices`)
Racial traits were text only. Now each is a feature with its uses, action and dice read from the wording, and the numbers above in `docs/FORMULAS.md` entered by hand. Cyborg Upgrades and the Mink's Animal Characteristics are lists to pick from, in the builder, on the Features tab and at level-up.
Still the player's to apply: traits that say "of your choice" for a skill, tool, weapon or ability score (Human Variant, Octopus, Yokai Tribesman, Automata, Oni, Smelt-Whiting, Buccaneer); swimming, climbing and flying speeds other than the ones listed; spells a trait lets you cast.

## Phase 7 — Inventory, gear, spells
- [x] Personal inventory (branch `phase7-inventory`): a Gear tab with berries (gain, spend), everything carried with count and weight against carrying capacity, items from the armory (add, or buy with berries) or written by hand, "use it" for armory weapons, armor and shields, and stowing. Over capacity is said, never blocked.
- [x] Gear and spells on the printed sheet (and so in the bot's `/sheet` PDF); berries, weight carried and prepared spells in `/status`.
- [x] Spells (branch `phase7-spells`): a Spells tab with each casting class's save DC and attack modifier, what the class table gives (cantrips known, powers prepared …), slots, and the spells known by level with Prepared, Cast (spends a slot of the level chosen), notes and Forget. Add spells from any class list, from the handbook's own eleven spells (full text, with roll buttons), or by name.
- [x] Spell text from the free 5e rules (branch `srd-spells`): all 319 SRD 5.1 spells, read from the official document and checked sentence by sentence, with the CC-BY attribution. 215 of the 324 spells on the v10 class lists (222 of 345 in v8.8) now have their text, page, tables and roll buttons.
- [ ] The other 109 (v10) / 123 (v8.8) listed spells are from 5th Edition books that are not free to reproduce: name only, with the player's notes.
- [ ] A Devil Fruit's spells cast with its charges; Hybrid Points for Hybrid powers.
- [x] More of the text-only options are usable: Warrior's Dueling (+2 damage, one-handed melee) and Thrown Weapon Fighting (noted), and five Emanations that cast a spell once per long rest now have a counter (the wording patterns for "once" were widened).
- [ ] Still text only: Emanations and Splices that change an infused weapon, a summoned beast or the abomination (they act on a companion or an item, not on the character's own numbers).

## Review of phases 6 and 7 (branch `review-phases-6-7`)
A 600-character stress run using races, pick-lists, Haki, surges, fruits, gear and spells in extreme and damaged states (kept as `fuzz2.test.ts`), a browser pass over every tab, dialog and page with a maxed-out character in both handbooks, the DM and fruit walk-throughs again, the database rules for a character that leaves a campaign, and both data audits. Fixed, each with a test:
- two Spirit Surge records (or items, or spells) saved under one id showed as one feature, the second hidden; ids are now made unique on reading;
- a surge pick that was not what it should be (a number where a weapon kind belongs) crashed the whole sheet;
- Willpower could go below zero from a damaged save;
- a private entry with a field that was not text put "undefined" or "[object Object]" on the Fruit tab, and one with a count that could not be worked out crashed the sheet;
- casting with a slot level that was not a number asked for "NaNth-level slots"; a negative item weight lowered the weight carried;
- a long name or note typed without spaces made the Gear tab four times wider than a phone;
- the DM could not take a fruit away from a character whose player had taken it out of the campaign: the grant was still there but the page had no row for it;
- the DM page called the grant note "for yourself" although the character's player can read it;
- a Build page link (`?do=level`) reopened its dialog on every reload.
Known and left: a player who moves a character to a different campaign keeps a fruit granted in the first until that campaign's DM takes it away; the printed sheet works out Haki Purist without knowing about a fruit (the fruit is never on paper), so a fruit holder's printed Haki dice can be one die higher than the live sheet's.

## Custom spells (branch `custom-spells`)
- [x] A spell editor (name, level, school, casting time, range, components, duration, ritual, text; dice in the text become roll buttons).
- [x] Library → "Your spells": write, change, delete; signed in, kept on the account (`0004_homebrew.sql`) and shareable with a campaign; signed out, kept in the browser.
- [x] Spells tab → Add spells: "Your spells" as a list, "Write a new spell" in place (optionally kept in the library), and "Change this spell" / "Write its details yourself" on any spell without printed text. A learned spell is copied onto the character, so the sheet, the printed sheet and the bot need no library.

## Spells by class, and a Phase 3 mistake found in the spell lists (branch `spell-classes`)
- [x] Each casting class is worked out on its own at its own level: prepares or learns, cantrips, spells known or prepared, highest spell level, DC and attack. Each spell counts for one class. The Prepared box is only on spells of a class that prepares; a learned class's spells show "Known".
- [x] Multiclass: the note from p210 about pooled slots reaching past what any class can know, a per-spell "Counts for" choice, and a flag on a spell above its class's highest level.
- [x] **Spell lists were short by 13 to 17 spells each** (all but the Chemist's) since Phase 3: a height cut-off in the reader dropped the first names of each column, which sit beside the list's title. Priest cantrips had lost Guidance and Light, for instance. The cut-off is gone; every list now matches an independent count of its page, and every recovered spell that is in the SRD sits at the level the SRD gives it. The earlier "all lists match the book" check was wrong because it used the same cut-off.

## Phase 8 — Ship and crew, bounty, DM party view
- [x] Bounty (branch `phase8-bounty-party`): on the Status tab, the DM Guide's formula with level, strongest Haki and Devil Fruit read from the sheet and the deeds counted by the player; the player's own number wins; epithet and terms; "Issue a wanted poster" fixes what the world has seen.
- [x] Crew page: every crewmate's issued poster and the crew's total bounty (`0005_crew.sql`).
- [x] DM page: Party, with each character's HP, AC, passive Perception, speed, bounty, exhaustion and conditions, and a link that opens the sheet.
- [x] The DM Guide's ship chapter as public data (Matt's ruling, 2026-10-08; branch `phase8-ships`): 11 ships with their components, 25 upgrades, and the chapter's rules and tables, in the Library under "Ships and sailing".
- [x] Ship sheet (branch `phase8-ship-sheet`, `0006_ships.sql`): launch one of the book's eleven ships or a blank one; components with Armor Class, hit points, damage thresholds and repair; speed from the working movement component, less damage, short-handedness and overloading; crew, passengers and rations; upgrades from the book (bought from the treasury at this ship's price, or a gift) or your own, against her slots; the shared hold in tons and the crew treasury, with a log; a voyage calculator and the ship's soul. Shared with a campaign, the whole crew can change her, and two changes at once cannot overwrite each other.
- [x] A ship made the crew's own (branch `phase8-ship-custom`): what she is ("Modified Caravel"), her dimensions and her own cost can be changed; upgrades can be bought from the treasury or come by another way (a gift, plundered or salvaged, built by the crew, a reward, bought from someone's own purse) with a line of story, and changed after they are fitted (name, slots, what was paid, what it is worth); her worth is worked out line by line beside the book's price and can be typed over. A stress test builds 1,000 random ships and opens 500 broken saves.
- [x] A ship's map and artwork (branch `phase8-ship-images`, `0007_ship_pictures.sql`): pictures are shrunk in the browser and kept in a private storage bucket in the ship's folder, open to exactly the people who can open the ship; shown as thumbnails (maps first), close up at full size, and one at the top of her sheet. Signed out, they are kept in the browser.
- [x] Ships in the bot (`/ship status | damage | repair | treasury | aboard`), and on a printed page (the Print button on the ship sheet: her numbers with blanks to pencil in, parts, upgrades, hold, and her maps). Branch `bot-ship-bounty`. Not done: a ship PDF from the bot.
- [x] Accounts for players without Discord (branch `password-accounts`, `0008_password_accounts.sql`): a username and password, made only with the table's join code (checked in the database); never the bootstrap DM; the DM resets a forgotten password with `npm run accounts -w bot`.
- [x] Full sweep (branch `sweep-fixes`, `0009_profile_names.sql`): every browser walk-through rerun, a 30,000-character and 69,000-ship soak, and `npm run live-check -w bot`, an end-to-end check of the real Supabase project as two temporary players. Fixed: a new Discord player shown by their email name (0008), the join code staying on the account, a ship change lost when leaving the page within the save delay, and the sign-up form not using the database's own reason for a refusal.
- [x] `/bounty` in the bot: the poster as issued, or the whole crew's.

## Phase 9 — Polish

- [x] Export and import (branch `export-import`): a character, a ship, or everything on a list page as one `.dndf.json` file; importing always adds new ones and never replaces. A file holds only the saved document, so a Devil Fruit is never in it; an uploaded sheet background and a ship's pictures are left behind. Every imported thing goes through the same checks as a save read from the database.
- [x] Items of your own that work on the sheet (branch `custom-items`): a step-by-step maker on the Gear tab (weapon, armor, shield, something with powers, a consumable, plain gear; a weapon or armor can start from one in the book), a "Use it" switch, and `/item list | add | make | use | remove` in the bot. A made item in use adds its attack, Armor Class, bonuses, charges and dice through the same machinery as the player's own features; nothing else on the character is written.
- [x] Item powers and attunement (branch `item-powers`): a made item can set or raise an ability score (a Circlet of Intellect's 19), add to saving throws and skills, and grant spells; an item can require attunement and then works only when both worn and attuned; attunement slots are counted against three (5e SRD 5.1 p. 206), overridable, and going over is said, not stopped. The handbook's own magic items (Dials, Meitos, gadgets) are offered as the start of an item, with their words and page. `/item make` is now one subcommand per kind; `/item use` readies armory items and attunes.
- [x] Offline use, part one (branch `offline-app`): the site is installable (a manifest and icons) and a service worker keeps the app's own files on the device, so it opens with no connection. The Library, and characters and ships kept in the browser, work offline; the page asks the network first, so a new version is picked up as soon as there is a connection. Nothing from the database is kept by the service worker.
- [ ] Offline use, part two: characters and ships on an account opened and changed with no connection, and sent up when it returns.
- [ ] `/surge` in the bot.
- [ ] Version-switch report (what changes for a character moved between v8.8 and v10).
