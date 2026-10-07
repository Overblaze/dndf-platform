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
from extract_classes import ABILITIES, BOOKS, ROOT, body_text, make_feature, slug, split_sections, table_rows  # noqa: E402
from pdfdoc import Block, Heading, Para, Table, read_blocks  # noqa: E402

# Page ranges in the v10 handbook.
PAGES = {
    "dndf-10": {
        "rules": [(9, 12), (18, 19), (66, 66)],
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
        paras = [b for b in feat_blocks if isinstance(b, Para)]
        prerequisite = None
        if paras and re.match(r"prerequisites?:", paras[0].text, re.I):
            prerequisite = re.sub(r"^prerequisites?:\s*", "", paras[0].text, flags=re.I)
            feat_blocks = [b for b in feat_blocks if b is not paras[0]]
            # A prerequisite line that fills the column runs into the feat's text: part them at the first sentence.
            run_on = re.match(r"(.*?)\s+((?:You|Your|When|While|Once|As|Through|Whenever|If|Always)\b.*)", prerequisite)
            if run_on and not any(isinstance(b, Para) for b in feat_blocks):
                prerequisite = run_on.group(1)
                feat_blocks = [Para(run_on.group(2), paras[0].page)] + feat_blocks
        made = sections_from(feat_blocks, 3, heading)
        feat = entry(version, "feat", slug(heading.text), heading.text, heading.page)
        if prerequisite:
            feat["prerequisite"] = prerequisite
        feat["text"] = made["text"]
        for key in ("sections", "tables", "uses", "action", "auto"):
            if key in made:
                feat[key] = made[key]
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
            traits.append({"name": lead[:-1].strip(), "text": block.text[len(lead):].strip(), "page": block.page})
        elif traits:
            traits[-1]["text"] += "\n" + block.text
        else:
            intro.append(block.text)
    for trait in traits:
        if not trait["text"]:
            problems.append(f"{who}: trait '{trait['name']}' has no text")
    return "\n".join(intro), traits


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
                    summarize_traits(subrace, sub_traits)
                    if not sub_traits:
                        problems.append(f"subrace {name} / {sub_name}: no traits")
                    subraces.append(subrace)
            elif part.text.endswith("Traits"):
                text, traits = traits_from(part_blocks, name)
                race["traits"] = traits
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
        out.append(race)
        out.extend(subraces)
    return out


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


def main() -> int:
    version = "dndf-10"
    write(version, "general_rules", extract_rules(version))
    write(version, "crew_roles", extract_crew_roles(version))
    write(version, "backgrounds", extract_backgrounds(version))
    write(version, "feats", extract_feats(version))
    write(version, "races", extract_races(version))
    if problems:
        print(f"\n{len(problems)} thing(s) to check:")
        for p in problems:
            print("  -", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
