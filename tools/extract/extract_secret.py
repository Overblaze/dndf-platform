#!/usr/bin/env python3
"""Extracts the SECRET material: Devil Fruits, fruit advancements, generation tables and the
DM-only chapters. Output goes to ~/dndf/secret/ and nowhere else.

    python3 tools/extract/extract_secret.py

Nothing this script reads or writes belongs in the repository: no fruit names, no fruit text.
It refuses to write inside the repository, and it prints counts only. Loading the files into
the private Supabase tables is phase 6.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import extract_chapters as chapters  # noqa: E402
from extract_classes import BOOKS, ROOT, slug  # noqa: E402
from pdfdoc import Item, is_footer, load_items  # noqa: E402

SECRET = Path.home() / "dndf" / "secret"

# Where the fruits are. Fruit entries run the full width of the page.
FRUIT_BOOKS = {
    "expanded_encyclopedia": {"pdf": "V1_2_D_DF_EDFE.pdf", "book": "Expanded Devil Fruit Encyclopedia v1.2", "pages": (22, 231)},
    "handbook_v88": {"pdf": "V8_8_D_DF_EH.pdf", "book": "DnDF Expanded Handbook v8.8", "pages": (252, 329)},
    # The original encyclopedia is set in other fonts: names in small caps, lead-ins a size larger
    # than the text instead of bold, always two columns.
    "original_encyclopedia": {"pdf": "Original DDF DFE.pdf", "book": "Original Devil Fruit Encyclopedia", "pages": (5, 148),
                              "name_font": ("ScalaSansCaps", 17), "lead_size": 14, "columns": 2,
                              "section_fonts": {("MrsEavesSmallCaps", 36): 1, ("MrsEavesSmallCaps", 26): 1, ("ScalySans", 22): 2}},
}
DEFAULT_SECTION_FONTS = {("MrEavesSCRemakeMedium", 32): 1, ("MrEavesSCRemakeMedium", 24): 2}

# Secret chapters of the handbooks, read with the ordinary section reader.
SECRET_RULES = {
    "dndf-10": {"fruit_advancements": [(237, 240)], "fruit_generation": [(250, 254)], "dm_chapter": [(305, 372)]},
    "dndf-8.8": {"fruit_advancements": [(235, 237)], "fruit_generation": [(247, 251)], "dm_chapter": [(368, 435)]},
}
ENCYCLOPEDIA_RULES = {"fruit_rules": [(5, 12)], "fruit_advancements": [(13, 16)], "fruit_generation": [(17, 21)], "encyclopedia_spells": [(232, 234)]}

RARITIES = ["Uncommon", "Rare", "Very Rare", "Legendary", "Infernal"]
FIELDS = {"type": "type", "fruit appearance": "appearance", "description": "description", "sea weakness": "seaWeakness"}
STAT_LABEL = re.compile(r"^(Armor Class|Hit Points|Speed|Skills|Senses|Languages|Challenge|Saving Throws|STR DEX CON INT WIS CHA|"
                        r"(Damage|Condition) (Immunities|Resistances|Vulnerabilities))$")
problems: list[str] = []


def extract_advancements(version: str, ranges: list[tuple[int, int]]) -> list[dict]:
    """The fruit advancements have no chapter heading of their own: each small heading is one advancement."""
    from extract_classes import make_feature, split_sections
    from pdfdoc import Para, read_blocks

    out = []
    for first, last in ranges:
        _, options = split_sections(read_blocks(BOOKS[version]["pdf"], first, last), 2)
        for heading, blocks in options:
            type_line = next((b for b in blocks if isinstance(b, Para)), None)
            made = make_feature(heading, [b for b in blocks if b is not type_line], 3)
            item = {"id": f"fruitAdvancement.{slug(heading.text)}", "kind": "fruitAdvancement", "name": heading.text, "versions": [version],
                    "source": {"book": BOOKS[version]["book"], "page": heading.page}, "secret": True,
                    "typeLine": type_line.text if type_line else "", "text": made["text"]}
            for key in ("prerequisite", "sections", "tables", "uses"):
                if key in made:
                    item[key] = made[key]
            if "devil fruit advancement" not in item["typeLine"].lower():
                problems.append(f"{version} p{heading.page}: an advancement has no type line")
            out.append(item)
    return out


def lines_of(items: list[Item]) -> list[list[Item]]:
    """Groups a page's pieces into printed lines, left to right. Italic pieces sit a pixel higher."""
    lines: list[list[Item]] = []
    for item in sorted(items, key=lambda i: (i.top, i.left)):
        if lines and abs(lines[-1][0].top - item.top) <= 4:
            lines[-1].append(item)
        else:
            lines.append([item])
    for line in lines:
        line.sort(key=lambda i: i.left)
    return lines


GUTTER = 459
STAT_TITLE = ("MrEavesSCRemakeMedium", 26)


def opens_columns(line: list[Item]) -> bool:
    """A printed row that is really two columns: something starts at the right-hand column's edge and nothing runs across the gutter."""
    if any(p.left < GUTTER - 4 and p.right > GUTTER + 16 for p in line):
        return False
    for k, piece in enumerate(line):
        if 470 <= piece.left <= 490 and (k == 0 or piece.left - line[k - 1].right >= 12):
            return True
    return False


def reading_lines(on_page: list[Item], always_two: bool, page: int, key: str) -> list[list[Item]]:
    """A page's rows in reading order. A fruit's text runs across the page; a beast's stat block under or beside
    it is set in two columns, so from the first row that shows a gutter the left column is read before the right."""
    if always_two:
        return lines_of([i for i in on_page if i.left < GUTTER]) + lines_of([i for i in on_page if i.left >= GUTTER])
    rows = lines_of(on_page)
    start = next((k for k, row in enumerate(rows) if opens_columns(row) and sum(opens_columns(r) for r in rows[k:k + 8]) >= 2), None)
    if start is None:
        return rows
    top = rows[start][0].top - 4
    above = [i for i in on_page if i.top < top]
    below = [i for i in on_page if i.top >= top]
    if any(i.left < GUTTER - 4 and i.right > GUTTER + 16 for i in below):
        problems.append(f"{key} p{page}: text runs across the page below where two columns begin")
    return lines_of(above) + lines_of([i for i in below if i.left < GUTTER]) + lines_of([i for i in below if i.left >= GUTTER])


def join(pieces: list[Item]) -> str:
    text = ""
    for k, piece in enumerate(pieces):
        gap = piece.left - pieces[k - 1].right if k else 0
        glue = " " if k and gap >= 3 and not text.endswith(" ") and not piece.text.startswith(" ") else ""
        text += glue + piece.text
    return re.sub(r"\s+", " ", text).strip()


def extract_fruits(key: str) -> list[dict]:
    config = FRUIT_BOOKS[key]
    first, last = config["pages"]
    items = [i for i in load_items(config["pdf"], first, last) if not is_footer(i)]
    name_font = config.get("name_font", ("MyFont", 16))
    lead_size = config.get("lead_size")
    section_fonts = config.get("section_fonts", DEFAULT_SECTION_FONTS)
    fruits: list[dict] = []
    section = group = ""
    current: dict | None = None
    paragraph: dict | None = None

    stat: list[dict] | None = None  # the stat block being read, once its title has been met
    for page in range(first, last + 1):
        on_page = [i for i in items if i.page == page]
        # The original encyclopedia and some handbook pages set their fruits in two columns throughout.
        always_two = config.get("columns") == 2 or any((i.family, i.size) == name_font and i.left > 450 for i in on_page)
        for line in reading_lines(on_page, always_two, page, key):
            head = line[0]
            text = join(line)
            base = 478 if head.left >= GUTTER else 81
            if lead_size:
                # Lead-ins are a size larger than the text and indented; the pieces at that size are the lead.
                # A beast's name set at that size in the middle of a sentence is not one: a lead-in ends in a full stop.
                lead_pieces = [p for p in line if p.size == lead_size][:1]
                is_lead = head.size == lead_size and head.left - base > 8 and len(line) > 1 and join(lead_pieces).rstrip().endswith((".", ":"))
                lead_pieces = lead_pieces if is_lead else []
            else:
                is_lead = head.bold and (head.left - base > 14 or stat is not None)
                lead_pieces = []
                for piece in line if is_lead else []:
                    if not piece.bold:
                        break
                    lead_pieces.append(piece)
            level = section_fonts.get((head.family, head.size))
            if level == 1:
                section, current, paragraph, stat = text, None, None, None
            elif level == 2:
                group, current, paragraph, stat = text, None, None, None
            elif (head.family, head.size) == name_font:
                current = {"name": text, "section": section, "group": group, "page": page, "paragraphs": [], "stat": []}
                fruits.append(current)
                paragraph, stat = None, None
            elif current is None:
                continue
            elif (head.family, head.size) == STAT_TITLE and not lead_size:
                # A beast's stat block. It belongs to the fruit on this page that names the beast, else to the
                # first fruit on the page that has no block yet, else to the fruit above.
                here = [f for f in fruits if f["page"] == page]
                named = [f for f in here if text.lower() in " ".join(p["text"] for p in f["paragraphs"]).lower()]
                owner = (named or [f for f in here if not f["stat"]] or [current])[0]
                stat = owner["stat"]
                paragraph = {"lead": text, "text": "", "page": page}
                stat.append(paragraph)
            elif stat is not None:
                if is_lead:
                    paragraph = {"lead": join(lead_pieces).rstrip("."), "text": join(line[len(lead_pieces):]), "page": page}
                    stat.append(paragraph)
                elif head.family == "MyFont":
                    # "Actions", "Reactions": a heading inside the block.
                    paragraph = {"lead": text, "text": "", "page": page}
                    stat.append(paragraph)
                else:
                    paragraph["text"] = (paragraph["text"] + " " + text).strip()
            elif is_lead:
                # A lead-in ("Sea Weakness.") opens each part of a fruit.
                lead = join(lead_pieces)
                paragraph = {"lead": lead.rstrip("."), "text": join(line[len(lead_pieces):]), "page": page}
                current["paragraphs"].append(paragraph)
            elif paragraph is None:
                current.setdefault("typeLine", text)
            else:
                paragraph["text"] = (paragraph["text"] + " " + text).strip()

    # A small heading with no "Devil Fruit, <rarity>" line under it is a table or sub-part of the
    # fruit above (a second form, a chart), not a new fruit.
    real: list[dict] = []
    for fruit in fruits:
        # A fruit too long for one page is printed under its name with "Page 1", "Page 2" … after it: one fruit.
        numbered = re.match(r"(.+\)) \w+ (\d)$", fruit["name"])
        if numbered and numbered.group(2) != "1" and real and real[-1]["name"] == numbered.group(1):
            real[-1]["paragraphs"].extend(fruit["paragraphs"])
            real[-1]["stat"].extend(fruit["stat"])
            continue
        if numbered and numbered.group(2) == "1":
            fruit["name"] = numbered.group(1)
        if "devil fruit" in fruit.get("typeLine", "").lower() or not real:
            real.append(fruit)
            continue
        owner = real[-1]
        if fruit.get("typeLine"):
            owner["paragraphs"].append({"lead": fruit["name"], "text": fruit["typeLine"], "page": fruit["page"]})
        elif not fruit["paragraphs"]:
            owner["paragraphs"].append({"lead": fruit["name"], "text": "", "page": fruit["page"]})
        for para in fruit["paragraphs"]:
            owner["paragraphs"].append({**para, "lead": f"{fruit['name']}: {para['lead']}"})
        owner["stat"].extend(fruit["stat"])
    fruits = real

    out = []
    for fruit in fruits:
        entry: dict = {
            "id": f"devilFruit.{slug(fruit['name'])}",
            "kind": "devilFruit",
            "name": fruit["name"],
            "source": {"book": config["book"], "page": fruit["page"]},
            "section": fruit["section"],
            "group": fruit["group"],
        }
        type_line = fruit.get("typeLine", "")
        rarity = next((r for r in sorted(RARITIES, key=len, reverse=True) if re.search(rf"\b{r}\b", type_line)), None)
        if rarity:
            entry["rarity"] = rarity
        else:
            problems.append(f"{key} p{fruit['page']}: a fruit has no rarity line")
        features = []
        stat_lines = [{"name": p["lead"], "text": p["text"], "page": p["page"]} for p in fruit["stat"]]
        for para in fruit["paragraphs"]:
            lead = para["lead"]
            if STAT_LABEL.match(lead):
                # Lines of a beast's stat block, kept together and apart from the fruit's own features.
                stat_lines.append({"name": lead, "text": para["text"], "page": para["page"]})
                continue
            field = FIELDS.get(lead.lower())
            if field:
                entry[field] = para["text"]
            elif lead.lower().startswith("spells"):
                entry["spells"] = {"name": lead, "text": para["text"], "page": para["page"]}
            elif lead.lower().startswith("awakening"):
                entry["awakening"] = {"name": lead, "text": para["text"], "page": para["page"]}
            else:
                features.append({"name": lead, "text": para["text"], "page": para["page"]})
        entry["features"] = features
        if stat_lines:
            entry["statBlockLines"] = stat_lines
        missing = [name for name in ("type", "description", "seaWeakness") if name not in entry]
        if missing:
            problems.append(f"{key} p{fruit['page']}: a fruit is missing {missing}")
        out.append(entry)
    ids = Counter(e["id"] for e in out)
    for e in out:
        if ids[e["id"]] > 1:
            e["id"] = f"{e['id']}_p{e['source']['page']}"
    return out


def write(name: str, entries: list[dict], note: str) -> None:
    path = (SECRET / f"{name}.json").resolve()
    if ROOT in path.parents or path.parent != SECRET.resolve():
        raise SystemExit(f"Refusing to write secret data to {path}")
    SECRET.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"$schemaVersion": 1, "secret": True, "entries": entries, "$note": note}, indent=2, ensure_ascii=False) + "\n")
    kinds = Counter(e["kind"] for e in entries)
    print(f"{name}: {dict(kinds)}")


def main() -> int:
    for key, config in FRUIT_BOOKS.items():
        fruits = extract_fruits(key)
        write(f"fruits_{key}", fruits, f"SECRET. Devil Fruits from {config['book']}. Never commit; load into private tables only.")
        by = Counter((f.get("rarity"), f["group"]) for f in fruits)
        print("   by rarity:", dict(Counter(f.get("rarity") for f in fruits)))
        print("   with spells:", sum("spells" in f for f in fruits), "· with awakening:", sum("awakening" in f for f in fruits),
              "· features per fruit:", round(sum(len(f["features"]) for f in fruits) / max(1, len(fruits)), 1), "· groups:", len(by))

    for version, parts in SECRET_RULES.items():
        for name, ranges in parts.items():
            chapters.PAGES[version][f"secret_{name}"] = ranges
            entries = extract_advancements(version, ranges) if name == "fruit_advancements" else chapters.extract_sections_as_rules(version, f"secret_{name}", f"{name}_")
            for e in entries:
                e["secret"] = True
            tag = version.replace("dndf-", "v").replace(".", "")
            write(f"{name}_{tag}", entries, f"SECRET. {name.replace('_', ' ')} from {BOOKS[version]['book']}. Never commit.")

    BOOKS["encyclopedia"] = {"pdf": FRUIT_BOOKS["expanded_encyclopedia"]["pdf"], "book": FRUIT_BOOKS["expanded_encyclopedia"]["book"]}
    chapters.PAGES["encyclopedia"] = {}
    for name, ranges in ENCYCLOPEDIA_RULES.items():
        chapters.PAGES["encyclopedia"][name] = ranges
        entries = chapters.extract_sections_as_rules("encyclopedia", name, f"encyclopedia_{name}_")
        for e in entries:
            e["secret"] = True
            e["versions"] = ["dndf-8.8", "dndf-10"]
        write(f"encyclopedia_{name}", entries, "SECRET. From the Expanded Devil Fruit Encyclopedia. Never commit.")

    if problems or chapters.problems:
        print(f"\n{len(problems) + len(chapters.problems)} thing(s) to check (pages only, no names):")
        for p in (problems + chapters.problems)[:60]:
            print("  -", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
