"""Audit the private data in ~/dndf/secret against the books and against itself.

    python3 tools/extract/audit_secret.py            # counts only: safe to paste anywhere
    python3 tools/extract/audit_secret.py --where    # also which book and page each finding is on (no names, no text)

It never changes a file and never prints a fruit's name or words. Two kinds of check, as in audit.py:
  shape  - a fruit with no type, rarity, description or features; a part with no text or that stops
           mid-sentence; a type line that is not Paramecia, Zoan or Logia; a page outside the book.
  text   - every sentence looked up in an independent reading of the same PDF pages (pdftotext).
"""
from __future__ import annotations

import collections
import json
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

SECRET = Path.home() / "dndf" / "secret"
SOURCES = Path.home() / "dndf" / "sources"
PDFS = {
    "DnDF Expanded Handbook v10": "V10_D_DF_EH.pdf",
    "DnDF Expanded Handbook v8.8": "V8_8_D_DF_EH.pdf",
    "Expanded Devil Fruit Encyclopedia v1.2": "V1_2_D_DF_EDFE.pdf",
    "Original Devil Fruit Encyclopedia": "Original DDF DFE.pdf",
}
RARITIES = {"Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Infernal"}
END = re.compile(r"[.!?:”\")’]$|\d$")


def squash(text: str) -> str:
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff").replace("ﬃ", "ffi").replace("ﬄ", "ffl")
    return re.sub(r"[^a-z0-9]", "", text.lower())


@lru_cache(maxsize=None)
def page_count(book: str) -> int:
    out = subprocess.run(["pdfinfo", str(SOURCES / PDFS[book])], capture_output=True, text=True).stdout
    m = re.search(r"Pages:\s+(\d+)", out)
    return int(m.group(1)) if m else 0


@lru_cache(maxsize=None)
def page_text(book: str, page: int) -> str:
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), str(SOURCES / PDFS[book]), "-"], capture_output=True, text=True).stdout
    return squash(out)


def parts(entry: dict):
    """Every piece of text in an entry: (what kind of piece, text, page)."""
    page = entry["source"]["page"]
    for key in ("text", "appearance", "description", "seaWeakness"):
        if isinstance(entry.get(key), str) and entry[key]:
            yield key, entry[key], page
    for key in ("spells", "awakening"):
        if isinstance(entry.get(key), dict):
            yield key, entry[key].get("text", ""), entry[key].get("page", page)
    for key in ("features", "sections"):
        for item in entry.get(key) or []:
            yield key[:-1], item.get("text", ""), item.get("page", page)


def main() -> int:
    where = "--where" in sys.argv
    findings: dict[str, list[str]] = collections.defaultdict(list)
    totals = collections.Counter()
    for path in sorted(SECRET.glob("*.json")):
        for entry in json.loads(path.read_text())["entries"]:
            book, page = entry["source"]["book"], entry["source"]["page"]
            at = f"{path.name}: {book} p{page}"
            totals[entry["kind"]] += 1
            if book not in PDFS:
                findings["book with no PDF to compare against"].append(at)
                continue
            if not 1 <= page <= page_count(book):
                findings["page outside the book"].append(at)
            if entry["kind"] == "devilFruit":
                if not re.search(r"paramecia|zoan|logia", " ".join(str(entry.get(k, "")) for k in ("type", "section", "group")), re.I):
                    findings["fruit: type is not Paramecia, Zoan or Logia"].append(at)
                if not re.search(r"paramecia|zoan|logia", str(entry.get("type", "")), re.I):
                    findings["fruit: type line itself unreadable (the section it is printed in was used)"].append(at)
                if entry.get("rarity") not in RARITIES:
                    findings["fruit: rarity not read"].append(at)
                for key in ("description", "appearance", "seaWeakness", "awakening"):
                    if not entry.get(key):
                        findings[f"fruit: no {key}"].append(at)
                if not entry.get("features"):
                    findings["fruit: no features"].append(at)
                names = [f.get("name", "") for f in entry.get("features") or []]
                if len(names) != len(set(names)):
                    findings["fruit: two features with one name"].append(at)
                if any(not n.strip() or len(n) > 60 for n in names):
                    findings["fruit: a feature name that is empty or a whole sentence"].append(at)
            for kind, text, part_page in parts(entry):
                totals["pieces of text"] += 1
                if not text.strip():
                    if kind != "section":  # a section can be only a table
                        findings[f"{kind}: no text"].append(at)
                    continue
                last = text.strip().split("\n")[-1]
                if not END.search(last) and len(last) > 30:
                    findings[f"{kind}: stops mid-sentence"].append(f"{path.name}: {book} p{part_page}")
                if not isinstance(part_page, int):
                    continue
                near = "".join(page_text(book, p) for p in range(max(1, part_page - 1), min(page_count(book), part_page + 2) + 1))
                for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
                    key = squash(sentence)
                    if len(key) < 25:
                        continue
                    totals["sentences compared with the PDF"] += 1
                    if key in near or key[:40] in near or key[-40:] in near:
                        continue
                    words = [squash(w) for w in re.findall(r"[A-Za-z’']{4,}", sentence)]
                    if words and sum(w in near for w in words) >= 0.9 * len(words):
                        continue
                    findings["sentence not found on its page or the pages next to it"].append(f"{path.name}: {book} p{part_page}")
    print("Looked at: " + ", ".join(f"{n} {k}" for k, n in sorted(totals.items())))
    if not findings:
        print("Nothing found.")
    for label, places in sorted(findings.items(), key=lambda kv: -len(kv[1])):
        print(f"{len(places):5d}  {label}")
        if where:
            for place, n in sorted(collections.Counter(places).items()):
                print(f"         {place}{f' ×{n}' if n > 1 else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
