# Extracting book data

PDFs: `~/dndf/sources/` (`V10_D_DF_EH.pdf`, `V8_8_D_DF_EH.pdf`, `V1_2_D_DF_EDFE.pdf`, `Original DDF DFE.pdf`, `Original DDF DMG.pdf`, `Original_D_DF_PH.pdf`, Volo's). Tools: `pdftohtml` and `pdftotext` (poppler-utils), Python 3 (standard library only). Scripts: `tools/extract/`.

## How the reader works (`tools/extract/pdfdoc.py`)

`pdftohtml -xml` gives every piece of text with its position and font. That is enough to rebuild the page properly:

- **Headings come from fonts**, not guesses: MrEaves 32 = top level (class name, "Class Features", "Brawling Styles"), 24 = feature or subclass name, 19 = subclass feature or sub-section, MyFont 18 = option. MrEaves 26 is a stat block's name.
- **Reading order comes from positions**: left column, then right column (the gutter is at x = 459), with full-width tables splitting the page into bands. This avoids `pdftotext`'s column quirks (v10 p87 emits Extra Attack and Spirit Assault after The King).
- **Paragraphs**: a first-line indent starts one. Bold lead-ins ("Hit Dice:") start one, and their wrapped lines hang at the same indent. Centred formula lines ("Fury save DC = …") stand alone.
- **Bullets** have no bullet character in the PDF. A new bullet is detected by geometry: text only wraps when the next word doesn't fit, so if the line above had room for this line's first word, the break was deliberate. A bullet whose last line fills the column still runs into the next one.
- **Tables** are ScalySans text. Cells on one row share a `top`; a class table can sit across both columns without any cell crossing the gutter, so rows starting with a level ("1st") that continue on the right are treated as full width.
- Footers ("CHAPTER 3 | CHARACTER CLASSES", page numbers) and invisible text are dropped.

Run `python3 tools/extract/pdfdoc.py V10_D_DF_EH.pdf 85 87` to see any pages as an outline.

## Classes (`tools/extract/extract_classes.py`)

- One config line per class in `CLASSES`: page range, the top-level sections that hold subclasses or options, and the class table's column names. The printed column headers run together in the PDF ("Level Proficiency Bonus Leadership Dice …" is one piece of text), so columns are named by hand, in print order.
- **Class feature levels** come from the class table's Features column; if a feature isn't listed there, from its own wording ("At 6th level"); failing both, it stays with the feature before it and is reported.
- **Subclass feature levels** come from the wording, ignoring spell levels ("a 3rd-level spell slot") and taking the first of a list ("at 3rd, 5th and 9th level"). A level lower than the feature before it is reported as a problem.
- **Limited uses and action types** are recognised from standard phrasings ("Once you use this feature, you can't use it again until you finish a short or long rest") and listed under `auto` on the feature. They are right far more often than not, but they have not been checked by hand.
- Spell slots become resources when the class says they come back on a rest. Other pools (Ki, Leadership Dice) are named by hand in `CLASSES`.
- `--check` re-extracts the Bruiser and compares it with the hand-verified `data/rules/dndf-10/bruiser.json`: text, levels, pages and uses. It must report 0 differences before any change to the reader is kept.

## Chapters 1 and 2 (`tools/extract/extract_chapters.py`)

- **General rules** (kind `rule`): each top-level heading becomes an entry, with its smaller headings as sections.
- **Crew roles**: every role must have exactly one "Feature: …" and one "Pirate Prestige Ability: …" section; the role's skills are read from "Role Skill Proficiency".
- **Backgrounds**: the bold-led lines (Skill Proficiencies, Tool Proficiencies, Equipment) become fields. A name ending in `*` is unchanged from the original Player's Handbook (`unchangedFromPhb`).
- **Feats**: a first line starting "Prerequisite:" is kept apart from the text. A prerequisite line that fills the column runs into the text and is parted at the first sentence.
- **Races**: paragraphs led by a bold name ("Darkvision.") are traits; bullets and plain paragraphs after one belong to it. Walking speed, size and fixed ability increases are read from the wording and listed under `auto`. "X Subraces" sections become `subrace` entries.

## Chapters 4, 5, 6 and 7 (also in `extract_chapters.py`)

- **Spell lists** are four narrow columns of names under level headings, so they are read straight from the positioned text, down each column in turn. Only names are stored; the spells' own text is SRD material, to be added separately. The eleven **custom spells** have their full text.
- **Spirit Surges**: each option's first line is its type and rarity ("Armament Haki Advancement, Rare — Tier 2"). Which family an option belongs to comes from the section it is printed in, because "Amateur Haki Advancement" appears under all three Colors. A Haki prerequisite is a list of other features' names; the line after it often runs on and is parted using those names.
- **Devil Fruit advancements are never extracted here.** The page ranges stop before them, and the extractor stops with an error if a "Devil Fruit Advancement" type line or section turns up. The same goes for the generation tables after the fruit rules.
- **Devil Fruit rules for players** (how Paramecia, Zoan and Logia work, creation steps, appraisal) are public and become `rule` entries.
- **Armory**: every top-level section becomes a `rule` entry (ids prefixed `armory_`). The armor and weapon tables also become `item` entries with numbers the sheet can use: AC base and how Dexterity applies, Strength needed, damage, type, properties. Weapon tables span the page in two halves with the Properties column on the right; the reader joins halves whose rows line up. The ฿ sign is set in its own font and is folded into the price cell beside it.

## Two handbooks (`tools/extract/extract_all.py`)

`extract_all.py` is the one command that rebuilds `data/rules/`. It extracts v10, then v8.8, and compares them entry by entry:

- **Identical in both** (same text, levels and tables, on the same pages or all shifted by the same number of pages): stored once, in the v10 file, with `versions: ["dndf-8.8", "dndf-10"]` and the v8.8 book and first page under `sources`. The engine cites the right book for the character's version and moves the inner pages by the same shift.
- **Different in any way, or only in v8.8**: written to `data/rules/dndf-8.8/`. A v8.8 file holds only those entries, so some are short or absent.
- A file's folder is always one of its entries' versions, and no id may appear twice for one version (`npm run validate` checks both).
- **The hand-verified v10 Bruiser is never rewritten.** Its hand-entered structure (AC formula, Scrapper die, Fury, toggles, dice) is copied onto a v8.8 Bruiser feature only when both books print the same text for it. The one exception is listed in `SAME_MECHANICS` with the reason. Features that changed between versions (Black Fist, Hasshoken's Internal Vibrations) are text only in v8.8 until they are structured by hand.
- v8.8 differences in layout: the class list has Rogue and Skald (v10: Renegade and Virtuoso), the Devilforged is a caster with a list of 87 Sea Devil's Emanations, and there is no Void Century Automaton.

## Secret material (`tools/extract/extract_secret.py`)

Writes to `~/dndf/secret/` only. The script refuses any other destination, prints counts and page numbers but never names or text, and contains no fruit names itself. Nothing it produces may be committed; `secret/` is git-ignored and the rules schema rejects `devilFruit` entries under `data/rules/`.

- **Fruits** come from three books with three layouts:
  - *Expanded Encyclopedia*: entries run the full width of the page; each part opens with a bold lead-in.
  - *v8.8 handbook* (pp. 252–329): the same entries set in two columns. A page is treated as two columns when a fruit name starts in the right half.
  - *Original Encyclopedia*: other fonts. Names are in small caps and lead-ins are a size larger than the text, not bold.
- A fruit starts at a name heading followed by a "Devil Fruit, <rarity>" line. A name-sized heading without that line is a table or second part of the fruit above and is folded into it.
- Lead-ins become fields (Type, Fruit appearance, Description, Sea Weakness, Spells, Awakening) or named features. Lines of a beast's stat block (Armor Class, Hit Points, the ability row, …) are kept apart under `statBlockLines`.
- **Fruit advancements** (handbook Spirit Surges for fruits), **generation tables** and the **DM-only chapter** are read with the ordinary section reader from their own page ranges, per version, and from the encyclopedia's front matter.
- Not done: the six licensed stat blocks from Volo's Guide. That scan has OCR errors and needs correcting by hand.
- Loading these files into the private Supabase tables, and granting fruits, is phase 6.

## Things to know

- Page numbers: Handbooks, Encyclopedias and the original PHB print the PDF page number. The DM Guide does not: cite its PDF pages and say so. Volo's: PDF page = printed + 1; its scan has OCR errors ("Armor dass", "2dl O", "ld6") — correct by hand.
- The book disagrees with itself in places and the text is kept as printed. Example: the Tinkerer table lists Profession features at 7th and 11th level; the professions themselves say 8th and 12th.
- Fruit entries (Encyclopedia) all have: name, "Devil Fruit, <Rarity>", Type, Fruit appearance, Description, Sea Weakness, named features, Spells (with charge costs), Awakening. Output fruits ONLY to `~/dndf/secret/`. The same goes for the handbook's Devil Fruit generation tables, fruit Spirit Surges and Chapter 9 (DM only).
- After extracting, `npm run validate` and `npm test` must pass: the tests build a sheet for every class at every level with every subclass, in both versions.
- Numbers a class adds to the sheet (an unarmored AC formula, a damage die, a save DC, a pool) are written by hand in `tools/extract/structure.py` and applied after extraction, in every version that has the class. Each feature patch names a few words of the feature's text (`expect`); if a version words the feature differently the patch is skipped there and reported. Add the matching rows to `docs/FORMULAS.md` with tests. The Bruiser predates this and keeps its hand-verified file.

## Subclass numbers and automatic dice
`structure.py` has a second table, `SUBCLASS_STRUCTURE`, keyed by subclass id then feature name. Each patch quotes the feature's own words (`expect`); a list of patches covers a feature the two handbooks word differently, and `"only": "dndf-8.8"` marks a number only one handbook gives. A patch that never matches anything is reported by `extract_all.py`.

`extract_classes.py` also turns dice named in any feature's text into roll buttons (`dice_in`): each distinct roll once, at most four, never a d20. They are flagged `auto: ["rolls"]` so hand-entered rolls always win.

The hand-verified `data/rules/dndf-10/bruiser.json` is never rewritten, so its subclass switches are entered in that file directly.

A subclass patch can also carry `choose`: the feature's sub-headed parts (or, with `inline`, the paragraphs of its text that open with the names given) become an `optionGroup` entry, and the feature gets `choices` pointing at it. `each` gives every option the same fields (its own uses); `options` adds numbers to one option, guarded by `expect` like everything else.

`proficiencies_granted` reads "you gain proficiency with …" in class features, subclass features and feats into `armorProficiency`, `weaponProficiency` and `toolProficiency` effects; a choice grants nothing. They are added even to a feature whose other effects were entered by hand.

## Auditing the data against the books
`python3 tools/extract/audit.py` changes nothing and reports three things:

- **shape**: text that stops mid-sentence, an empty part, a compound left split at a line break, a table row with the wrong number of cells, a level out of order, a page outside the book.
- **text**: every sentence in the data looked up in an independent reading of the same PDF page (`pdftotext`), so a misplaced or mangled paragraph shows.
- **coverage**: the other direction — every sentence the PDF prints on a page we took entries from should be in the data.

Coverage still lists table rows and lists (they are held cell by cell, so a "sentence" across cells never matches) and lines where the page footer falls inside a sentence. Anything else it lists is worth reading.

What the audit led to in the reader (`pdfdoc.py`):
- a paragraph that runs from the foot of one column to the head of the next is joined even when a table title sits between the halves;
- a compound broken at its hyphen keeps the hyphen and takes no space ("fruit-infused");
- a chapter's first line, set as a large capital and small capitals, is rebuilt as an ordinary line;
- a table row with an empty cell keeps its columns instead of sliding left;
- text that starts past the right-hand margin (a box that ran off the page) is dropped.

v10 Hybrid *Power Immunity* stops mid-sentence in the v10 PDF because its box runs off the page. By Matt's ruling it is finished from the v8.8 handbook, which prints it whole (`COMPLETED_FROM_V88` in `extract_all.py`); the feature carries `completedFrom` and the sheet and Library say where the ending comes from. If a later v10 PDF prints it whole, the step does nothing.

Known and left as the book prints them: Marksman *Hawk-Eyed* and Eastern Dragon *Dragon Emperor* end without a full stop; one row of the Paramecia Awakening table has an extra cell; a few misprints ("your your", "the the"). Tables whose rows are printed on two lines each (Virtuoso *Performing Chords*) are held as two rows per entry.

## Auditing the private data

`python3 tools/extract/audit_secret.py` does for `~/dndf/secret` what `audit.py` does for the public data, and prints
counts only, so its output can be pasted anywhere. `--where` adds the book and page of each finding, never a name or
any text. After changing `extract_secret.py`: run it, run the audit, then `npm run load-secret --workspace bot -- --prune`
to load the files and remove rows that are no longer in them (a row a grant points at is always kept).

## SRD spells

`python3 tools/extract/extract_srd_conditions.py` reads the fourteen conditions of the SRD's Appendix PH-A (pages
358–359) into `data/rules/dndf-10/srd_conditions.json`, word for word, as the sections of one rule entry. The document's
text layer breaks a line between every word (a tab, a line break, a no-break space), so a plain read gives one word a
line: the first attempt took a lone "5" for a page number and glued the page footer onto a bullet. The reader joins
those breaks first, counts its bullets against every bullet mark on the two pages, and checks each bullet's letters
against the page.

`python3 tools/extract/extract_srd.py` reads the 319 spells of the System Reference Document 5.1 from the official
`SRD_CC_v5.1.pdf` in `~/dndf/sources/srd` and writes `data/rules/dndf-10/srd_spells.json`. The SRD is CC-BY-4.0; the
attribution it asks for is in the file, the README, the Library and under each spell.
- Every word comes from the official document. Every sentence is compared with a second reading of the same pages.
- `5e-SRD-Spells.json` (github.com/5e-bits/5e-database) is only a cross-check: that no spell was missed, that level,
  casting time, range and ritual agree, and for the layout of the nine tables inside spells, each cell of which must be
  found on the document's page. Its prose is **not** used: it is not always the document's wording.
- Where the two disagree the document is kept (Revivify is necromancy; Mass Heal and Mass Cure Wounds are evocation).
- A class list's "Melf’s Acid Arrow" finds the SRD's "Acid Arrow". A spell that is not in the SRD has no text, and none
  is to be added from any other source: other 5th Edition books are not free to reproduce.

### A lesson from the spell lists

A list's four columns flow one into the next, so a column that continues a level starts at the very top of the page
beside the list's title. The reader once skipped everything above a fixed height and so dropped those names, and the
check written for it counted with the same rule and agreed. A check must count a different way from the thing it
checks: the test now pins each list's size to the number of pieces in the list's type anywhere on the page, and the
coverage audit's "in the book, not in the data" lines for these pages were the real signal all along.

## The DM Guide's ship chapter

`python3 tools/extract/extract_ships.py` reads Chapter 2 of the DnDF DM Guide (PDF pages 11–43) into
`data/rules/dndf-10/ships.json`: 11 `shipType` entries (stat blocks with their components), 25 `shipUpgrade` entries and
10 `rule` entries for the chapter's sections and tables. Matt ruled this chapter public on 2026-10-08; nothing else of
the DM Guide is extracted. The book prints on its odd PDF pages only, and pages are cited as PDF pages. Two things are
cut off in the book itself and so in the data: the Sails Upgrade stops after its Armor Class, at the foot of page 23.
Tables there are centred and wrapped; the reader files a piece under the header it is centred nearest, keeps a table
going under a repeated header on the next column or page, and every sentence is compared with a second reading.
