# Extraction scripts

Python scripts (standard library only, plus `pdftohtml` from poppler-utils) that read the source PDFs in
`~/dndf/sources` and write rules JSON. How they work, and the quirks found so far, are in
[docs/EXTRACTION.md](../../docs/EXTRACTION.md).

| Script | What it does |
|---|---|
| `pdfdoc.py <pdf> <first> <last>` | prints those pages as an outline of headings, paragraphs and tables |
| `extract_classes.py [class …]` | writes `data/rules/dndf-10/<class>.json` for every class, or the ones named |
| `extract_classes.py --check` | re-extracts the Bruiser and compares it with the hand-verified file |
| `extract_classes.py --notes` | also lists the feature levels that were inferred from position |
| `extract_chapters.py` | writes general rules, crew roles, backgrounds, feats and races (handbook chapters 1 and 2) |

- Public rules go to `data/rules/<version>/` and must pass `npm run validate`.
- Devil Fruits, DM-only chapters and licensed stat blocks go to `~/dndf/secret/` only, never into this repository.
- `data/rules/dndf-10/bruiser.json` is hand-verified and is not overwritten unless `--force` is given.
