"""SRD 5.1 spells, read from the official document, for the spells the handbooks' class lists name.

    python3 tools/extract/extract_srd.py            # writes data/rules/dndf-10/srd_spells.json
    python3 tools/extract/extract_srd.py --check    # reports only

The System Reference Document 5.1 is published by Wizards of the Coast under CC-BY-4.0, so its text may
be shown with attribution. Read from ~/dndf/sources/srd:
  SRD_CC_v5.1.pdf       the official document. Every word written comes from it.
  5e-SRD-Spells.json    optional: a list of the SRD's spells from github.com/5e-bits/5e-database, used only to
                        check that none was missed and that the fields agree. Its wording is NOT used: it is
                        not always the document's.
Only SRD spells are written. A spell from any other 5e book is never fetched, stored or shown.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pdfdoc  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRD = Path.home() / "dndf" / "sources" / "srd"
PDF = "SRD_CC_v5.1.pdf"
BOOK = "5e SRD 5.1"
ATTRIBUTION = (
    "This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC "
    "and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the "
    "Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode."
)
LABELS = {"casting time": "castingTime", "range": "range", "components": "components", "duration": "duration"}
LEVEL_LINE = re.compile(r"^(?:(\d)(?:st|nd|rd|th)-level (\w+)|(\w+) cantrip)(?: \((ritual)\))?$", re.I)


def tidy(text: str) -> str:
    """The document sets a hyphen as three characters and pads words with no-break spaces."""
    text = re.sub(r"[­‐‑-]+", "-", text.replace(" ", " "))
    return re.sub(r"\s+", " ", text).strip()


def squash(text: str) -> str:
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff").replace("ﬃ", "ffi").replace("ﬄ", "ffl")
    return re.sub(r"[^a-z0-9]", "", text.lower())


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower().replace("’", "").replace("'", "")).strip("_")


@lru_cache(maxsize=None)
def page_text(page: int) -> str:
    return squash(subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), str(SRD / PDF), "-"], capture_output=True, text=True).stdout)


def spell_pages() -> tuple[int, int]:
    pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(SRD / PDF)], capture_output=True, text=True).stdout).group(1))
    first = next(p for p in range(1, pages + 1) if "spelldescriptions" in page_text(p) and "acidarrow" in page_text(p))
    last = next(p for p in range(first, pages + 1) if "zoneoftruth" in page_text(p))
    return first, last


def lines_in_reading_order(first: int, last: int):
    """Each printed line as (page, the column's left edge, pieces): the left column of a page, then the right."""
    pdfdoc.SOURCES = SRD
    items = pdfdoc.load_items(PDF, first, last)
    for page in range(first, last + 1):
        on_page = [i for i in items if i.page == page and i.top > 90 and tidy(i.text) and not re.fullmatch(r"System Reference Document 5\.1|\d+", tidy(i.text))]
        if not on_page:
            continue
        middle = (min(i.left for i in on_page) + max(i.right for i in on_page)) / 2
        for column in ([i for i in on_page if i.left < middle], [i for i in on_page if i.left >= middle]):
            rows: list[list] = []
            for item in sorted(column, key=lambda i: (i.top, i.left)):
                if rows and abs(rows[-1][0].top - item.top) <= 4:
                    rows[-1].append(item)
                else:
                    rows.append([item])
            edge = min((i.left for i in column), default=0)
            for row in rows:
                yield page, edge, sorted(row, key=lambda i: i.left)


def read_spells(first: int, last: int) -> tuple[list[dict], list[str]]:
    problems: list[str] = []
    spells: list[dict] = []
    spell: dict | None = None
    field: str | None = None      # the labelled line being continued (Components can run on)
    in_body = False
    table: list[list[str]] | None = None
    last_top = 0
    last_page = 0

    def add_text(words: str, new_paragraph: bool) -> None:
        paragraphs = spell["paragraphs"]
        if new_paragraph or not paragraphs:
            paragraphs.append(words)
        else:
            # A word broken at a hyphen at the end of a line is one word; anything else gets its space back.
            paragraphs[-1] = paragraphs[-1] + ("" if paragraphs[-1].endswith("-") else " ") + words

    for page, edge, row in lines_in_reading_order(first, last):
        head = row[0]
        text = tidy(" ".join(i.text for i in row))
        # The space above this line; a line at the top of a column or page has none to measure.
        gap = head.top - last_top if page == last_page and head.top > last_top else 0
        last_top, last_page = head.top, page
        if head.family.startswith("GillSans") and head.size >= 24:
            # The chapter's own title opens it; the next title of that size is the next chapter.
            if spells:
                break
            continue
        if head.family.startswith("GillSans") and head.size == 18:
            spell = {"name": text, "page": page, "paragraphs": [], "tables": []}
            spells.append(spell)
            field, in_body, table = None, False, None
            continue
        if spell is None:
            continue
        if "level" not in spell:
            m = LEVEL_LINE.match(text)
            if not m:
                problems.append(f"{spell['name']} p{page}: no level line under the name ({text[:40]!r})")
                spell["level"], spell["school"] = 0, ""
            else:
                spell["level"] = int(m.group(1)) if m.group(1) else 0
                spell["school"] = (m.group(2) or m.group(3)).lower()
                if m.group(4):
                    spell["ritual"] = True
                continue
        if head.family.startswith(("Calibri", "GillSans")):
            # A table inside a spell: its caption, then one row per printed line.
            if head.size >= 16 or head.family.startswith("GillSans"):
                add_text(text, True)
                table = None
                continue
            if table is None:
                table = []
                spell["tables"].append({"rows": table, "page": page})
            table.append([tidy(i.text) for i in row])
            continue
        table = None
        # The document prints "Component:" for one spell (Contagion), on the same line as its range.
        label = re.match(r"^(Casting Time|Range|Components?|Duration):\s*(.*)$", text) if head.bold and not in_body else None
        if label:
            field = LABELS[label.group(1).lower().replace("component", "components").replace("componentss", "components")]
            spell[field] = label.group(2)
            inline = re.match(r"^(.*?)\s+Components?:\s*(.*)$", spell[field]) if field == "range" else None
            if inline:
                spell["range"], spell["components"] = inline.group(1), inline.group(2)
            continue
        # A labelled line can run on, indented or not. Until "Duration" has been read, anything unlabelled is that;
        # after it, only an indented line is, because the spell's own text starts at the column's edge.
        if not in_body and field and (field != "duration" or head.left - edge > 8):
            spell[field] = (spell[field] + ("" if spell[field].endswith("-") else " ") + text).strip()
            continue
        in_body, field = True, None
        # A new paragraph is indented; a bold lead-in ("At Higher Levels.") always opens one.
        indented = bool(re.match(r"^[\s ]{2,}", head.text)) or head.left - min(i.left for i in row) > 0
        lead = head.bold and head.italic
        add_text(text, indented or lead or gap >= 23 or text.startswith("•"))

    return spells, problems


def main() -> int:
    check = "--check" in sys.argv
    first, last = spell_pages()
    spells, problems = read_spells(first, last + 1)  # the last spell runs onto the next page
    entries = []
    sentences = missing = 0
    for spell in spells:
        for key in ("castingTime", "range", "components", "duration"):
            if not spell.get(key):
                problems.append(f"{spell['name']} p{spell['page']}: no {key}")
        if not spell["paragraphs"]:
            problems.append(f"{spell['name']} p{spell['page']}: no text")
        text = "\n".join(spell["paragraphs"])
        if text and not spell["tables"] and not spell["paragraphs"][-1].startswith("•") and not re.search(r"[.!?:)”]$", text):
            problems.append(f"{spell['name']} p{spell['page']}: the text stops mid-sentence")
        # Every sentence against an independent reading of the same pages.
        near = "".join(page_text(p) for p in range(spell["page"], min(last + 1, spell["page"] + 2) + 1))
        for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
            key = squash(sentence)
            if len(key) < 25:
                continue
            sentences += 1
            if key not in near and key[:40] not in near and key[-40:] not in near:
                missing += 1
                problems.append(f"{spell['name']} p{spell['page']}: a sentence does not match the other reading: {sentence[:60]!r}")
        entry = {
            "id": f"spell.{slug(spell['name'])}", "kind": "spell", "name": spell["name"], "versions": ["dndf-8.8", "dndf-10"],
            "source": {"book": BOOK, "page": spell["page"]},
            "level": spell["level"], "school": spell["school"],
            "castingTime": spell.get("castingTime", ""), "range": spell.get("range", ""), "components": spell.get("components", ""), "duration": spell.get("duration", ""),
            "text": text,
        }
        if spell.get("ritual"):
            entry["ritual"] = True
        if spell["tables"]:
            entry["tables"] = spell["tables"]
        entries.append(entry)
    # Tables inside spells. The document's cells run together when read as text, so where the outside list has
    # the same table cell by cell, and every one of its cells is found on the document's pages, its layout is used.
    listed = SRD / "5e-SRD-Spells.json"
    if listed.exists():
        outside_tables = {}
        for s in json.loads(listed.read_text()):
            tables, rows = [], None
            for line in s["desc"]:
                if not line.strip().startswith("|"):
                    rows = None
                    continue
                raw = [c.strip() for c in line.strip().strip("|").split("|")]
                if all(re.fullmatch(r":?-+:?", c) for c in raw):
                    continue  # the rule under a table's header row
                cells = [c.replace("'", "’").replace("--", "—") for c in raw]
                if rows is None:
                    rows = []
                    tables.append(rows)
                rows.append(cells)
            if tables:
                outside_tables[slug(s["name"])] = tables
        for entry in entries:
            theirs = outside_tables.get(slug(entry["name"]))
            if not theirs and "tables" not in entry:
                continue
            page = entry["source"]["page"]
            near = "".join(page_text(p) for p in range(page, min(last + 1, page + 2) + 1))
            cells = [c for t in theirs or [] for r in t for c in r]
            def found(cell: str) -> bool:
                if len(squash(cell)) < 3 or squash(cell) in near:
                    return True
                # A long cell wraps over several lines in the document, which the two readings break differently.
                words = [squash(w) for w in re.findall(r"[A-Za-z’']{4,}", cell)]
                return bool(words) and sum(w in near for w in words) >= 0.9 * len(words)
            unfound = [c for c in cells if not found(c)]
            if theirs and not unfound:
                entry["tables"] = [{"rows": rows, "page": page} for rows in theirs]
            else:
                problems.append(f"{entry['name']} p{page}: its table is kept as read from the document, cells run together ({len(unfound)} outside cells not found, {len(theirs or [])} tables there, {len(entry.get('tables', []))} here)")

    ids = [e["id"] for e in entries]
    for dup in {i for i in ids if ids.count(i) > 1}:
        problems.append(f"two spells share the id {dup}")

    # Cross-check with an outside list of the SRD's spells: none missed, and the plain fields agree.
    if listed.exists():
        outside = {slug(s["name"]): s for s in json.loads(listed.read_text())}
        ours = {slug(e["name"]): e for e in entries}
        for name in sorted(set(outside) - set(ours)):
            problems.append(f"in the outside list, not read from the document: {outside[name]['name']}")
        for name in sorted(set(ours) - set(outside)):
            problems.append(f"read from the document, not in the outside list: {ours[name]['name']}")
        differ = 0
        for name in set(outside) & set(ours):
            a, b = outside[name], ours[name]
            # The outside list shortens "Self (15-foot cube)" to "Self" and drops what triggers a reaction.
            same = a["level"] == b["level"] and squash(b["castingTime"]).startswith(squash(a["casting_time"])) and squash(b["range"]).startswith(squash(a["range"])) and bool(a.get("ritual")) == bool(b.get("ritual"))
            if not same:
                differ += 1
                problems.append(f"{b['name']}: level, casting time, range or ritual differs from the outside list ({a['level']}, {a['casting_time']}, {a['range']} there; {b['level']}, {b['castingTime']}, {b['range']} in the document)")
            elif a["school"]["name"].lower() != b["school"]:
                problems.append(f"{b['name']}: the document says {b['school']}, the outside list {a['school']['name'].lower()}; the document is kept")
        print(f"outside list: {len(outside)} spells, {len(set(outside) & set(ours))} matched, {differ} with a differing field")

    print(f"{len(entries)} spells from pages {first}–{last}; {sentences} sentences checked against a second reading, {missing} not matching; {sum(len(e.get('tables', [])) for e in entries)} tables")
    print(f"{len(problems)} thing(s) to look at")
    for problem in problems[:60]:
        print("  -", problem)
    if not check:
        out = ROOT / "data" / "rules" / "dndf-10" / "srd_spells.json"
        out.write_text(json.dumps({"$schemaVersion": 1, "$note": f"{ATTRIBUTION} Read from the official SRD_CC_v5.1.pdf by tools/extract/extract_srd.py; page numbers are that document's.", "entries": entries}, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
