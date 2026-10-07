# Extracting book data (lessons from the pilot)

PDFs: `~/dndf/sources/` (V10_D_DF_EH.pdf, V8_8_D_DF_EH.pdf, V1_2_D_DF_EDFE.pdf, Original_DDF_DFE.pdf, Original_DDF_DMG.pdf, Original_D_DF_PH.pdf, Volo's). Tools: `pdftotext` (poppler-utils), Python 3.

- Use plain `pdftotext -f N -l N file.pdf -` (no `-layout`): it keeps two-column reading order. Use `-layout` only to read tables.
- Slice features by heading lines in reading order; record the page where each heading appears. Drop footer lines like "CHAPTER 3 | CHARACTER CLASSES" and bare page numbers. Join wrapped lines; a line ending in `.:!?)` followed by a capital starts a new paragraph; join hyphenated breaks.
- Column quirks exist: v10 p87 emits Extra Attack and Spirit Assault after The King. Always assert every expected heading was found, in order.
- Tables (class progression, Drunken State) come out scrambled in plain mode: read them with `-layout` and store as structured fields, not text.
- Page numbers: Handbooks, Encyclopedias and the original PHB print the PDF page number. The DM Guide does not: cite its PDF pages and say so. Volo's: PDF page = printed + 1; its scan has OCR errors ("Armor dass", "2dl O", "ld6") — correct by hand.
- Fruit entries (Encyclopedia) all have: name, "Devil Fruit, <Rarity>", Type, Fruit appearance, Description, Sea Weakness, named features, Spells (with charge costs), Awakening. Output fruits ONLY to `~/dndf/secret/`.
- Reference implementation of the slicer and the verified Bruiser output: `data/rules/dndf-10/bruiser.json` (every feature has `page`).
- After extracting a class, check every number against its class table and add rows to `docs/FORMULAS.md` + tests.
