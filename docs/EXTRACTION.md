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

## Things to know

- Page numbers: Handbooks, Encyclopedias and the original PHB print the PDF page number. The DM Guide does not: cite its PDF pages and say so. Volo's: PDF page = printed + 1; its scan has OCR errors ("Armor dass", "2dl O", "ld6") — correct by hand.
- The book disagrees with itself in places and the text is kept as printed. Example: the Tinkerer table lists Profession features at 7th and 11th level; the professions themselves say 8th and 12th.
- Fruit entries (Encyclopedia) all have: name, "Devil Fruit, <Rarity>", Type, Fruit appearance, Description, Sea Weakness, named features, Spells (with charge costs), Awakening. Output fruits ONLY to `~/dndf/secret/`. The same goes for the handbook's Devil Fruit generation tables, fruit Spirit Surges and Chapter 9 (DM only).
- After extracting, `npm run validate` and `npm test` must pass: the tests build a sheet for every class at every level with every subclass.
- Numbers a class adds to the sheet (an unarmored AC formula, a damage die) are structured fields added by hand, as was done for the Bruiser. Add the matching rows to `docs/FORMULAS.md` with tests.
