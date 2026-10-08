#!/usr/bin/env python3
"""Extracts chapters 1 and 2 of the Expanded Handbook: general rules, crew roles, backgrounds,
feats, dreams and races, into data/rules/<version>/.

    python3 tools/extract/extract_chapters.py

Uses the same reader and the same rules as extract_classes.py: text word for word, a page on
everything, and anything recognised from wording listed under "auto".
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract_classes import ABILITIES, BOOKS, ROOT, body_text, derive_structure, dice_in, make_feature, proficiencies_granted, skills_granted, slug, split_sections, table_rows  # noqa: E402
from structure import RACE_CHOICES, RACE_TRAIT_SPLITS, apply_feat_structure, apply_haki_structure, apply_race_structure  # noqa: E402
from pdfdoc import Block, Heading, Para, Table, is_footer, load_items, read_blocks  # noqa: E402

# Page ranges in the v10 handbook.
PAGES = {
    "dndf-10": {
        # Chapter 1's general rules, Character Dreams, and Multiclassing at the end of chapter 3.
        "rules": [(9, 12), (18, 19), (66, 66), (209, 210)],
        "crew_roles": (13, 17),
        "backgrounds": (20, 51),
        "feats": (52, 65),
        "races": (67, 82),
        "spell_lists": (211, 217),
        "custom_spells": (218, 220),
        # Spirit Surges up to the last Haki page, then Spirit Surge Training. The pages between
        # (Devil Fruit advancements) are secret and are not read here.
        "surges": [(221, 236), (241, 241)],
        # Devil Fruit rules for players; the generation tables after them are secret.
        "fruit_rules": [(242, 249), (292, 292)],
        "armory": (255, 291),
    },
    "dndf-8.8": {
        "spell_lists": (210, 217),
        "custom_spells": (218, 220),
        "surges": [(221, 234), (238, 238)],
        "fruit_rules": [(239, 246), (355, 355)],
        "armory": (330, 354),
        "rules": [(9, 12), (18, 19), (66, 66), (208, 209)],
        "crew_roles": (13, 17),
        "backgrounds": (20, 51),
        "feats": (52, 65),
        "races": (67, 82),
    },
}

SKILL_IDS = [
    "acrobatics", "animal_handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation",
    "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight_of_hand", "stealth", "survival",
]
problems: list[str] = []


def entry(version: str, kind: str, ident: str, name: str, page: int) -> dict:
    return {"id": f"{kind}.{ident}", "kind": kind, "name": name, "versions": [version], "source": {"book": BOOKS[version]["book"], "page": page}}


def top_sections(blocks: list[Block], level: int = 1) -> list[tuple[Heading, list[Block]]]:
    return split_sections(blocks, level)[1]


def skills_in(text: str) -> list[str] | None:
    """Skill ids named in a short list ("Insight, Religion"); None if any part isn't a skill."""
    parts = [slug(p) for p in re.split(r",\s*(?:and\s+)?|\s+and\s+", re.sub(r"\.$", "", text.strip())) if p.strip()]
    return parts if parts and all(p in SKILL_IDS for p in parts) else None


def sections_from(blocks: list[Block], deeper: int, who: Heading) -> dict:
    """Intro text plus every smaller heading as a named section (reusing the class feature builder)."""
    return make_feature(who, blocks, deeper)


# --- General rules ------------------------------------------------------------------


def extract_rules(version: str) -> list[dict]:
    out = []
    for first, last in PAGES[version]["rules"]:
        blocks = read_blocks(BOOKS[version]["pdf"], first, last)
        for heading, body in top_sections(blocks):
            made = sections_from(body, 2, heading)
            item = entry(version, "rule", slug(heading.text), heading.text, heading.page)
            item["text"] = made["text"]
            for key in ("sections", "tables"):
                if key in made:
                    item[key] = made[key]
            out.append(item)
    return out


# What a chapter says before its first heading: the title, then a line that opens with a large
# capital. Page → title, in each handbook. Chapters whose opening is secret or DM-only are not here.
OPENINGS = {
    "dndf-10": {9: "Chapter 1: Making a Character", 67: "Chapter 2: Character Races", 83: "Chapter 3: Character Classes",
                211: "Chapter 4: Updated Spell Lists", 221: "Chapter 5: Spirit Surges", 242: "Chapter 6: Devil Fruits",
                255: "Chapter 7: Expanded Armory", 291: "Underworld Marketplace"},
    "dndf-8.8": {9: "Chapter 1: Making a Character", 67: "Chapter 2: Character Races", 83: "Chapter 3: Character Classes",
                 210: "Chapter 4: Updated Spell Lists", 221: "Chapter 5: Spirit Surges", 239: "Chapter 6: Devil Fruits",
                 330: "Chapter 7: Expanded Armory", 354: "Underworld Marketplace"},
}


def extract_openings(version: str) -> list[dict]:
    out = []
    for page, title in OPENINGS[version].items():
        opening: list[str] = []
        tables: list[dict] = []
        # The opening ends at the first heading; the list of classes runs on to the next page before it does.
        for block in read_blocks(BOOKS[version]["pdf"], page, page + 1):
            if isinstance(block, Heading):
                break
            if isinstance(block, Table):
                # A table before the first heading belongs to the opening (the list of classes and subclasses).
                if opening:
                    tables.append({"rows": table_rows(block), "page": block.page})
            elif isinstance(block, Para) and block.text.strip() != "฿":  # a stray coin sign from the price table below
                opening.append(block.text)
        if not opening:
            continue
        # The opening runs across both columns, so its lines arrive as short paragraphs: join the
        # ones that stop mid-sentence.
        text = ""
        for part in opening:
            text += ("\n" if re.search(r"[.!?:”\"]$", text) else " ") + part if text else part
        if not text.startswith(title):
            problems.append(f"{version} p{page}: the chapter opening does not start with '{title}'")
            continue
        text = text[len(title):].strip()
        if len(text) < 40:
            continue
        item = entry(version, "rule", slug(title) + "_opening", title, page)
        item["text"] = text
        if tables:
            item["tables"] = tables
        out.append(item)
    return out


# --- Crew roles -----------------------------------------------------------------------


def extract_crew_roles(version: str) -> list[dict]:
    first, last = PAGES[version]["crew_roles"]
    blocks = read_blocks(BOOKS[version]["pdf"], first, last)
    (chapter, body), = top_sections(blocks)
    intro, roles = split_sections(body, 2)
    made = sections_from(intro, 3, chapter)
    general = entry(version, "rule", "crew_roles", chapter.text, chapter.page)
    general["text"] = made["text"]
    if "sections" in made:
        general["sections"] = made["sections"]
    out = [general]
    for heading, role_blocks in roles:
        made = sections_from(role_blocks, 3, heading)
        role = entry(version, "crewRole", slug(heading.text), heading.text, heading.page)
        role["text"] = made["text"]
        role["sections"] = made.get("sections", [])
        names = [s["name"] for s in role["sections"]]
        if not any(n.startswith("Feature:") for n in names) or not any(n.startswith("Pirate Prestige Ability:") for n in names):
            problems.append(f"crew role {heading.text}: sections are {names}")
        proficiency = next((s for s in role["sections"] if s["name"] == "Role Skill Proficiency"), None)
        m = re.search(r"proficiency (?:with|in) (?:the )?(.+?) skills?", proficiency["text"]) if proficiency else None
        skills = skills_in(m.group(1)) if m else None
        if skills:
            role["skills"] = skills
            role["auto"] = ["skills"]
        out.append(role)
    return out


# --- Backgrounds ----------------------------------------------------------------------


def extract_backgrounds(version: str) -> list[dict]:
    first, last = PAGES[version]["backgrounds"]
    blocks = read_blocks(BOOKS[version]["pdf"], first, last)
    (chapter, body), = top_sections(blocks)
    intro, backgrounds = split_sections(body, 2)
    made = sections_from(intro, 3, chapter)
    general = entry(version, "rule", "backgrounds", chapter.text, chapter.page)
    general["text"] = made["text"]
    if "sections" in made:
        general["sections"] = made["sections"]
    out = [general]
    for heading, bg_blocks in backgrounds:
        name = re.sub(r"\s*\*$", "", heading.text)
        own = []
        for block in bg_blocks:
            if isinstance(block, Heading):
                break
            own.append(block)
        defs = {b.lead.rstrip(":.").lower(): b.text[len(b.lead):].strip() for b in own if isinstance(b, Para) and b.lead}
        made = sections_from(bg_blocks, 3, heading)
        bg = entry(version, "background", slug(name), name, heading.page)
        # Marked * in the book: unchanged from the original Player's Handbook.
        bg["unchangedFromPhb"] = heading.text.endswith("*")
        bg["text"] = "\n".join(b.text for b in own if isinstance(b, Para))
        for label, key in (("skill proficiencies", "skillProficiencies"), ("tool proficiencies", "toolProficiencies"), ("languages", "languages"), ("equipment", "equipment")):
            if label in defs:
                bg[key] = defs[label]
        if "skill proficiencies" not in defs or "equipment" not in defs:
            problems.append(f"background {name}: found only {sorted(defs)}")
        skills = skills_in(defs.get("skill proficiencies", ""))
        if skills:
            bg["skills"] = skills
            bg["auto"] = ["skills"]
        bg["sections"] = made.get("sections", [])
        if not any(s["name"].startswith("Feature:") for s in bg["sections"]):
            problems.append(f"background {name}: no Feature section")
        out.append(bg)
    return out


# --- Haki dice ---------------------------------------------------------------------------

WILLPOWER_DICE = re.compile(r"(?:(\d+)d(\d+) \+ )?a number of d(\d+)s equal to (a quarter of |half of )?your Willpower")
WILLPOWER_SHARE = {"a quarter of ": "ceil(willpower / 4)", "half of ": "ceil(willpower / 2)", None: "willpower"}
TEMP_HP = re.compile(r"(\d+d\d+) \+ (half of your Willpower \(rounded up\) \+ )?your character level in temporary hit points")


def haki_rolls(text: str) -> list[dict]:
    """Roll buttons for a Haki feature. Most Haki dice grow with Willpower ("2d10 + a number of d10s
    equal to half of your Willpower (rounded up)"), which the sheet works out when it draws the button."""
    rolls: list[dict] = []
    covered: set[str] = set()
    for m in WILLPOWER_DICE.finditer(text):
        base, base_sides, sides, share = m.groups()
        if base and base_sides != sides:
            continue
        count = f"{base} + {WILLPOWER_SHARE[share]}" if base else WILLPOWER_SHARE[share]
        if base:
            covered.add(f"{base}d{sides}")
        before = text[max(0, m.start() - 90):m.start()]
        named = re.findall(r"\b(force|psychic|weapon)\b", before)
        label = f"{named[-1].capitalize()} damage" if named else "Extra damage"
        if any(r["label"] == label for r in rolls):
            label = f"{label} ({len([r for r in rolls if r['label'].startswith(label)]) + 1})"
        rolls.append({"label": label, "dice": f"{{{count}}}d{sides}", "kind": "damage"})
    for m in TEMP_HP.finditer(text):
        covered.add(m.group(1))
        rolls.append({"label": "Temporary hit points", "dice": f"{m.group(1)} + {{{'ceil(willpower / 2) + level' if m.group(2) else 'level'}}}", "kind": "tempHp"})
    rolls += [r for r in dice_in(text) if r["dice"] not in covered]
    return rolls[:4]


# --- Feats ------------------------------------------------------------------------------


def extract_feats(version: str) -> list[dict]:
    first, last = PAGES[version]["feats"]
    blocks = read_blocks(BOOKS[version]["pdf"], first, last)
    (chapter, body), = top_sections(blocks)
    intro, feats = split_sections(body, 2)
    general = entry(version, "rule", "feats", chapter.text, chapter.page)
    general["text"] = body_text(intro)
    out = [general]
    for heading, feat_blocks in feats:
        made = sections_from(feat_blocks, 3, heading)
        feat = entry(version, "feat", slug(heading.text), heading.text, heading.page)
        feat["text"] = made["text"]
        for key in ("prerequisite", "sections", "tables", "uses", "action", "rolls", "auto"):
            if key in made:
                feat[key] = made[key]
        # A feat's skills are granted outright; the sheet reads them from "skills".
        granted = [e["skill"] for e in made.get("effects", []) if e.get("type") == "proficiency"]
        if granted:
            feat["skills"] = granted
            feat["auto"] = [a for a in feat.get("auto", []) if a != "effects"] + ["skills"]
        apply_feat_structure(version, feat, problems)
        # Armor, weapon and tool proficiencies the feat grants outright (Heavily Armored, Burglar).
        granted = [e for e in proficiencies_granted(feat["text"]) if e not in feat.get("effects", [])]
        if granted:
            feat["effects"] = feat.get("effects", []) + granted
        if len(feat["text"]) < 30:
            problems.append(f"feat {heading.text}: text is only '{feat['text']}'")
        out.append(feat)
    return out


# --- Races ------------------------------------------------------------------------------


def traits_from(blocks: list[Block], who: str) -> tuple[str, list[dict]]:
    """Paragraphs led by a bold name ("Darkvision.") are traits; bullets and plain paragraphs after one belong to it."""
    intro: list[str] = []
    traits: list[dict] = []
    for block in blocks:
        if isinstance(block, Table):
            if traits:
                traits[-1].setdefault("tables", []).append({"rows": table_rows(block), "page": block.page})
            continue
        if not isinstance(block, Para):
            continue
        lead = block.lead
        if lead.endswith(".") and not block.listed and len(lead) <= 60:
            trait = {"name": lead[:-1].strip(), "text": block.text[len(lead):].strip(), "page": block.page}
            granted = skills_granted(trait["text"])
            if granted:
                trait["skills"] = granted
            traits.append(trait)
        elif traits:
            traits[-1]["text"] += "\n" + block.text
        else:
            intro.append(block.text)
    for trait in traits:
        if not trait["text"]:
            problems.append(f"{who}: trait '{trait['name']}' has no text")
    return "\n".join(intro), traits


def split_traits(who: str, traits: list[dict]) -> None:
    for inside, name in RACE_TRAIT_SPLITS.get(who, []):
        at = next((i for i, t in enumerate(traits) if t["name"] == inside and f"\n{name} " in t["text"]), None)
        if at is None:
            problems.append(f"race {who}: '{name}' was not found inside '{inside}'")
            continue
        before, after = traits[at]["text"].split(f"\n{name} ", 1)
        traits[at]["text"] = before
        traits.insert(at + 1, {"name": name, "text": after, "page": traits[at]["page"]})


DESCRIPTIVE_TRAITS = {"age", "alignment", "size", "speed", "ability score increase", "languages", "subrace"}


def structure_trait(version: str, who: str, trait: dict) -> None:
    """Uses, action and dice a trait's wording names, then the numbers entered by hand. Skills stay under "skills"."""
    if trait["name"].lower() in DESCRIPTIVE_TRAITS:
        return
    # A trait's later paragraphs can grant skills too.
    granted = skills_granted(trait["text"])
    if granted:
        trait["skills"] = granted
    derive_structure(trait)
    kept = [e for e in trait.get("effects", []) if not (e.get("type") == "proficiency" and e.get("skill") in trait.get("skills", []))]
    if kept:
        trait["effects"] = kept
    else:
        trait.pop("effects", None)
    if "auto" in trait:
        trait["auto"] = [a for a in trait["auto"] if a != "effects" or kept]
        if not trait["auto"]:
            del trait["auto"]
    apply_race_structure(version, who, trait, problems)


def race_choices(version: str, race: dict) -> dict | None:
    """Splits a trait that is a list to choose from into an option group, and leaves the trait its opening sentence."""
    spec = RACE_CHOICES.get(race["name"])
    trait = next((t for t in race.get("traits", []) if spec and t["name"] in spec["trait"]), None)
    if not trait:
        return None
    opening, *lines = trait["text"].split("\n")
    count = next((expr for start, end, expr in spec["count"] if start in opening and end in opening), None)
    options = []
    for line in lines:
        m = re.match(r"([A-Z][\w’'\- ]{1,40})\. (.+)$", line)
        if not m:
            problems.append(f"race {race['name']} / {trait['name']} ({version}): '{line[:40]}' is not an option")
            return None
        option = {"id": slug(m.group(1)), "name": m.group(1), "text": m.group(2), "page": trait["page"]}
        derive_structure(option)
        needs = re.search(r"This is an upgrade of the (.+?) Feature", option["text"])
        if needs:
            option["requires"] = slug(needs.group(1))
        fields = spec.get("options", {}).get(option["name"])
        if fields and fields["expect"] in option["text"]:
            for key in ("toggle", "rolls"):
                if key in fields:
                    option[key] = fields[key]
            if "effects" in fields:
                option["effects"] = option.get("effects", []) + fields["effects"]
        elif fields:
            problems.append(f"race {race['name']} / {option['name']} ({version}) is worded differently here, so its numbers were not applied")
        options.append(option)
    if not count or not options:
        problems.append(f"race {race['name']} / {trait['name']} ({version}): how many may be chosen was not read")
        return None
    for key in ("uses", "action", "rolls", "effects", "auto"):
        trait.pop(key, None)
    trait["text"] = opening
    trait["choices"] = {"id": spec["id"], "count": count, "from": f"optionGroup.{spec['group']}"}
    group = entry(version, "optionGroup", spec["group"], trait["name"], trait["page"])
    group["parent"] = race["id"]
    group["options"] = options
    return group


def summarize_traits(target: dict, traits: list[dict]) -> None:
    auto = []
    for trait in traits:
        low = trait["name"].lower()
        if low == "speed":
            m = re.search(r"base walking speed is (\d+) feet", trait["text"])
            if m:
                target["speed"] = int(m.group(1))
                auto.append("speed")
        elif low == "size":
            m = re.search(r"\b(?:size (?:is|will count as)|count as) (tiny|small|medium|large|huge)\b", trait["text"], re.I)
            if m:
                target["size"] = m.group(1).capitalize()
                auto.append("size")
        elif low == "ability score increase":
            fixed = {ABILITIES[a.lower()]: int(n) for a, n in re.findall(r"\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score increases by (\d)", trait["text"])}
            points = re.search(r"You have (\d) points to spend on ability scores", trait["text"])
            if re.search(r"ability scores each increase by 1", trait["text"]):
                fixed = {a: 1 for a in ABILITIES.values()}
            if fixed or points:
                target["abilityIncrease"] = {**({"fixed": fixed} if fixed else {}), **({"points": int(points.group(1))} if points else {})}
                auto.append("abilityIncrease")
    if auto:
        target["auto"] = auto


def extract_races(version: str) -> list[dict]:
    first, last = PAGES[version]["races"]
    blocks = read_blocks(BOOKS[version]["pdf"], first, last)
    out = []
    for heading, body in top_sections(blocks):
        name = re.sub(r"\s*\[Optional\]", "", heading.text).strip()
        intro, parts = split_sections(body, 2)
        if not any(h.text.endswith("Traits") for h, _ in parts):
            # "New Races and Updates", "Optional Races": chapter notes, not races.
            note = entry(version, "rule", slug(heading.text), heading.text, heading.page)
            note["text"] = body_text(body)
            out.append(note)
            continue
        race = entry(version, "race", slug(name), name, heading.page)
        race["optional"] = "[Optional]" in heading.text
        race["text"] = body_text(intro)
        sections = []
        subraces = []
        for part, part_blocks in parts:
            if part.text.endswith("Subraces"):
                sub_intro, subs = split_sections(part_blocks, 3)
                if body_text(sub_intro):
                    sections.append({"name": part.text, "text": body_text(sub_intro), "page": part.page})
                for sub, sub_blocks in subs:
                    sub_name = re.sub(r"\s+Traits$", "", sub.text)
                    sub_name = re.sub(rf"^{re.escape(name)},\s*", "", sub_name)
                    sub_text, sub_traits = traits_from(sub_blocks, f"{name} / {sub_name}")
                    subrace = entry(version, "subrace", f"{slug(name)}.{slug(sub_name)}", sub_name, sub.page)
                    subrace["parent"] = race["id"]
                    subrace["text"] = sub_text
                    subrace["traits"] = sub_traits
                    split_traits(f"{name} / {sub_name}", sub_traits)
                    for trait in sub_traits:
                        structure_trait(version, f"{name} / {sub_name}", trait)
                    summarize_traits(subrace, sub_traits)
                    if not sub_traits:
                        problems.append(f"subrace {name} / {sub_name}: no traits")
                    subraces.append(subrace)
            elif part.text.endswith("Traits"):
                text, traits = traits_from(part_blocks, name)
                race["traits"] = traits
                for trait in traits:
                    structure_trait(version, name, trait)
                if text:
                    race["text"] = (race["text"] + "\n" + text).strip()
                summarize_traits(race, traits)
            else:
                made = sections_from(part_blocks, 3, part)
                sections.append({"name": part.text, "text": made["text"], "page": part.page, **({"tables": made["tables"]} if "tables" in made else {})})
                sections.extend(made.get("sections", []))
        if sections:
            race["sections"] = sections
        if not race.get("traits"):
            problems.append(f"race {name}: no traits")
        if "speed" not in race and not all("speed" in s for s in subraces):
            problems.append(f"race {name}: no walking speed found")
        group = race_choices(version, race)
        out.append(race)
        out.extend(subraces)
        if group:
            out.append(group)
    return out


# --- Spell lists and custom spells ---------------------------------------------------------

SPELL_COLUMNS = [81, 273, 466, 658]
LEVEL_NAMES = {"cantrips (0 level)": 0, **{f"{n}{'st' if n == 1 else 'nd' if n == 2 else 'rd' if n == 3 else 'th'} level": n for n in range(1, 10)}}


def extract_spell_lists(version: str) -> list[dict]:
    """Each class's spell list: four narrow columns of names under level headings, read down each column in turn."""
    first, last = PAGES[version]["spell_lists"]
    items = [i for i in load_items(BOOKS[version]["pdf"], first, last) if not is_footer(i)]
    out = []
    current = None
    for page in range(first, last + 1):
        column = lambda i: min(range(4), key=lambda c: abs(SPELL_COLUMNS[c] - i.left))
        on_page = sorted((i for i in items if i.page == page), key=lambda i: (column(i), i.top, i.left))
        title = " ".join(i.text.strip() for i in sorted((i for i in on_page if i.family.startswith("MrEaves") and i.size == 24), key=lambda i: i.top))
        if title:
            name = re.sub(r"\s+", " ", title)
            current = entry(version, "spellList", slug(name.replace(" Spells", "")), name, page)
            current["levels"] = {}
            out.append(current)
        if current is None:
            continue
        level = None
        for item in on_page:
            if item.family == "MyFont":
                level = LEVEL_NAMES.get(item.text.strip().lower())
                if level is None:
                    problems.append(f"spell list p{page}: unknown level heading '{item.text}'")
            elif item.family.startswith("ScalySans") and item.top > 150 and level is not None:
                names = current["levels"].setdefault(str(level), [])
                # "(ritual)" pushed onto its own line belongs to the name above it.
                # … and so does the end of a name too long for its column ("Protection from Evil and" / "Good").
                if names and (item.text.strip().startswith("(") or re.search(r" (?:and|or|of|from|the|to|with)$", names[-1])):
                    names[-1] = f"{names[-1]} {item.text.strip()}"
                else:
                    names.append(item.text.strip())
    for item in out:
        if not item["levels"]:
            problems.append(f"{item['name']}: no spells found")
        item["text"] = f"{sum(len(v) for v in item['levels'].values())} spells, by level."
    return out


def extract_custom_spells(version: str) -> list[dict]:
    first, last = PAGES[version]["custom_spells"]
    blocks = read_blocks(BOOKS[version]["pdf"], first, last)
    (chapter, body), = top_sections(blocks)
    intro, spells = split_sections(body, 2)
    general = entry(version, "rule", "custom_spells", chapter.text, chapter.page)
    general["text"] = body_text(intro)
    out = [general]
    for heading, spell_blocks in spells:
        paras = [b for b in spell_blocks if isinstance(b, Para)]
        spell = entry(version, "spell", slug(heading.text), heading.text, heading.page)
        m = re.match(r"(\d)(?:st|nd|rd|th)[- ]level (\w+)|(\w+) cantrip", paras[0].text, re.I) if paras else None
        if m:
            spell["level"] = int(m.group(1)) if m.group(1) else 0
            spell["school"] = (m.group(2) or m.group(3)).lower()
            paras = paras[1:]
        else:
            problems.append(f"spell {heading.text}: no level line")
        rest = []
        for para in paras:
            lead = re.match(r"(Casting Time|Range|Components|Duration):\s*(.+)", para.text)
            if lead and not rest:
                spell[{"Casting Time": "castingTime", "Range": "range", "Components": "components", "Duration": "duration"}[lead.group(1)]] = lead.group(2)
            else:
                rest.append(para.text)
        spell["text"] = "\n".join(rest)
        tables = [{"rows": table_rows(b), "page": b.page} for b in spell_blocks if isinstance(b, Table)]
        if tables:
            spell["tables"] = tables
        if len(spell["text"]) < 40 or "castingTime" not in spell:
            problems.append(f"spell {heading.text}: incomplete")
        out.append(spell)
    return out


# --- Spirit Surges and Haki ---------------------------------------------------------------

SURGE_KINDS = {"standard": ("surgeAdvancement", None), "armament": ("hakiFeature", "armament"), "observation": ("hakiFeature", "observation"), "king": ("hakiFeature", "supremeKing")}
RARITIES = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"]


def extract_surges(version: str) -> list[dict]:
    out = []
    for first, last in PAGES[version]["surges"]:
        blocks = read_blocks(BOOKS[version]["pdf"], first, last)
        for heading, body in top_sections(blocks):
            intro, options = split_sections(body, 2)
            typed = [(h, b) for h, b in options if any(isinstance(x, Para) and re.search(r"Advancement,", x.text) for x in b[:1])]
            if not typed:
                made = sections_from(body, 2, heading)
                rule = entry(version, "rule", slug(heading.text), heading.text, heading.page)
                rule["text"] = made["text"]
                for key in ("sections", "tables"):
                    if key in made:
                        rule[key] = made[key]
                out.append(rule)
                continue
            made = sections_from(intro, 3, heading)
            group = entry(version, "rule", slug(heading.text), heading.text, heading.page)
            group["text"] = made["text"]
            if "sections" in made:
                group["sections"] = made["sections"]
            out.append(group)
            for option, option_blocks in options:
                type_line = next((b for b in option_blocks if isinstance(b, Para)), None)
                m = re.match(r"(.+?) Advancement, (.+)$", type_line.text) if type_line else None
                if not m:
                    problems.append(f"surge {option.text} (p{option.page}): no type line")
                    continue
                # The section says which family it is; "Amateur Haki Advancement" entries sit inside their Color's section.
                family = next((k for k in SURGE_KINDS if k in heading.text.lower()), None)
                if family is None or "devil fruit" in type_line.text.lower() or "devil fruit" in heading.text.lower():
                    # Devil Fruit advancements are secret and must never reach the public data.
                    raise SystemExit(f"Refusing to extract '{option.text}' (p{option.page}): '{type_line.text}' under '{heading.text}' is not a public advancement")
                kind, color = SURGE_KINDS[family]
                made = sections_from([b for b in option_blocks if b is not type_line], 3, option)
                item = entry(version, kind, slug(option.text), option.text, option.page)
                rarity = next((r for r in sorted(RARITIES, key=len, reverse=True) if m.group(2).lower().startswith(r.lower())), None)
                tier = re.search(r"Tier (\d)", m.group(2))
                item["typeLine"] = type_line.text
                if color:
                    item["color"] = color
                if rarity:
                    item["rarity"] = rarity
                else:
                    problems.append(f"surge {option.text}: rarity not read from '{m.group(2)}'")
                if tier:
                    item["tier"] = int(tier.group(1))
                if "amateur" in m.group(1).lower():
                    item["amateur"] = True  # doesn't count toward Haki tiers (p221)
                item["repeatable"] = bool(re.search(r"can be chosen multiple times", made["text"]))
                item["text"] = made["text"]
                for key in ("prerequisite", "sections", "tables", "uses", "action", "effects", "auto"):
                    if key in made:
                        item[key] = made[key]
                if kind == "hakiFeature":
                    rolls = haki_rolls(made["text"])
                    if rolls:
                        item["rolls"] = rolls
                    item["auto"] = [a for a in item.get("auto", []) if a != "rolls"] + (["rolls"] if rolls else [])
                    if not item["auto"]:
                        del item["auto"]
                    upgrade = re.search(r"Upgrades to (.+?) when you reach character level 5", made["text"])
                    if upgrade:
                        item["upgradesTo"] = f"hakiFeature.{slug(upgrade.group(1))}"
                    apply_haki_structure(version, item, problems)
                out.append(item)
    # A Haki prerequisite is a list of other features' names; whatever follows the last name is the
    # feature's opening line, run on from the line above.
    names = sorted({e["name"] for e in out if e["kind"] != "rule"} | {"Qualities of a King"}, key=len, reverse=True)
    for item in out:
        rest = item.get("prerequisite", "")
        consumed = 0
        while True:
            name = next((n for n in names if rest[consumed:].startswith(n)), None)
            if not name:
                break
            consumed += len(name)
            if rest[consumed:consumed + 2] == ", ":
                consumed += 2
            else:
                break
        if 0 < consumed < len(rest) and rest[consumed] == " ":
            item["prerequisite"] = rest[:consumed]
            item["text"] = rest[consumed + 1:] + "\n" + item["text"]
    return out


# --- Devil Fruit rules for players, and the armory -------------------------------------------


def extract_sections_as_rules(version: str, key: str, prefix: str = "") -> list[dict]:
    """Every top-level heading in the page ranges becomes a rules entry, smaller headings its sections."""
    out = []
    ranges = PAGES[version][key]
    for first, last in ranges if isinstance(ranges, list) else [ranges]:
        blocks = read_blocks(BOOKS[version]["pdf"], first, last)
        for heading, body in top_sections(blocks):
            made = sections_from(body, 2, heading)
            name = re.sub(r"\s*\(\s*฿?\s*\)", "", heading.text).strip()
            rule = entry(version, "rule", prefix + slug(name), name, heading.page)
            rule["text"] = made["text"]
            for field in ("sections", "tables"):
                if field in made:
                    rule[field] = made[field]
            out.append(rule)
    return out


def extract_fruit_rules(version: str) -> list[dict]:
    return extract_sections_as_rules(version, "fruit_rules")


def money(text: str) -> int | None:
    m = re.search(r"฿\s*([\d,]+)", text)
    return int(m.group(1).replace(",", "")) if m else None


def extract_armory(version: str) -> list[dict]:
    rules = extract_sections_as_rules(version, "armory", "armory_")
    first, last = PAGES[version]["armory"]
    blocks = read_blocks(BOOKS[version]["pdf"], first, first + 5)
    tables = [b for b in blocks if isinstance(b, Table)]
    items: list[dict] = []
    # What each armor is, from the bullet under its category ("Dense Coat. Durable fabrics …").
    blurbs = {b.lead.rstrip(".").lower(): b.text[len(b.lead):].strip() for b in blocks if isinstance(b, Para) and b.listed and b.lead.endswith(".")}

    for table in tables:
        rows = table.merged()
        header = [c.lower() for c in rows[0]] if rows else []
        if header[:2] == ["armor", "cost"]:
            category = None
            for row in rows[1:]:
                if len(row) == 1:
                    category = row[0].replace(" Armor", "").lower()
                    continue
                if len(row) < 6:
                    problems.append(f"armor row {row}")
                    continue
                name, cost, ac, strength, stealth, weight = row[:6]
                item = entry(version, "item", slug(name) if category != "shield" else "shield", name, table.page)
                item["itemType"] = "shield" if category == "shield" else "armor"
                item["category"] = category
                item["cost"] = money(cost)
                base = re.match(r"\+?(\d+)", ac)
                item["ac"] = {"base": int(base.group(1)), "dex": "max2" if "max 2" in ac else "full" if "Dex" in ac else "none"} if category != "shield" else {"bonus": int(base.group(1))}
                need = re.search(r"Str (\d+)", strength)
                if need:
                    item["strength"] = int(need.group(1))
                item["stealthDisadvantage"] = stealth.lower().startswith("disadv")
                item["weight"] = weight
                item["text"] = blurbs.get(name.lower(), f"{name}: AC {ac}.")
                items.append(item)
        elif header[:3] == ["weapon", "cost", "damage"]:
            group = None
            for row in rows[1:]:
                if len(row) == 1:
                    group = row[0].lower()
                    continue
                if group is None or len(row) < 3:
                    continue
                cells = row + [""] * (5 - len(row))
                name, cost, damage = cells[0], cells[1], cells[2]
                # A missing weight leaves the properties one cell early.
                weight, properties = (cells[3], cells[4]) if re.search(r"lb\.?$|^-$", cells[3]) or not cells[3] else ("-", cells[3])
                m = re.match(r"(\+?\d*d?\d+) (\w+)", damage)
                if not m and damage.strip() not in ("-", "—"):
                    problems.append(f"weapon {name}: damage '{damage}'")
                    continue
                item = entry(version, "item", slug(name), name, table.page)
                item["itemType"] = "weapon"
                item["category"] = "simple" if group.startswith("simple") else "martial"
                item["ranged"] = "ranged" in group
                item["cost"] = money(cost)
                if m:
                    item["damage"] = m.group(1)
                    item["damageType"] = m.group(2)
                item["weight"] = weight
                item["properties"] = "" if properties.strip() in ("-", "—") else properties
                low = properties.lower()
                for flag, word in (("finesse", "finesse"), ("twoHanded", "two-handed"), ("light", "light"), ("heavy", "heavy"), ("reach", "reach"), ("thrown", "thrown")):
                    if re.search(rf"\b{word}\b", low):
                        item[flag] = True
                versatile = re.search(r"versatile \((\d+d\d+)\)", low)
                if versatile:
                    item["versatile"] = versatile.group(1)
                item["text"] = f"{name}: {damage}." + (f" {properties}." if item["properties"] else "")
                items.append(item)
    if not any(i["itemType"] == "armor" for i in items) or sum(i["itemType"] == "weapon" for i in items) < 40:
        problems.append(f"armory {version}: read {sum(i['itemType'] == 'armor' for i in items)} armors and {sum(i['itemType'] == 'weapon' for i in items)} weapons")
    return rules + items


def write(version: str, name: str, entries: list[dict]) -> None:
    ids = [e["id"] for e in entries]
    for dup in {i for i in ids if ids.count(i) > 1}:
        problems.append(f"{name}: id {dup} appears twice")
    data = {
        "$schemaVersion": 1,
        "entries": entries,
        "$note": f"Extracted from {BOOKS[version]['book']} (PDF page = printed page) by tools/extract/extract_chapters.py. Text is word for word; fields listed under \"auto\" were recognised from the wording.",
    }
    (ROOT / "data" / "rules" / version / f"{name}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    kinds: dict[str, int] = {}
    for e in entries:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"{name}: {kinds}")


CHAPTER_FILES = {
    "general_rules": lambda version: extract_rules(version) + extract_openings(version),
    "crew_roles": extract_crew_roles,
    "backgrounds": extract_backgrounds,
    "feats": extract_feats,
    "races": extract_races,
    "spell_lists": lambda version: extract_spell_lists(version) + extract_custom_spells(version),
    "spirit_surges": extract_surges,
    "devil_fruit_rules": extract_fruit_rules,
    "armory": extract_armory,
}


def main() -> int:
    version = "dndf-8.8" if "--v88" in sys.argv else "dndf-10"
    for name, extract in CHAPTER_FILES.items():
        write(version, name, extract(version))
    if problems:
        print(f"\n{len(problems)} thing(s) to check:")
        for p in problems:
            print("  -", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
