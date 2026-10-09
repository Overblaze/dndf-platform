"""SRD 5.2.1 (the 2024 fifth edition rules Wizards publishes under CC-BY-4.0) as public reference data.

    python3 tools/extract/extract_srd52.py            # writes data/reference/srd-5.2/*.json
    python3 tools/extract/extract_srd52.py --check    # reports only

Every word written comes from ~/dndf/sources/srd/SRD_CC_v5.2.1.pdf (https://www.dndbeyond.com/srd). It is a
reference shelf for the Library, kept apart from data/rules: DnDF characters are built on the handbooks, which
follow the 2014 rules, so none of this is offered when building a character.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import srd52doc as doc  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "reference" / "srd-5.2"
# Under these sections every third-level heading is a thing of its own (a spell, a feat, a rules term).
CATALOGS = {"Spell Descriptions": "spell", "Rules Definitions": "term", "Feat Descriptions": "feat", "Magic Items A–Z": "magicItem",
            "Character Backgrounds": "background", "Character Species": "species", "Adventuring Gear": "gear"}
# In these chapters every first-level heading is a thing of its own.
WHOLE = {"Classes": "class"}
# And in these every stat block is; the first-level heading over it ("Dragons, Red") is its group.
BESTIARIES = {"Monsters A–Z", "Animals"}
CHAPTERS = ["Playing the Game", "Character Creation", "Classes", "Character Origins", "Feats", "Equipment", "Spells", "Rules Glossary",
            "Gameplay Toolbox", "Magic Items", "Monsters", "Monsters A–Z", "Animals"]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower().replace("’", "").replace("'", "")).strip("_")


def squash(text: str) -> str:
    text = re.sub(r"\b11/2\b", "1½", text)  # see srd52doc.load_items
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff").replace("ﬃ", "ffi").replace("ﬄ", "ffl")
    return re.sub(r"[^a-z0-9]", "", text.lower())


@lru_cache(maxsize=None)
def page_letters(page: int) -> str:
    """The page as plain text from a different tool (pdftotext), squeezed to letters and digits: what the reader's words are checked against."""
    return squash(subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), str(doc.PDF), "-"], capture_output=True, text=True).stdout)


def as_block(block) -> dict:
    if isinstance(block, doc.Heading):
        return {"t": "h", "level": block.level, "text": block.text, "page": block.page}
    if isinstance(block, doc.Table):
        rows = [[c for c in row] for row in block.rows]
        # "Casting Time: Action" and its like: labels and values, not a table of rows and columns.
        joined = [" ".join(c for c in row if c).strip() for row in rows]
        if not block.title and all(re.match(r"^[A-Z][A-Za-z ]{2,24}:", line) for line in joined):
            return {"t": "facts", "rows": [[line.split(":", 1)[0].strip(), line.split(":", 1)[1].strip()] for line in joined], "page": block.page}
        return {"t": "table", **({"title": block.title} if block.title else {}), "rows": rows, "page": block.page, **({"wide": True} if block.wide else {}),
                **({"over": [{"text": text, "from": first, "to": last} for text, first, last in block.over]} if block.over else {}),
                **({"notes": block.notes} if block.notes else {}), **({} if block.head else {"head": False})}
    if isinstance(block, doc.Facts):
        return {"t": "facts", "rows": [[name, value] for name, value in block.rows], "page": block.page}
    if isinstance(block, doc.Abilities):
        return {"t": "abilities", "rows": block.rows, "page": block.page}
    if isinstance(block, doc.Sidebar):
        return {"t": "sidebar", "title": block.title, "text": "\n".join(block.paragraphs), "page": block.page}
    return {"t": "stat" if block.stat else "p", "text": block.text, **({"lead": block.lead} if block.lead else {}), "page": block.page}


def chapters() -> list[dict]:
    blocks = doc.to_blocks(5, doc.page_count())
    out: list[dict] = []
    chapter: dict | None = None
    entry: dict | None = None
    catalog: str | None = None
    group: str | None = None
    h1 = ""

    def start(name: str, page: int, kind: str, **more) -> dict:
        nonlocal entry
        base = f"srd52.{slug(chapter['name'])}.{slug(name)}"
        taken = {e["id"] for e in chapter["entries"]}
        ident, n = base, 2
        while ident in taken:
            ident, n = f"{base}_{n}", n + 1
        entry = {"id": ident, "name": name, "kind": kind, "page": page, **more, "blocks": []}
        chapter["entries"].append(entry)
        return entry

    for block in blocks:
        if isinstance(block, doc.Heading) and block.level == 0:
            chapter = {"name": block.text, "page": block.page, "entries": []}
            out.append(chapter)
            entry, catalog, group, h1 = None, None, None, ""
            continue
        if chapter is None:
            continue
        if isinstance(block, doc.Heading) and block.level == 1:
            h1, catalog, group = block.text, CATALOGS.get(block.text), None
            if chapter["name"] in BESTIARIES:
                entry = None  # whatever is said before the first stat block gets a section of that name
            else:
                start(block.text, block.page, WHOLE.get(chapter["name"], "section"))
            continue
        if chapter["name"] in BESTIARIES and isinstance(block, doc.Heading) and block.level == doc.STAT_NAME:
            start(block.text, block.page, "monster", **({"group": h1} if h1 and h1 != block.text else {}))
            continue
        if catalog and isinstance(block, doc.Heading) and block.level == 2:
            group = block.text
            # What a group says about itself before its first item ("Origin Feats" …) goes with the section.
            entry = next(e for e in chapter["entries"] if e["name"] == h1 and e["kind"] == "section")
            entry["blocks"].append(as_block(block))
            continue
        # ("Parts of a Background" and its like explain the entries; their headings are not entries.)
        if catalog and isinstance(block, doc.Heading) and block.level == 3 and not (group or "").startswith("Parts of"):
            start(block.text, block.page, catalog, section=h1, **({"group": group} if group else {}))
            continue
        if entry is None:
            start(h1 or chapter["name"], block.page, "section")
        made = as_block(block)
        # The line in italics under a spell's or a feat's name: "Level 2 Evocation (Wizard)", "Origin Feat".
        if entry["kind"] in ("spell", "feat", "magicItem", "monster") and not entry["blocks"] and made["t"] in ("p", "stat") and len(made["text"]) < 120 and "subtitle" not in entry and not made["text"].endswith("."):
            entry["subtitle"] = made["text"]
            continue
        entry["blocks"].append(made)
    for chapter in out:
        chapter["entries"] = [e for e in chapter["entries"] if e["blocks"] or e["kind"] != "section"]
        for e in chapter["entries"]:
            if e["kind"] == "spell":
                spell_facts(e)
    return out


SPELL_LABELS = r"(Casting Time|Range|Components?|Duration):"


def spell_facts(entry: dict) -> None:
    """Two spells (Chill Touch, Instant Summons) have their casting time, range, components and duration set
    in the wrong face, so they arrive as running text. The labels are the same four; cut the text at them."""
    first = entry["blocks"][0] if entry["blocks"] else None
    if first is None:
        return
    text = first["text"] if first["t"] == "p" else " ".join(f"{name}: {value}" for name, value in first["rows"]) if first["t"] == "facts" else ""
    pieces = re.split(SPELL_LABELS, text)
    if pieces[0].strip() or len(pieces) != 9 or (first["t"] == "facts" and len(first["rows"]) == 4):
        return
    entry["blocks"][0] = {"t": "facts", "rows": [[pieces[n], pieces[n + 1].strip()] for n in range(1, 9, 2)], "page": first["page"]}


def found_on(text: str, here: str) -> bool:
    """Whether these words are on the page as the second reading has it. That reading takes the columns in
    its own order around tables and sidebars, so a sentence that runs from one column into the next may be
    there in two pieces; a table cell that wraps is there a line at a time, so its words are looked for in runs."""
    whole = squash(text)
    if not whole or whole in here:
        return True
    for sentence in re.split(r"(?<=[.!?:;]) ", text):
        want = squash(sentence)
        if not want or want in here:
            continue
        # In two pieces, cut anywhere: a word hyphenated at the foot of a column is cut inside the word.
        if not any(want[:k] in here and want[k:] in here for k in range(3, len(want) - 2)):
            return False
    return True


def cell_on(text: str, here: str) -> bool:
    """A table cell: found whole, or every run of two of its words is on the page (its lines are interleaved with its neighbours')."""
    if squash(text) in here:
        return True
    words = [w for w in text.split() if squash(w)]
    pairs = [squash(a + b) in here or (squash(a) in here and squash(b) in here and len(squash(a + b)) > 6) for a, b in zip(words, words[1:])]
    return all(squash(w) in here for w in words) and (not pairs or sum(pairs) >= len(pairs) - 1)


def check(found: list[dict]) -> list[str]:
    problems: list[str] = []
    for chapter in found:
        for entry in chapter["entries"]:
            for block in entry["blocks"]:
                page = block["page"]
                # A paragraph may run onto the next page; a table's cell is on the table's page or the next.
                here = page_letters(page) + page_letters(min(page + 1, doc.page_count()))
                prose = (block["text"].split("\n") if "text" in block else []) + block.get("notes", [])
                cells = [c for row in block.get("rows", []) for c in row if c]
                if block["t"] == "facts":  # a value is running text: it may be cut inside a word at the foot of a column
                    prose, cells = prose + cells, []
                for text in prose + ([block["title"]] if block.get("title") else []):
                    if not found_on(text, here):
                        problems.append(f"p{page} {entry['name']}: not found as read: {text[:80]}")
                for text in cells:
                    if not cell_on(text, here):
                        problems.append(f"p{page} {entry['name']}: cell not found as read: {text[:80]}")
    return problems


def coverage(found: list[dict], first: int, last: int) -> tuple[int, int, list[int]]:
    """How many of each page's letters ended up in the data. Low pages are listed."""
    got: Counter = Counter()
    for chapter in found:
        for entry in chapter["entries"]:
            got[entry["page"]] += len(squash(entry["name"] + entry.get("subtitle", "")))
            for block in entry["blocks"]:
                text = block.get("text", "") + block.get("title", "") + "".join(c for row in block.get("rows", []) for c in row) + "".join(block.get("notes", []))
                got[block["page"]] += len(squash(text))
    have = sum(got[p] for p in range(first, last + 1))
    total = sum(len(page_letters(p)) for p in range(first, last + 1))
    low = [p for p in range(first, last) if len(page_letters(p)) and (got[p] + got[p + 1] * 0) / len(page_letters(p)) < 0.80]
    return have, total, low


def main() -> int:
    found = chapters()
    names = [c["name"] for c in found]
    print("Chapters read:", ", ".join(f"{c['name']} (p{c['page']}, {len(c['entries'])})" for c in found))
    wanted = [c for c in found if c["name"] in CHAPTERS]
    kinds = Counter(e["kind"] for c in wanted for e in c["entries"])
    print("Written:", dict(kinds))
    problems = check(wanted)
    for line in problems[:25]:
        print("  PROBLEM", line)
    print(f"{len(problems)} pieces of text not found on their page as read")
    first, last = min(c["page"] for c in wanted), doc.page_count()
    have, total, low = coverage(wanted, first, last)
    skipped = [p for c in found if c["name"] not in CHAPTERS for p in [c["page"]]]
    print(f"Letters on pages {first}-{last}: {total}; in the data: {have} ({100 * have / total:.1f}%). Chapters left out start at pages {skipped}. Pages under 80%: {low[:40]}")
    if "--check" in sys.argv:
        return 1 if problems else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    note = doc.ATTRIBUTION + " Read from the official SRD_CC_v5.2.1.pdf by tools/extract/extract_srd52.py; page numbers are that document's."
    for chapter in wanted:
        target = OUT / f"{slug(chapter['name'])}.json"
        target.write_text(json.dumps({"$schemaVersion": 1, "$note": note, "book": doc.BOOK, "chapter": chapter["name"], "page": chapter["page"], "entries": chapter["entries"]}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"  wrote {target.relative_to(ROOT)}: {len(chapter['entries'])} entries, {target.stat().st_size // 1024} KB")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
