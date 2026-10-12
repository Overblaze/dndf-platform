#!/usr/bin/env python3
"""Gives private Zoan fruits the stat block of the beast they name from another book.

    python3 tools/extract/attach_stat_blocks.py            # attach, and write the private fruit files back
    python3 tools/extract/attach_stat_blocks.py --check    # report only

Most Zoan fruits print no stat block of their own: a feature says "you can … transform into a <creature> from
Volo's Guide to Monsters" (or the Monster Manual). Those books are not free to reproduce, so their stat blocks
are never in this repository. A DM who owns the book keeps the blocks they need in

    ~/dndf/secret/licensed/*.json      {"book": "...", "blocks": {"<creature>": {"name", "page", "lines": [{name, text, page}]}}}

transcribed by hand (the PDFs' text layers are poor OCR with columns interleaved; see docs/EXTRACTION.md).
This script checks every block against itself (hit points against their dice, modifiers against scores,
attacks against their dice and the creature's Challenge), then copies each onto the fruits that name its
creature, in ~/dndf/secret/fruits_*.json, as `statBlockLines` with `statBlockSource`. It prints counts only.
Run it after extract_secret.py, then load with `npm run load-secret --workspace bot`.
"""
from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from pathlib import Path

SECRET = Path.home() / "dndf" / "secret"
LICENSED = SECRET / "licensed"
NAMES = re.compile(r"transform into an? (.+?)(?: \((.*?)\))? from (Volo[’']s Guide to Monsters|the Monster Manual)", re.I)


def plain(text: str) -> str:
    """"Rothé" and "rothe" are one creature."""
    return re.sub(r"['’]", "", unicodedata.normalize("NFKD", text.replace("’", "'"))).encode("ascii", "ignore").decode().lower().strip()


def number(text: str) -> int:
    return int(text.replace("−", "-").replace("–", "-").replace(" ", ""))


def proficiency(challenge: str) -> int:
    rating = challenge.split()[0]
    value = eval(rating) if re.fullmatch(r"\d+(/\d+)?", rating) else 0  # "1/4" → 0.25
    return 2 + max(0, math.ceil(value) - 1) // 4


def problems_in(block: dict) -> list[str]:
    """What does not add up inside one stat block. Each check reads the block a different way from how it was typed."""
    found: list[str] = []
    line = {l["name"]: l["text"] for l in block["lines"]}
    hp = re.fullmatch(r"(\d+) \((\d+)d(\d+)(?: ([+−-]) (\d+))?\)", line.get("Hit Points", ""))
    if not hp:
        found.append("hit points are not 'N (XdY + Z)'")
    else:
        average = int(hp[2]) * (int(hp[3]) + 1) / 2 + (int(hp[5] or 0) * (-1 if hp[4] in "−-" else 1) if hp[4] else 0)
        if math.floor(average) != int(hp[1]):
            found.append("hit points are not the average of their dice")
    scores = re.findall(r"(\d+) \(([+−-]\d+)\)", line.get("STR DEX CON INT WIS CHA", ""))
    if len(scores) != 6:
        found.append("there are not six ability scores")
    mods = []
    for score, mod in scores:
        mods.append((int(score) - 10) // 2)
        if mods[-1] != number(mod):
            found.append(f"a modifier does not follow from its score ({score})")
    if hp and len(scores) == 6 and hp[4] and int(hp[5]) != int(hp[2]) * abs(mods[2]):
        found.append("the hit point bonus is not Constitution modifier × hit dice")
    prof = proficiency(line.get("Challenge", "0"))
    for row in block["lines"]:
        hit = re.search(r"([+−-]\d+) to hit", row["text"])
        if not hit:
            continue
        if len(scores) == 6 and number(hit[1]) - prof not in (mods[0], mods[1]):
            found.append("an attack bonus is not proficiency + Strength or Dexterity")
        for average, count, die, sign, bonus in re.findall(r"(\d+) \((\d+)d(\d+)(?: ([+−-]) (\d+))?\)", row["text"][hit.end():]):
            total = int(count) * (int(die) + 1) / 2 + (int(bonus) * (-1 if sign in "−-" else 1) if sign else 0)
            if math.floor(total) != int(average):
                found.append("an attack's damage is not the average of its dice")
    if not block["lines"] or block["lines"][0]["name"] != block["name"]:
        found.append("the first line is not the creature's name")
    return found


def main() -> int:
    check = "--check" in sys.argv
    blocks: dict[tuple[str, str], dict] = {}
    wrong = 0
    for path in sorted(LICENSED.glob("*.json")) if LICENSED.is_dir() else []:
        held = json.loads(path.read_text(encoding="utf-8"))
        for key, block in held.get("blocks", {}).items():
            issues = problems_in(block)
            wrong += bool(issues)
            for issue in issues:
                print(f"  block {len(blocks) + 1} in {path.name} (page {block.get('page')}): {issue}")
            blocks[(plain(held["book"]).replace("the ", ""), plain(key))] = {**block, "book": held["book"]}
    print(f"{len(blocks)} licensed stat block(s) held privately; {wrong} with something that does not add up")
    if wrong:
        print("Nothing attached: fix the blocks first.")
        return 1

    attached = missing = already = 0
    wanted: set[tuple[str, str]] = set()
    for path in sorted(SECRET.glob("fruits_*.json")):
        held = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for entry in held.get("entries", []):
            if entry.get("kind") != "devilFruit":
                continue
            if entry.get("statBlockLines") and not entry.get("statBlockSource"):
                already += 1  # the fruit's own book prints its beast
                continue
            named = next((m for f in entry.get("features", []) for m in [NAMES.search(f.get("text", ""))] if m), None)
            if not named:
                continue
            book = plain(named[3]).replace("the ", "")
            # "a cow (ox)" is the ox; "an aurochs (reflavored as a …)" is the aurochs.
            aside = plain(named[2] or "")
            creature = aside if (book, aside) in blocks else plain(named[1])
            wanted.add((book, creature))
            block = blocks.get((book, creature))
            if not block:
                missing += 1
                continue
            lines = [{"name": l["name"], "text": l["text"], "page": l.get("page", block["page"])} for l in block["lines"]]
            source = {"book": block["book"], "page": block["page"]}
            if entry.get("statBlockLines") != lines or entry.get("statBlockSource") != source:
                entry["statBlockLines"], entry["statBlockSource"] = lines, source
                changed = True
            attached += 1
        if changed and not check:
            path.write_text(json.dumps(held, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Fruits that print their own beast: {already}. Fruits naming a beast from another book: {attached + missing}"
          f" ({len(wanted)} different creatures): {attached} given its stat block, {missing} whose creature is not held"
          f" ({len(wanted - set(blocks))} creatures to transcribe).")
    if check:
        print("Checked only; nothing written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
