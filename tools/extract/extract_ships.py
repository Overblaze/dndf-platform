"""The DM Guide's ship chapter ("Chapter 2: Ships and Sailing", PDF pages 11–43), as public rules data.

    python3 tools/extract/extract_ships.py            # writes data/rules/dndf-10/ships.json
    python3 tools/extract/extract_ships.py --check    # reports only

Matt ruled this chapter public (the rest of the DM Guide is not extracted here). Three things come out:
  shipType     each ship's stat block: size, cost, upgrade slots, crew, cargo, pace, abilities, components, actions
  shipUpgrade  each upgrade component: requirement, type, DC, cost, slots, and its lines
  rule         the chapter's sections, word for word, with their tables

The PDF prints on its odd pages only; page numbers are the PDF's, as docs/SPEC.md says to cite this book.
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
PDF = "Original DDF DMG.pdf"
BOOK = "DnDF DM Guide"
FIRST, LAST = 11, 43
GUTTER = 460
VERSIONS = ["dndf-8.8", "dndf-10"]
ABILITIES = ["str", "dex", "con", "int", "wis", "cha"]
problems: list[str] = []


def tidy(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace(" ", " ")).strip()


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower().replace("’", "").replace("'", "")).strip("_")


def squash(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


@lru_cache(maxsize=None)
def page_text(page: int) -> str:
    return squash(subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), str(pdfdoc.SOURCES / PDF), "-"], capture_output=True, text=True).stdout)


def join(pieces) -> str:
    out = ""
    for k, piece in enumerate(pieces):
        gap = piece.left - pieces[k - 1].right if k else 0
        out += (" " if k and gap >= 2 and not out.endswith(" ") and not piece.text.startswith(" ") else "") + piece.text
    return tidy(out)


def lines():
    """Every printed line as (page, column edge, pieces), the left column of a page before the right."""
    items = [i for i in pdfdoc.load_items(PDF, FIRST, LAST) if tidy(i.text)]
    for page in range(FIRST, LAST + 1):
        # The book prints on its odd pages; an even page holds only the running foot (chapter name and page number).
        if page % 2 == 0:
            continue
        on_page = [i for i in items if i.page == page and i.size < 60]
        for column in ([i for i in on_page if i.left < GUTTER], [i for i in on_page if i.left >= GUTTER]):
            rows: list[list] = []
            for item in sorted(column, key=lambda i: (i.top, i.left)):
                if rows and abs(rows[-1][0].top - item.top) <= 4:
                    rows[-1].append(item)
                else:
                    rows.append([item])
            edge = min((i.left for i in column), default=0)
            for row in rows:
                yield page, edge, sorted(row, key=lambda i: i.left)


def kind_of(row) -> str:
    head = max(row, key=lambda i: i.size)
    if head.size >= 28:
        return "chapter"
    if head.size == 22:
        return "h1"
    if head.size == 16:
        return "h2"
    if head.size == 14:
        return "h3"
    return "text"


def label_of(row) -> tuple[str, str] | None:
    """A labelled line: bold (or italic) words that end in a full stop or colon, or one of the stat block's bare labels."""
    lead = []
    for piece in row:
        if piece.family.startswith("Tahoma"):
            continue
        if not (piece.bold or piece.italic):
            break
        lead.append(piece)
    if not lead:
        return None
    label = join(lead)
    rest = join([p for p in row if p not in lead])
    return label.rstrip(".:").strip(), rest


def number(text: str) -> float | None:
    m = re.search(r"-?\d[\d,]*(?:\.\d+)?", text)
    return float(m.group(0).replace(",", "")) if m else None


def whole(text: str) -> int | None:
    n = number(text)
    return int(n) if n is not None else None


class Table:
    """A table inside a rules section: cells are centred under their headers and wrap, so a piece belongs to the
    column whose header it is centred nearest, and a row starts where the first column has something new."""

    def __init__(self, header, page: int):
        self.rows: list[list[str]] = [[tidy(p.text) for p in header]]
        self.page = page
        self.place(header)

    def place(self, header) -> None:
        """Where the columns are. A table that runs on to the next column or page repeats its header there, somewhere else."""
        self.centres = [p.left + p.width / 2 for p in header]
        # The first column is narrow (a die result, a size): whatever ends before the middle of the gap to the second header is in it.
        self.first_ends = (header[0].right + header[1].left) / 2
        self.first_left = header[0].right + 12

    def add(self, row) -> None:
        cells = [""] * len(self.centres)
        for piece in row:
            numbered = re.match(r"^(\d+(?:-\d+)?)\s+(\S.*)$", tidy(piece.text))
            if piece.left <= self.first_left and piece.right > self.first_ends and numbered and len(self.centres) == 2:
                # The die result and its text set as one piece: "98 Battle. A nearby …".
                cells[0] = numbered.group(1)
                cells[1] = (cells[1] + " " + numbered.group(2)).strip()
                continue
            dice = r"\d+(-\d*)?"
            wrapped = len(self.rows) > 1 and all(re.fullmatch(dice, r[0]) for r in self.rows[1:]) and not re.fullmatch(dice, tidy(piece.text))
            if piece.right <= self.first_ends and not wrapped:
                k = 0
            elif piece.right <= self.first_ends:
                k = 1  # a short last line of a wrapped cell, sitting under the die column of a table of die results
            else:
                k = min(range(1, len(self.centres)), key=lambda c: abs(self.centres[c] - (piece.left + piece.width / 2)))
            cells[k] = (cells[k] + " " + tidy(piece.text)).strip()
        last = self.rows[-1]
        # "10-" over "11" is one cell; a line with nothing new in the first column continues the row above.
        continues = len(self.rows) > 1 and (not cells[0] or last[0].endswith("-"))
        if continues:
            for k, cell in enumerate(cells):
                if cell:
                    last[k] = (last[k] + ("" if last[k].endswith("-") else " ") + cell).strip()
        else:
            self.rows.append(cells)


def read() -> tuple[list[dict], list[dict], list[dict]]:
    ships: list[dict] = []
    upgrades: list[dict] = []
    rules: list[dict] = []
    mode = "rules"          # "ship" inside a stat block, "upgrade" inside an upgrade, else the chapter's prose
    ship = component = upgrade = None
    rule = section = None
    group = ""
    table: Table | None = None
    in_upgrades = False
    field = None            # a labelled stat line that can run on to the next line
    last = (0, 0)

    def paragraph(target: dict, text: str, new: bool) -> None:
        paras = target.setdefault("paragraphs", [])
        if new or not paras:
            paras.append(text)
        else:
            paras[-1] = paras[-1] + ("" if paras[-1].endswith("-") else " ") + text

    for page, edge, row in lines():
        text = join(row)
        head = row[0]
        gap = head.top - last[1] if last[0] == page and head.top > last[1] else 0
        last = (page, head.top)
        kind = kind_of(row)
        if kind == "chapter":
            continue
        if kind == "h1":
            table = None
            in_upgrades = text == "Ship Upgrades" or (in_upgrades and False)
            is_rules = text in {"Ship Stat Blocks", "Ship Upgrades", "Crew", "Sailing", "Naval Combat", "Enhanced Naval Combat Rules", "Crashing", "Docking a Ship", "Ship Salvaging", "Mapping"}
            if is_rules:
                mode = "rules"
                rule = {"name": text, "page": page, "paragraphs": [], "sections": []}
                rules.append(rule)
                section = None
                ship = upgrade = None
            else:
                mode = "ship"
                ship = {"name": text, "page": page, "components": [], "lines": {}}
                ships.append(ship)
                component = None
                field = None
            continue
        if mode == "ship":
            if kind == "h2":
                component = {"name": text, "lines": [], "text": []}
                ship["components"].append(component)
                field = None
                continue
            if "typeLine" not in ship:
                ship["typeLine"] = text
                continue
            if component is None:
                if re.fullmatch(r"(STR|DEX|CON|INT|WIS|CHA)(\s+(STR|DEX|CON|INT|WIS|CHA))*", text):
                    continue
                scores = re.findall(r"(\d+)(?:\s*\([+-]?\d+\))?", text)
                if "abilities" not in ship and len(scores) == 6 and not label_of(row):
                    ship["abilities"] = dict(zip(ABILITIES, map(int, scores)))
                    continue
                labelled = label_of(row)
                if labelled and labelled[0]:
                    field = labelled[0]
                    ship["lines"][field] = re.sub(r"฿\s+", "฿", labelled[1]).strip()
                elif field:
                    ship["lines"][field] = (ship["lines"][field] + " " + text).strip()
                else:
                    problems.append(f"{ship['name']} p{page}: a line before the first component was not understood: {text[:50]!r}")
                continue
            labelled = label_of(row)
            if labelled and labelled[0] and (row[0].bold and row[0].italic):
                component["lines"].append([labelled[0], labelled[1]])
                field = "line"
            elif field == "line" and head.left - edge <= 4 and gap < 15 and component["lines"] and not component["text"]:
                component["lines"][-1][1] = (component["lines"][-1][1] + " " + text).strip()
            else:
                field = None
                component["text"].append(text) if gap >= 15 or not component["text"] else component["text"].__setitem__(-1, component["text"][-1] + " " + text)
            continue
        # The chapter's prose, and inside "Ship Upgrades" the upgrades themselves.
        if rule is None:
            continue
        if kind == "h2" and rule["name"] == "Ship Upgrades":
            table = None
            if text.endswith("Components"):
                group = text
                upgrade = None
                continue
            if text.endswith("Upgrade"):
                upgrade = {"name": text, "page": page, "group": group, "lines": [], "text": []}
                upgrades.append(upgrade)
                field = None
                continue
            # A heading that is not an upgrade ("Acquiring a Ship") is an ordinary part of the section.
            upgrade = None
        if upgrade is not None and rule["name"] == "Ship Upgrades" and kind == "text":
            labelled = label_of(row)
            if labelled and labelled[0] and (head.bold or head.italic):
                upgrade["lines"].append([labelled[0], re.sub(r"฿\s+", "฿", labelled[1]).strip()])
                field = "line"
            elif field == "line" and gap < 15 and head.left - edge <= 4 and not upgrade["text"]:
                upgrade["lines"][-1][1] = (upgrade["lines"][-1][1] + " " + text).strip()
            else:
                field = None
                upgrade["text"].append(text) if gap >= 15 or not upgrade["text"] else upgrade["text"].__setitem__(-1, upgrade["text"][-1] + " " + text)
            continue
        if kind in ("h2", "h3"):
            section = {"name": text, "page": page, "paragraphs": [], "tables": []}
            rule["sections"].append(section)
            table = None
            continue
        target = section or rule
        body = all(p.family.startswith("Bookinsanity") for p in row)
        if not body:
            # Set in the stat block's type: a table, or a short labelled line.
            if all(p.bold for p in row) and len(row) >= 2 and (table is None or [tidy(p.text) for p in row] == table.rows[0]):
                if table is None:
                    table = Table(row, page)
                    target.setdefault("tables", []).append(table)
                else:
                    table.place(row)  # the same table, carried on under a repeated header
                continue
            if all(p.family.startswith("ScalaSans") for p in row):
                # A small-capitals name under a table ("Light Rain or Fog"): the start of what follows, not a row.
                table = None
                paragraph(target, text, True)
                continue
            if table is not None:
                table.add(row)
                continue
            paragraph(target, text, True)
            continue
        table = None
        paragraph(target, text, head.left - edge >= 6 or gap >= 18)
    return ships, upgrades, rules


def ship_entry(ship: dict) -> dict:
    lines = ship["lines"]
    crew = re.search(r"(\d+) crew(?:, (\d+) passengers?)?", lines.get("Crew Maximum", ""))
    pace = re.search(r"([\d.]+) miles per hour(?: \((\d+) miles per day\))?", lines.get("Travel Pace", ""))
    size = re.match(r"(\w+)( special)? vehicle(?: \((.+)\))?", ship.get("typeLine", ""))
    components = []
    actions = ""
    for c in ship["components"]:
        if c["name"] == "Actions":
            actions = "\n".join(c["text"])
            continue
        # "Control and Movement: Dial" (a Waver, a rowboat's oars) both steers and moves the boat: it is filed as movement, where its speed counts.
        m = re.match(r"(?:(?:Control and )?(Control|Movement|Weapon): )?(.+?)(?: \((\d+)\))?$", c["name"])
        by = dict((k, v) for k, v in c["lines"])
        hp = by.get("Hit Points", "")
        comp = {
            "name": c["name"],
            "role": (m.group(1) or ("Hull" if c["name"] == "Hull" else "Other")).lower(),
            "count": int(m.group(3)) if m.group(3) else 1,
        }
        if whole(by.get("Armor Class", "")) is not None:
            comp["ac"] = whole(by["Armor Class"])
        if whole(hp) is not None:
            comp["hp"] = whole(hp)
        threshold = re.search(r"damage threshold (\d+)", hp)
        if threshold:
            comp["threshold"] = int(threshold.group(1))
        loss = re.search(r"-(\d+) ft\. speed per (\d+) damage", hp)
        if loss:
            comp["speedLoss"] = {"feet": int(loss.group(1)), "per": int(loss.group(2))}
        speed = re.search(r"speed (\d+) ft\.", " ".join(v for _, v in c["lines"]))
        if speed:
            comp["speed"] = int(speed.group(1))
        comp["text"] = "\n".join([f"{k}. {v}".strip() for k, v in c["lines"]] + c["text"])
        components.append(comp)
        # A part with no Armor Class or Hit Points of its own (a Seastone Bottom) is a property of the hull, in words.
        if ("ac" not in comp or "hp" not in comp) and comp["role"] != "other":
            problems.append(f"{ship['name']} p{ship['page']}: component {c['name']} has no Armor Class or Hit Points")
    entry = {
        "id": f"shipType.{slug(ship['name'])}", "kind": "shipType", "name": ship["name"], "versions": VERSIONS, "source": {"book": BOOK, "page": ship["page"]},
        "typeLine": ship.get("typeLine", ""),
        "size": size.group(1) if size else "",
        "text": "\n".join(f"{k} {v}" for k, v in lines.items()),
        "components": components,
        "actions": actions,
    }
    if not size:
        problems.append(f"{ship['name']} p{ship['page']}: size not read from {ship.get('typeLine')!r}")
    if size and size.group(3):
        entry["dimensions"] = size.group(3)
    if size and size.group(2):
        # "Special vehicles cannot be purchased from ordinary vendors" (p11).
        entry["special"] = True
    for key, label, convert in (("cost", "Cost", whole), ("upgradeSlots", "Upgrade Slots", whole), ("cargoTons", "Cargo Capacity", number)):
        value = convert(lines.get(label, ""))
        if value is None:
            problems.append(f"{ship['name']} p{ship['page']}: no {label}")
        else:
            entry[key] = value
    if crew:
        entry["crew"] = int(crew.group(1))
        entry["passengers"] = int(crew.group(2) or 0)
    else:
        problems.append(f"{ship['name']} p{ship['page']}: crew maximum not read from {lines.get('Crew Maximum')!r}")
    if pace:
        entry["pace"] = {"mph": float(pace.group(1)), **({"milesPerDay": int(pace.group(2))} if pace.group(2) else {})}
    else:
        problems.append(f"{ship['name']} p{ship['page']}: travel pace not read from {lines.get('Travel Pace')!r}")
    if "abilities" in ship:
        entry["abilities"] = ship["abilities"]
    else:
        problems.append(f"{ship['name']} p{ship['page']}: no ability scores")
    for key, label in (("damageImmunities", "Damage Immunities"), ("conditionImmunities", "Condition Immunities")):
        if lines.get(label):
            entry[key] = lines[label]
    if not components:
        problems.append(f"{ship['name']} p{ship['page']}: no components")
    return entry


def upgrade_entry(upgrade: dict) -> dict:
    by = dict((k, v) for k, v in upgrade["lines"])
    entry = {
        "id": f"shipUpgrade.{slug(upgrade['name'])}", "kind": "shipUpgrade", "name": upgrade["name"], "versions": VERSIONS, "source": {"book": BOOK, "page": upgrade["page"]},
        "group": upgrade["group"],
        "text": "\n".join([f"{k}{':' if k == 'Requirement' else '.'} {v}".strip() for k, v in upgrade["lines"]] + upgrade["text"]),
    }
    if by.get("Requirement"):
        entry["requirement"] = by["Requirement"]
    if by.get("Component Type"):
        entry["componentType"] = by["Component Type"]
    if whole(by.get("Upgrade DC", "")) is not None:
        entry["upgradeDc"] = whole(by["Upgrade DC"])
    if by.get("Component Cost"):
        # "10,000,000 + 20% of ship cost", "5% of ship cost", "4,000,000": a flat part and a share of the ship's own cost.
        text = by["Component Cost"].rstrip(".")
        flat = re.match(r"฿?\s*([\d,]+)(?![\d,]*\s*%)", text)
        share = re.search(r"(\d+)% of ship cost", text)
        entry["costText"] = text
        if flat:
            entry["cost"] = int(flat.group(1).replace(",", ""))
        if share:
            entry["costPercent"] = int(share.group(1))
        if not flat and not share:
            problems.append(f"upgrade {upgrade['name']} p{upgrade['page']}: cost not read from {text!r}")
    slots = whole(by.get("Upgrade slots required", ""))
    if slots is None:
        problems.append(f"upgrade {upgrade['name']} p{upgrade['page']}: upgrade slots not read")
    else:
        entry["slots"] = slots
    if whole(by.get("Armor Class", "")) is not None:
        entry["ac"] = whole(by["Armor Class"])
    if whole(by.get("Hit Points", "")) is not None:
        entry["hp"] = whole(by["Hit Points"])
    return entry


def rule_entry(rule: dict) -> dict:
    def tables(holder):
        return [{"rows": t.rows, "page": t.page} for t in holder.get("tables", [])]
    entry = {
        "id": f"rule.ships_{slug(rule['name'])}", "kind": "rule", "name": rule["name"], "versions": VERSIONS, "source": {"book": BOOK, "page": rule["page"]},
        "text": "\n".join(rule["paragraphs"]),
    }
    if tables(rule):
        entry["tables"] = tables(rule)
    sections = []
    for s in rule["sections"]:
        made = {"name": s["name"], "text": "\n".join(s["paragraphs"]), "page": s["page"]}
        if tables(s):
            made["tables"] = tables(s)
        sections.append(made)
    if sections:
        entry["sections"] = sections
    return entry


def main() -> int:
    check = "--check" in sys.argv
    ships, upgrades, rules = read()
    entries = [rule_entry(r) for r in rules] + [ship_entry(s) for s in ships] + [upgrade_entry(u) for u in upgrades]
    ids = [e["id"] for e in entries]
    for dup in {i for i in ids if ids.count(i) > 1}:
        problems.append(f"two entries share the id {dup}")
    # Every sentence against an independent reading of the same pages.
    sentences = missing = 0
    for e in entries:
        texts = [(e.get("text", ""), e["source"]["page"])] + [(c.get("text", ""), e["source"]["page"]) for c in e.get("components", [])] + [(e.get("actions", ""), e["source"]["page"])] + [(s["text"], s["page"]) for s in e.get("sections", [])]
        for text, page in texts:
            near = "".join(page_text(p) for p in range(page, min(LAST, page + 4) + 1))
            for sentence in re.split(r"(?<=[.!?])\s+|\n", text or ""):
                key = squash(sentence)
                if len(key) < 25:
                    continue
                sentences += 1
                if key in near or key[:40] in near or key[-40:] in near:
                    continue
                words = [squash(w) for w in re.findall(r"[A-Za-z’']{4,}", sentence)]
                if words and sum(w in near for w in words) >= 0.9 * len(words):
                    continue
                missing += 1
                problems.append(f"{e['name']} p{page}: a sentence does not match the other reading: {sentence[:60]!r}")
    print(f"{len(ships)} ships, {len(upgrades)} upgrades, {len(rules)} rule sections ({sum(len(r['sections']) for r in rules)} subsections, {sum(len(e.get('tables', [])) + sum(len(s.get('tables', [])) for s in e.get('sections', [])) for e in entries)} tables); {sentences} sentences checked, {missing} not matching")
    print(f"{len(problems)} thing(s) to look at")
    for problem in problems[:50]:
        print("  -", problem)
    if not check:
        out = ROOT / "data" / "rules" / "dndf-10" / "ships.json"
        out.write_text(json.dumps({"$schemaVersion": 1, "$note": f"Chapter 2 of the {BOOK} (PDF pages {FIRST}–{LAST}), which Matt ruled public. Extracted by tools/extract/extract_ships.py; pages are the PDF's.", "entries": entries}, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
