# Extraction scripts

Python scripts that read the source PDFs in `~/dndf/sources` and write rules JSON.
How to slice the books, and the quirks found so far, are in [docs/EXTRACTION.md](../../docs/EXTRACTION.md).

- Public rules go to `data/rules/<version>/` and must pass `npm run validate`.
- Devil Fruits, DM-only chapters and licensed stat blocks go to `~/dndf/secret/` only, never into this repository.

Nothing is here yet: the Bruiser pilot (`data/rules/dndf-10/bruiser.json`) is the reference output, and the
scripts for the other classes arrive in phase 3.
