"""Audit the extracted rules data against the books and against itself.

    python3 tools/extract/audit.py            # everything, counts and where
    python3 tools/extract/audit.py --text     # only the comparison with the PDFs

It never changes a file. Two kinds of check:
  shape  - things no book text should look like: a feature that stops mid-sentence, an empty
           part, a table with ragged rows, a level out of order, a page outside the book.
  text   - every sentence of every entry looked up in an independent reading of the same PDF
           pages (pdftotext), so a paragraph the reader misplaced or mangled shows up.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = Path.home() / "dndf" / "sources"
PDFS = {"DnDF Expanded Handbook v10": "V10_D_DF_EH.pdf", "DnDF Expanded Handbook v8.8": "V8_8_D_DF_EH.pdf"}
# A last line that is a formula or a list entry has no full stop in the book either.
FORMULA_LINE = re.compile(r" = |^[A-Z][\w’ ]{2,24}: ")
END = re.compile(r"[.!?:”\")’]$|\d$")


def entries():
    for path in sorted((ROOT / "data/rules").glob("*/*.json")):
        for entry in json.loads(path.read_text())["entries"]:
            yield path.relative_to(ROOT / "data/rules").as_posix(), entry


def parts(entry: dict):
    """Every named piece of text in an entry: (label, text, page, holder)."""
    if entry.get("text") is not None:
        yield entry["name"], entry.get("text", ""), entry["source"]["page"], entry
    for key in ("features", "options", "traits", "sections"):
        for item in entry.get(key, []) or []:
            if not isinstance(item, dict):
                continue
            yield f"{entry['name']} / {item.get('name')}", item.get("text", ""), item.get("page", entry["source"]["page"]), item
            for section in item.get("sections", []) or []:
                yield f"{entry['name']} / {item.get('name')} / {section.get('name')}", section.get("text", ""), section.get("page", item.get("page")), section


def shape() -> list[str]:
    found: list[str] = []
    ids: dict[str, str] = {}
    for where, entry in entries():
        key = entry["id"] + "|" + ",".join(entry["versions"])
        for version in entry["versions"]:
            clash = ids.get(entry["id"] + version)
            if clash:
                found.append(f"duplicate id {entry['id']} for {version} in {where} and {clash}")
            ids[entry["id"] + version] = where
        levels = [f["level"] for f in entry.get("features", []) if "level" in f]
        if levels != sorted(levels):
            found.append(f"{where}: {entry['name']}: feature levels out of order {levels}")
        names = [f["name"] for f in entry.get("features", [])]
        for name in {n for n in names if names.count(n) > 1}:
            found.append(f"{where}: {entry['name']}: two features named '{name}'")
        for label, text, page, holder in parts(entry):
            text = text or ""
            has_table = bool(holder.get("tables")) or bool(holder.get("sections"))
            if not text.strip() and not has_table:
                found.append(f"{where}: {label}: no text")
            elif text.strip() and not END.search(text.strip()) and not has_table and not FORMULA_LINE.search(text.strip().split("\n")[-1]):
                found.append(f"{where}: {label}: stops without ending a sentence (…{text.strip()[-40:]!r})")
            if re.search(r"[a-z]- [a-z]", text):
                found.append(f"{where}: {label}: a hyphen left from a line break ({re.search(r'[a-z]+- [a-z]+', text).group(0)!r})")
            if not isinstance(page, int) or not 1 <= page <= 440:
                found.append(f"{where}: {label}: page {page}")
            for table in holder.get("tables", []) or []:
                widths = [len(row) for row in table["rows"]]
                usual = max(set(widths), key=widths.count)
                # One-cell rows are captions and sub-headings ("Simple Melee Weapons"), and a stat block is
                # mostly one-cell lines with one row of six abilities. Anything else is a row the reader split.
                odd = [w for w in widths if w != usual and w != 1 and not (usual == 1 and w in (2, 6))]
                if odd:
                    found.append(f"{where}: {label}: a table of {usual}-cell rows with {len(odd)} row(s) of {sorted(set(odd))} cells")
        _ = key
    return found


@lru_cache(maxsize=None)
def page_text(book: str, page: int) -> str:
    pdf = SOURCES / PDFS[book]
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), str(pdf), "-"], capture_output=True, text=True).stdout
    return squash(out)


def squash(text: str) -> str:
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff").replace("ﬃ", "ffi").replace("ﬄ", "ffl")
    return re.sub(r"[^a-z0-9]", "", text.lower())


def text_check() -> list[str]:
    """Each sentence should be found on its page or the two after it (a feature can run over)."""
    found: list[str] = []
    for where, entry in entries():
        for version in entry["versions"]:
            source = entry.get("sources", {}).get(version) if PDFS.get(entry["source"]["book"]) and version not in entry["source"]["book"].replace("v", "dndf-") else entry["source"]
            if source is None or source["book"] not in PDFS:
                continue
            shift = source["page"] - entry["source"]["page"]
            for label, text, page, _holder in parts(entry):
                if not isinstance(page, int):
                    continue
                near = "".join(page_text(source["book"], p) for p in range(max(1, page + shift - 1), page + shift + 3))
                for sentence in re.split(r"(?<=[.!?])\s+|\n", text or ""):
                    key = squash(sentence)
                    if len(key) < 25:
                        continue
                    # hyphenated line breaks differ between the two readers: compare with the hyphen's halves joined
                    if key in near or key[:40] in near or key[-40:] in near:
                        continue
                    # Labelled lines the extractor lays out itself ("Skill Proficiencies Insight, Religion") and table
                    # cells read in a different order: the words are all on the page even though the run is not.
                    words = [squash(w) for w in re.findall(r"[A-Za-z’']{4,}", sentence)]
                    if words and sum(w in near for w in words) >= 0.9 * len(words):
                        continue
                    if True:
                        found.append(f"{where} ({version}): {label} p{page + shift}: not found on the page: {sentence[:70]!r}")
    return found


def everything(entry: dict) -> str:
    """All the words an entry holds, wherever they sit (text, flavor, quotes, table cells, option lists)."""
    out: list[str] = []

    def walk(value) -> None:
        if isinstance(value, str):
            out.append(value)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)

    walk(entry)
    return " ".join(out)


def coverage() -> list[str]:
    """The other direction: every sentence the PDF prints on a page we took entries from should be
    somewhere in the data for that handbook. What is missing was dropped by the reader."""
    found: list[str] = []
    for version, book in (("dndf-10", "DnDF Expanded Handbook v10"), ("dndf-8.8", "DnDF Expanded Handbook v8.8")):
        held: list[str] = []
        pages: set[int] = set()
        for _where, entry in entries():
            if version not in entry["versions"]:
                continue
            own = entry["source"]["book"] == book
            source = entry["source"] if own else entry.get("sources", {}).get(version)
            if not source or source["book"] != book:
                continue
            shift = source["page"] - entry["source"]["page"]
            held.append(everything(entry))
            for _label, _text, page, _holder in parts(entry):
                if isinstance(page, int):
                    pages.add(page + shift)
        have = squash(" ".join(held))
        for page in sorted(pages):
            raw = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), str(SOURCES / PDFS[book]), "-"], capture_output=True, text=True).stdout
            raw = re.sub(r"-\n(?=[a-z])", "", raw)
            for sentence in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", raw)):
                key = squash(sentence)
                if len(key) < 40:
                    continue
                # A heading runs into the sentence after it in this reading, so the start may not match;
                # what the reader drops is the end of a passage, so look for the sentence's last words.
                if key in have or key[-40:] in have or key[-24:] in have:
                    continue
                if sum(c.isdigit() for c in sentence) > len(sentence) / 6:
                    continue  # a row of a table, held cell by cell
                found.append(f"{version} p{page}: in the book, not in the data: {sentence[:60]!r}…")
    return found


def main() -> int:
    only_text = "--text" in sys.argv
    total = 0
    for title, check in ([] if only_text else [("shape", shape)]) + [("text", text_check), ("coverage", coverage)]:
        found = check()
        total += len(found)
        print(f"\n{title}: {len(found)} to look at")
        for line in found:
            print("  " + line)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
