# Extraction scripts

Python scripts (standard library only, plus `pdftohtml` from poppler-utils) that read the source PDFs in
`~/dndf/sources` and write rules JSON. How they work, and the quirks found so far, are in
[docs/EXTRACTION.md](../../docs/EXTRACTION.md).

| Script | What it does |
|---|---|
| `extract_all.py` | **the one to run**: rebuilds `data/rules/` from both handbooks, storing entries that are the same in both only once |
| `pdfdoc.py <pdf> <first> <last>` | prints those pages as an outline of headings, paragraphs and tables |
| `extract_classes.py [class …]` | extracts v10 classes on their own (add `--v88` for v8.8); useful while working on one class |
| `extract_classes.py --check` | re-extracts the Bruiser and compares it with the hand-verified file |
| `extract_classes.py --notes` | also lists the feature levels that were inferred from position |
| `extract_secret.py` | writes Devil Fruits, fruit advancements, generation tables and the DM chapters to `~/dndf/secret/` only; prints counts, never names |
| `extract_chapters.py` | extracts everything that isn't a class on its own: chapters 1 and 2, spell lists, Spirit Surges and Haki, fruit rules for players, the armory |

- Public rules go to `data/rules/<version>/` and must pass `npm run validate`.
- Devil Fruits, DM-only chapters and licensed stat blocks go to `~/dndf/secret/` only, never into this repository.
- `data/rules/dndf-10/bruiser.json` is hand-verified and is not overwritten unless `--force` is given.
