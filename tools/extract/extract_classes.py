#!/usr/bin/env python3
"""Extracts character classes and their subclasses into data/rules/<version>/<class>.json.

    python3 tools/extract/extract_classes.py            # every class in CLASSES
    python3 tools/extract/extract_classes.py chemist    # one class
    python3 tools/extract/extract_classes.py --check    # compare with the hand-verified Bruiser file

Text is copied word for word. Levels come from the class table (class features) or the feature's
own wording ("At 6th level, …"). Limited uses and action types are recognised from standard
phrasings and listed under "auto" on the feature so a reviewer knows they were not typed by hand.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pdfdoc import Block, Heading, Para, Quote, Table, read_blocks  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

BOOKS = {
    "dndf-10": {"pdf": "V10_D_DF_EH.pdf", "book": "DnDF Expanded Handbook v10"},
}

# name: pages, the feature that grants the subclass, and what each later top-level section holds.
# strip = words dropped from subclass names when making ids ("Beast Style" → subclass.bruiser.beast).
SLOTS = [f"slots{i}" for i in range(1, 10)]

# columns = the class table's own columns in print order, after Level and Proficiency Bonus and
# leaving out Features. The printed headers run together in the PDF, so they are named here.
CLASSES = {
    "dndf-10": {
        "bruiser": dict(pages=(85, 92), groups={"Brawling Styles": "subclass"}, strip=["Style"], columns=["scrapper", "fury"]),
        "chemist": dict(pages=(93, 104), groups={"Chemist Studies": "subclass", "Abomination Splices": "options"}, columns=["cantripsKnown", *SLOTS]),
        "conqueror": dict(pages=(105, 112), groups={"Conqueror Tactics": "subclass"}, columns=["leadershipDice", "leadershipDie"],
                          resources=[{"id": "leadership", "name": "Leadership Dice", "max": "col.leadershipDice", "recharge": "short"}]),
        "devilforged": dict(pages=(113, 129), groups={"Devilsmith Style": "subclass"}, grant="Devilsmith", columns=["maxInfusedWeapons", "maxArsenalModifications"]),
        "hybrid": dict(pages=(130, 140), groups={"Hybrid Lineage": "subclass"}, strip=["Lineage"],
                       columns=["hybridPoints", "cantripsKnown", "powersKnown", "highestSpellLevel", "powerThresholdMaximum"]),
        "marksman": dict(pages=(141, 148), groups={"Marksman Archetypes": "subclass"}, columns=["tacticsKnown", *SLOTS[:5]]),
        "martial_artist": dict(pages=(149, 156), groups={"Martial Arts Schools": "subclass"}, columns=["martialArtsDie", "ki", "unarmoredMovement"],
                               resources=[{"id": "ki", "name": "Ki Points", "max": "col.ki", "recharge": "short", "minLevel": 2,
                                           "confirm": "Spent at least 30 minutes of the rest meditating"}]),
        "oracle": dict(pages=(157, 163), groups={"Divination Techniques": "subclass"}, columns=["cantripsKnown", "powersKnown", *SLOTS]),
        "priest": dict(pages=(164, 170), groups={"Divine Domains": "subclass"}, strip=["Domain"], columns=["cantripsKnown", *SLOTS]),
        "renegade": dict(pages=(171, 179), groups={"Roguish Archetypes": "subclass"}, grant="Renegade Archetype", columns=[]),
        "tinkerer": dict(pages=(180, 192), groups={"Tinkerer Studies": "subclass", "Tinkerer Professions": "subclass"}, columns=["cantripsKnown", *SLOTS]),
        "virtuoso": dict(pages=(193, 199), groups={"Virtuoso Schools": "subclass"}, strip=["School of", "School of the"],
                         columns=["manifestChordsDie", "cantripsKnown", "powersKnown", *SLOTS]),
        "warrior": dict(pages=(200, 208), groups={"Warrior Types": "subclass"}, columns=["executeDice"]),
    },
}

ABILITIES = {"strength": "str", "dexterity": "dex", "constitution": "con", "intelligence": "int", "wisdom": "wis", "charisma": "cha"}
NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "any": 0}
ORDINAL = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)\b")
LEVEL_IN_TEXT = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)[- ]level\b", re.I)

problems: list[str] = []
notes: list[str] = []


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower().replace("’", "").replace("'", "")).strip("_")


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def camel(text: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", text)
    return (words[0].lower() + "".join(w.capitalize() for w in words[1:])) if words else "column"


# --- The class table ----------------------------------------------------------


def parse_class_table(table: Table, who: str, names: list[str]) -> tuple[dict[str, list], dict[int, list[str]]]:
    """Returns (columns, features by level). Columns hold one value per level, 1–20."""
    is_feature = lambda c: bool(re.search(r"[A-Za-z]{3,}", c.text)) and not re.fullmatch(r"\d+d\d+|\d+(st|nd|rd|th)|[+\d]+ ?ft\.?", c.text)
    data = [row for row in table.rows if re.fullmatch(r"\d+(st|nd|rd|th)", row[0].text) and row[0].left < 140]
    feature_lefts = sorted(c.left for row in data for c in row[1:] if is_feature(c))
    feature_left = feature_lefts[len(feature_lefts) // 2] if feature_lefts else -999

    features: dict[int, str] = {}
    values: dict[int, list] = {}
    level = 0
    started = False
    for row in table.rows:
        m = re.fullmatch(r"(\d+)(st|nd|rd|th)", row[0].text) if row[0].left < 140 else None
        if not m:
            if started and level:
                features[level] = (features[level] + " " + " ".join(c.text for c in row)).strip()  # a wrapped Features cell
            continue
        started = True
        level = int(m.group(1))
        cells = row[1:]
        if cells and re.fullmatch(r"\+\d", cells[0].text):
            cells = cells[1:]
        feature_cells = [c for c in cells if is_feature(c) or (c.text in ("-", "—") and abs(c.left - feature_left) <= 25)]
        features[level] = " ".join(c.text for c in feature_cells if c.text not in ("-", "—"))
        tokens: list[str] = []
        for cell in cells:
            if cell not in feature_cells:
                tokens.extend(re.sub(r"(\d+) ft\.?", r"\1ft", cell.text).split())
        if len(tokens) != len(names):
            problems.append(f"{who}: level {level} has {len(tokens)} table values {tokens}, expected {len(names)} ({names})")
        values[level] = [_value(t) for t in tokens]

    feature_lists = {
        lvl: [p.strip() for p in re.split(r",\s*(?![^()]*\))", text) if p.strip()] for lvl, text in features.items()
    }
    if sorted(feature_lists) != list(range(1, 21)):
        problems.append(f"{who}: class table has levels {sorted(feature_lists)}")
    columns: dict[str, list] = {}
    for i, name in enumerate(names):
        column = [values.get(l, [])[i] if i < len(values.get(l, [])) else "—" for l in range(1, 21)]
        if any(isinstance(v, int) for v in column):
            column = [0 if v == "—" else v for v in column]
        columns[name] = column
    return columns, feature_lists


def _value(token: str):
    token = token.strip()
    if token in ("-", "—", "–", ""):
        return "—"
    if re.fullmatch(r"[+-]?\d+", token):
        return int(token)
    return token


# --- Sections -------------------------------------------------------------------


def split_sections(blocks: list[Block], level: int) -> tuple[list[Block], list[tuple[Heading, list[Block]]]]:
    """Splits at headings of exactly `level` (shallower headings never appear inside the slice)."""
    intro: list[Block] = []
    sections: list[tuple[Heading, list[Block]]] = []
    for block in blocks:
        if isinstance(block, Heading) and block.level == level:
            sections.append((block, []))
        elif sections:
            sections[-1][1].append(block)
        else:
            intro.append(block)
    return intro, sections


def table_rows(table: Table) -> list[list[str]]:
    return [row for row in table.merged() if any(cell.strip() for cell in row)]


def body_text(blocks: list[Block]) -> str:
    return "\n".join(b.text for b in blocks if isinstance(b, Para))


def make_feature(heading: Heading, blocks: list[Block], deeper: int) -> dict:
    """A feature: its own paragraphs, then any smaller headings as named sections, and its tables."""
    own: list[Block] = []
    subs: list[tuple[Heading, list[Block]]] = []
    in_stat_block = False
    for block in blocks:
        if isinstance(block, Heading) and block.level >= deeper:
            subs.append((block, []))
            in_stat_block = block.stat
        elif in_stat_block and isinstance(block, Para):
            # A stat block is only its table; the running text after it carries on the feature.
            in_stat_block = False
            (own if len(subs) == 1 or not any(not h.stat for h, _ in subs) else subs[-2][1]).append(block)
            if len(subs) > 1 and any(not h.stat for h, _ in subs):
                pass
        elif subs and (in_stat_block or not subs[-1][0].stat):
            subs[-1][1].append(block)
        elif subs:
            # After a stat block's text has resumed, keep adding to wherever it resumed.
            target = next((blocks_ for h, blocks_ in reversed(subs) if not h.stat), own)
            target.append(block)
        else:
            own.append(block)
    feature: dict = {"name": heading.text, "text": body_text(own), "page": heading.page}
    tables = [{"rows": table_rows(b), "page": b.page} for b in own if isinstance(b, Table)]
    sections = []
    for sub, sub_blocks in subs:
        section: dict = {"name": sub.text, "text": body_text(sub_blocks), "page": sub.page}
        sub_tables = [{"rows": table_rows(b), "page": b.page} for b in sub_blocks if isinstance(b, Table)]
        if sub_tables:
            section["tables"] = sub_tables
        if section["text"] or sub_tables:
            sections.append(section)
    if tables:
        feature["tables"] = tables
    if sections:
        feature["sections"] = sections
    if not feature["text"]:
        # A heading followed straight by sub-headings or a table: keep the entry valid and say so.
        if sections or tables:
            feature["text"] = sections[0]["text"] if sections and sections[0]["text"] else "See the table."
            if sections and sections[0]["text"] and not tables:
                pass
        else:
            problems.append(f"p{heading.page}: '{heading.text}' has no text")
            feature["text"] = heading.text
    derive_structure(feature)
    return feature


# --- Structure recognised from standard phrasings ------------------------------------

REST = r"(short or long|long|short)"
ONCE = re.compile(
    rf"(?:once you use this (?:feature|ability|trait)[^.]*?|you (?:can’t|cannot|can not) use (?:this feature|it)(?: this way)? again )until you (?:finish|complete) a {REST} rest"
    rf"|once you use (?:this feature|it)[^.]*?you must (?:finish|complete) a {REST} rest before you can use it again", re.I
)
ONCE_PER = re.compile(rf"\bonce per {REST} rest\b", re.I)
TIMES = re.compile(
    rf"(?:a number|an amount) of times equal to (double |twice |half )?your (proficiency bonus|\w+ modifier)"
    rf"(?:[^.]*?\.?[^.]*?(?:regain|until)[^.]*?(?:finish|complete) a| per|, regaining all uses after a) {REST} rest", re.I
)
WORD_TIMES = {"once": 1, "twice": 2, "two times": 2, "three times": 3, "four times": 4}
FIXED_TIMES = re.compile(
    rf"use this (?:feature|ability|trait) (once|twice|two times|three times|four times)\b[^.]*\.[^.]*?regain (?:all )?(?:expended )?uses when you (?:finish|complete) a {REST} rest", re.I
)
ACTION = re.compile(r"^(?:[^.]{0,80}?\b)?as (?:a|an) (bonus action|action|reaction)\b", re.I)


def recharge_of(rest: str) -> str:
    return "long" if rest.lower() == "long" else "short"


def derive_structure(feature: dict) -> None:
    text = feature["text"]
    auto: list[str] = []
    m = TIMES.search(text)
    if m:
        scale, source, rest = m.group(1), m.group(2).lower(), m.group(3)
        if source == "proficiency bonus":
            expr = "prof"
        else:
            ability = ABILITIES.get(source.split()[0])
            expr = f"max(1, mod.{ability})" if ability else None
        if expr:
            if scale and scale.strip().lower() in ("double", "twice"):
                expr = f"{expr}*2"
            elif scale:
                expr = f"max(1, floor({expr}/2))"
            feature["uses"] = {"max": expr, "recharge": recharge_of(rest)}
            auto.append("uses")
    if "uses" not in feature:
        m = FIXED_TIMES.search(text)
        if m:
            feature["uses"] = {"max": WORD_TIMES[m.group(1).lower()], "recharge": recharge_of(m.group(2))}
            auto.append("uses")
    if "uses" not in feature:
        m = ONCE.search(text) or ONCE_PER.search(text)
        if m:
            feature["uses"] = {"max": 1, "recharge": recharge_of(next(g for g in m.groups() if g))}
            auto.append("uses")
    first_sentence = text.split(". ")[0]
    m = ACTION.search(first_sentence)
    if m:
        feature["action"] = {"bonus action": "bonus", "action": "action", "reaction": "reaction"}[m.group(1).lower()]
        auto.append("action")
    if auto:
        feature["auto"] = auto


# --- Class header ------------------------------------------------------------------


def parse_definitions(blocks: list[Block]) -> dict[str, str]:
    out: dict[str, str] = {}
    for block in blocks:
        if isinstance(block, Para) and block.lead.endswith(":"):
            out[block.lead[:-1].strip().lower()] = block.text[len(block.lead):].strip()
    return out


def split_list(text: str) -> list[str]:
    text = re.sub(r"\.$", "", text.strip())
    if text.lower() in ("none", "-", ""):
        return []
    return [part.strip() for part in re.split(r",\s*(?:and\s+)?|\s+and\s+", text) if part.strip()]


def weapon_id(name: str) -> str:
    low = name.lower()
    for group in ("simple", "martial", "improvised"):
        if low.startswith(group):
            return group
    low = re.sub(r"sses$", "ss", low)
    low = re.sub(r"(?<!s)s$", "", low)
    return slug(low)


def parse_skills(text: str):
    anything = re.match(r"choose any (\w+)(?: skills?)?\.?$", text, re.I)
    if anything and anything.group(1).lower() in NUMBER_WORDS:
        return {"choose": NUMBER_WORDS[anything.group(1).lower()], "from": "any"}
    m = re.match(r"choose (?:any )?(\w+)(?: skills?)? from (.+)", text, re.I)
    if not m or m.group(1).lower() not in NUMBER_WORDS:
        return {"text": text}
    return {"choose": NUMBER_WORDS[m.group(1).lower()], "from": [slug(s) for s in split_list(m.group(2))]}


def parse_equipment(blocks: list[Block]) -> list[str]:
    items = [block.text for block in blocks if isinstance(block, Para) and block.listed]
    # A bullet whose last line fills the column runs into the next one; "(a)" always opens a bullet.
    return [part.strip() for item in items for part in re.split(r"(?<=\S) (?=\(a\) )", item)]


# --- One class ---------------------------------------------------------------------


def feature_level_from_table(name: str, table_features: dict[int, list[str]]) -> int | None:
    want = norm(name)
    for level in sorted(table_features):
        for listed in table_features[level]:
            got = norm(listed)
            if got == want or got == norm(re.sub(r"\s*\([^)]*\)", "", name)) or norm(re.sub(r"\s*\([^)]*\)", "", listed)) == want:
                return level
            if "spellcasting" in want and "spellcasting" in got:
                return level
    return None


LEVEL_LIST = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)(?=(?:,? (?:and |or )?\d{1,2}(?:st|nd|rd|th))+,?[- ]level\b)", re.I)
SPELL_LEVEL = re.compile(r"\b\d{1,2}(?:st|nd|rd|th)[- ]level (?:spell|slot|power|invention|tactic|or (?:higher|lower))", re.I)


def level_from_text(text: str) -> int | None:
    """The level a feature says it is gained at: "At 6th level", "at 3rd, 5th and 9th level" → 3."""
    head = SPELL_LEVEL.sub("", text[:260])
    for pattern in (LEVEL_LIST, LEVEL_IN_TEXT):
        m = pattern.search(head)
        if m:
            return int(m.group(1))
    m = LEVEL_IN_TEXT.search(SPELL_LEVEL.sub("", text))
    return int(m.group(1)) if m else None


def extract_class(version: str, key: str) -> dict:
    config = CLASSES[version][key]
    book = BOOKS[version]
    first, last = config["pages"]
    blocks = read_blocks(book["pdf"], first, last)
    class_id = f"class.{key}"

    # Top level: the class name, "Class Features", then one section per group of subclasses or options.
    name_heading = next(b for b in blocks if isinstance(b, Heading) and b.level == 1)
    name = name_heading.text
    start = blocks.index(name_heading)
    features_at = next(i for i, b in enumerate(blocks) if isinstance(b, Heading) and b.text == "Class Features")
    group_at = [i for i, b in enumerate(blocks) if isinstance(b, Heading) and b.level == 1 and b.text in config["groups"] and i > features_at]
    missing = set(config["groups"]) - {blocks[i].text for i in group_at}
    if missing:
        problems.append(f"{name}: no top-level section named {sorted(missing)}")
    intro = blocks[start + 1:features_at]
    body_end = group_at[0] if group_at else len(blocks)
    body = blocks[features_at + 1:body_end]

    quote = next((b.text for b in intro if isinstance(b, Quote)), None)
    flavor = "\n".join(b.text for b in intro if isinstance(b, Para))
    tables = [b for b in intro + body if isinstance(b, Table) and any(re.fullmatch("1st", r[0].text) for r in b.rows if r)]
    if not tables:
        problems.append(f"{name}: class table not found")
        columns, table_features = {}, {}
    else:
        columns, table_features = parse_class_table(tables[0], name, config["columns"])

    # Hit points, proficiencies, equipment come first as small headings; class features follow.
    lead_in, sections = split_sections([b for b in body if b not in tables], 2)
    header: dict[str, list[Block]] = {}
    current = None
    for block in lead_in:
        if isinstance(block, Heading):
            current = block.text.lower()
            header[current] = []
        elif current:
            header[current].append(block)
    defs = {**parse_definitions(header.get("hit points", [])), **parse_definitions(header.get("proficiencies", []))}
    hit_die = re.search(r"1d(\d+)", defs.get("hit dice", ""))
    if not hit_die:
        problems.append(f"{name}: hit dice not found")
    saves = [ABILITIES[s.lower()] for s in split_list(defs.get("saving throws", "")) if s.lower() in ABILITIES]
    if len(saves) != 2:
        problems.append(f"{name}: saving throws read as {saves}")

    features = []
    for heading, feature_blocks in sections:
        feature = make_feature(heading, feature_blocks, 3)
        level = feature_level_from_table(heading.text, table_features) or level_from_text(feature["text"])
        if level is None:
            level = features[-1]["level"] if features else 1
            notes.append(f"{name}: '{heading.text}' (p{heading.page}) is not in the class table and names no level; placed at level {level} with the feature before it")
        features.append({"level": level, **feature})
    features.sort(key=lambda f: f["level"])  # stable: keeps book order within a level

    asi = [lvl for lvl, names in table_features.items() if any(norm(n) == "abilityscoreimprovement" for n in names)]
    for feature in features:
        if norm(feature["name"]) == "abilityscoreimprovement":
            feature["asi"] = True

    entry: dict = {
        "id": class_id,
        "kind": "class",
        "name": name,
        "versions": [version],
        "source": {"book": book["book"], "page": name_heading.page},
    }
    if flavor:
        entry["flavor"] = flavor
    if quote:
        entry["quote"] = quote
    entry["hitDie"] = int(hit_die.group(1)) if hit_die else 8
    entry["savingThrows"] = saves
    entry["proficiencies"] = {
        "armor": [slug(a) for a in split_list(defs.get("armor", ""))],
        "weapons": [weapon_id(w) for w in split_list(defs.get("weapons", ""))],
        "tools": split_list(defs.get("tools", "")),
        "skills": parse_skills(defs.get("skills", "")),
    }
    entry["startingEquipment"] = parse_equipment(header.get("equipment", []))
    if columns:
        entry["progression"] = {"columns": columns}
    # Pools: named by hand in CLASSES; spell slots when the class says they come back on a rest.
    resources = [dict(r) for r in config.get("resources", [])]
    everything = " ".join(f["text"] + " ".join(s["text"] for s in f.get("sections", [])) for f in features)
    slot_rest = re.search(rf"regain all expended [\w ]*slots when you (?:finish|complete) a {REST} rest", everything, re.I)
    if slot_rest:
        ordinal = lambda n: f"{n}{'st' if n == 1 else 'nd' if n == 2 else 'rd' if n == 3 else 'th'}"
        for n in range(1, 10):
            if f"slots{n}" in columns:
                resources.append({"id": f"slots{n}", "name": f"{ordinal(n)}-level slots", "max": f"col.slots{n}", "recharge": recharge_of(slot_rest.group(1))})
    if resources:
        entry["resources"] = resources
    if asi:
        entry["asiLevels"] = asi

    entries = [entry]
    subclass_levels: list[int] = []
    for n, at in enumerate(group_at):
        title = blocks[at].text
        end = group_at[n + 1] if n + 1 < len(group_at) else len(blocks)
        group_intro, members = split_sections(blocks[at + 1:end], 2)
        intro_text = body_text(group_intro)
        if config["groups"][title] == "subclass":
            # The feature that grants the subclass, and the levels the table marks "<Subclass> Feature".
            wanted = [config["grant"]] if n == 0 and "grant" in config else [title, re.sub(r"s$", "", title), re.sub(r"ies$", "y", title)]
            grant = next((f for f in features if norm(f["name"]) in [norm(w) for w in wanted]), None)
            for heading, member_blocks in members:
                entries.append(make_subclass(version, key, class_id, title, heading, member_blocks, config.get("strip", []), grant["level"] if grant else 0))
            if n == 0:
                stem = norm(grant["name"]).rstrip("s") if grant else "?"
                marks = [lvl for lvl, names in table_features.items() if any(re.search(r"\bfeature$", x, re.I) and stem in norm(x) for x in names)]
                if not marks:
                    marks = [lvl for lvl, names in table_features.items() if any(re.search(r"\bfeature$", x, re.I) for x in names)]
                if grant:
                    grant["grantsSubclass"] = True
                    subclass_levels = sorted({grant["level"], *marks})
                    entry["subclass"] = {"label": grant["name"], "level": grant["level"], "featureLevels": subclass_levels}
                else:
                    problems.append(f"{name}: no class feature matches the subclass section '{title}'")
                if intro_text:
                    entry["subclassIntro"] = {"text": intro_text, "page": blocks[at].page}
        else:
            options = []
            for heading, member_blocks in members:
                _, option_sections = split_sections(member_blocks, 3)
                for sub, sub_blocks in option_sections:
                    option = make_feature(sub, sub_blocks, 4)
                    options.append({"id": slug(sub.text), "name": option.pop("name"), "group": heading.text, **option})
            group = {
                "id": f"optionGroup.{key}_{slug(title)}",
                "kind": "optionGroup",
                "name": title,
                "versions": [version],
                "source": {"book": book["book"], "page": blocks[at].page},
            }
            if intro_text:
                group["text"] = intro_text
            group["options"] = dedupe_ids(options, f"{name} {title}")
            entries.append(group)

    features_key = [f for f in features]
    entry["features"] = features_key
    return {"$schemaVersion": 1, "entries": entries, "$note": f"Extracted from {book['book']} (PDF page = printed page) by tools/extract/extract_classes.py. Feature text is word for word; fields listed under \"auto\" were recognised from the wording."}


def dedupe_ids(options: list[dict], who: str) -> list[dict]:
    seen: dict[str, int] = {}
    for option in options:
        seen[option["id"]] = seen.get(option["id"], 0) + 1
        if seen[option["id"]] > 1:
            option["id"] = f"{option['id']}_{slug(option.get('group', str(seen[option['id']])))}"
    ids = [o["id"] for o in options]
    if len(set(ids)) != len(ids):
        problems.append(f"{who}: duplicate option ids")
    return options


def make_subclass(version, key, class_id, group_title, heading, blocks, strip, granted_at) -> dict:
    book = BOOKS[version]
    intro, sections = split_sections(blocks, 3)
    short = heading.text
    for affix in sorted(strip, key=len, reverse=True):
        short = re.sub(rf"^{re.escape(affix)}\s+|\s+{re.escape(affix)}$", "", short)
    features = []
    for sub, sub_blocks in sections:
        feature = make_feature(sub, sub_blocks, 4)
        level = level_from_text(feature["text"])
        if level is None:
            level = features[-1]["level"] if features else granted_at
            if level:
                notes.append(f"{heading.text}: '{sub.text}' (p{sub.page}) names no level; placed at level {level}")
            else:
                problems.append(f"{heading.text}: no level for '{sub.text}' (p{sub.page})")
        features.append({"level": level or 1, **feature})
    entry: dict = {
        "id": f"subclass.{key}.{slug(short)}",
        "kind": "subclass",
        "parent": class_id,
        "name": heading.text,
        "group": group_title,
        "versions": [version],
        "source": {"book": book["book"], "page": heading.page},
    }
    flavor = body_text(intro)
    if flavor:
        entry["flavor"] = flavor
    intro_tables = [{"rows": table_rows(b), "page": b.page} for b in intro if isinstance(b, Table)]
    if intro_tables:
        entry["tables"] = intro_tables
    if not features:
        problems.append(f"{heading.text}: no features found")
    for before, after in zip(features, features[1:]):
        if after["level"] < before["level"]:
            problems.append(f"{heading.text}: '{after['name']}' reads as level {after['level']} but follows '{before['name']}' at {before['level']} (p{after['page']})")
    entry["features"] = features
    return entry


# --- Checking against the hand-verified pilot ------------------------------------------


def check_bruiser() -> int:
    pilot = json.loads((ROOT / "data/rules/dndf-10/bruiser.json").read_text())
    mine = extract_class("dndf-10", "bruiser")
    squash = lambda t: re.sub(r"\s+", " ", t).strip()
    by_id = {e["id"]: e for e in mine["entries"]}
    wrong = 0
    for want in pilot["entries"]:
        if want["kind"] == "optionGroup":
            got_features = {s["name"]: s for f in by_id["class.bruiser"]["features"] for s in f.get("sections", [])}
            pairs = [(o, got_features.get(o["name"])) for o in want["options"]]
        else:
            got = by_id.get(want["id"])
            if not got:
                print(f"missing entry {want['id']}")
                wrong += 1
                continue
            got_features = {f["name"]: f for f in got["features"]}
            pairs = [(f, got_features.get(f["name"].replace("'", "’"))) for f in want["features"]]
            for field in ("hitDie", "savingThrows", "asiLevels", "subclass"):
                if field in want and want[field] != got.get(field):
                    print(f"{want['id']} {field}: pilot {want[field]} / extracted {got.get(field)}")
                    wrong += 1
        for expected, found in pairs:
            if not found:
                print(f"{want['id']}: missing '{expected['name']}'")
                wrong += 1
                continue
            text = found["text"] + "".join(" " + s["text"] for s in found.get("sections", []) if want["kind"] != "class")
            for t in found.get("tables", []):
                text += " " + " ".join(" ".join(r) for r in t["rows"])
            if want["kind"] != "optionGroup" and expected["name"] not in ("Drunken State", "Fury") and squash(text) != squash(expected["text"]):
                if squash(found["text"]) != squash(expected["text"]):
                    print(f"{want['id']} '{expected['name']}': text differs")
                    wrong += 1
            for field in ("level", "page"):
                if field in expected and expected[field] != found.get(field):
                    print(f"{want['id']} '{expected['name']}' {field}: pilot {expected[field]} / extracted {found.get(field)}")
                    wrong += 1
            if isinstance(expected.get("uses"), dict) and expected["uses"] != found.get("uses"):
                print(f"{want['id']} '{expected['name']}' uses: pilot {expected['uses']} / extracted {found.get('uses')}")
                wrong += 1
    print(f"Bruiser check: {wrong} difference(s) from the hand-verified file.")
    return wrong


def main() -> int:
    args = sys.argv[1:]
    if "--check" in args:
        return 1 if check_bruiser() else 0
    version = "dndf-10"
    wanted = [a for a in args if not a.startswith("-")] or [k for k in CLASSES[version] if k != "bruiser"]
    for key in wanted:
        data = extract_class(version, key)
        out = ROOT / "data" / "rules" / version / f"{key}.json"
        if key == "bruiser" and "--force" not in args:
            print("bruiser: hand-verified file kept (use --check to compare, --force to overwrite)")
            continue
        out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        cls = data["entries"][0]
        subs = [e for e in data["entries"] if e["kind"] == "subclass"]
        print(f"{cls['name']}: d{cls['hitDie']}, {len(cls['features'])} features, {len(subs)} subclasses, "
              f"columns {list(cls.get('progression', {}).get('columns', {}))}")
    if notes and "--notes" in args:
        print(f"\n{len(notes)} level(s) inferred from position:")
        for n in notes:
            print("  -", n)
    elif notes:
        print(f"\n{len(notes)} level(s) inferred from position (--notes to list).")
    if problems:
        print(f"\n{len(problems)} thing(s) to check:")
        for p in problems:
            print("  -", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
