"""SRD 5.1 conditions (Appendix PH-A), read from the official document.

    python3 tools/extract/extract_srd_conditions.py            # writes data/rules/dndf-10/srd_conditions.json
    python3 tools/extract/extract_srd_conditions.py --check    # reports only

The DnDF handbooks use the 5th Edition conditions without reprinting them. The System Reference Document
5.1 is published by Wizards of the Coast under CC-BY-4.0, so its text may be shown with attribution.
Every word written comes from ~/dndf/sources/srd/SRD_CC_v5.1.pdf.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_srd import ATTRIBUTION, BOOK, PDF, ROOT, SRD, tidy  # noqa: E402

CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed",
              "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"]
FOOTER = re.compile(r"^(System Reference Document 5\.1|\d{1,3})$")


def page_lines(page: int) -> list[str]:
    raw = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), str(SRD / PDF), "-"], capture_output=True, text=True, check=True).stdout
    # The document's text layer puts a tab, a line break and a no-break space between the words of one
    # line; a real line ends with a plain line break. Joined here, or every word would be a line of its own
    # (and a lone "5" would be taken for a page number).
    raw = re.sub(r"\t[ \xa0]*\n[ \xa0]*", " ", raw).replace("\x0c", "\n")
    return [re.sub(r"\s+", " ", tidy(line)).strip() for line in raw.split("\n")]


def first_page() -> int:
    """The page the appendix starts on, found by its heading rather than assumed."""
    for page in range(300, 403):
        text = " ".join(page_lines(page))
        if "Appendix PH-A: Conditions" in text or ("Appendix PH-A:" in text and "Conditions alter a creature" in text):
            return page
    raise SystemExit("Could not find Appendix PH-A: Conditions in the SRD.")


def read() -> tuple[list[dict], int]:
    start = first_page()
    conditions: dict[str, dict] = {}
    current: dict | None = None
    in_sidebar = False
    for page in (start, start + 1):
        for line in page_lines(page):
            if not line or FOOTER.match(line):
                continue
            if line in CONDITIONS:
                in_sidebar = False
                # A heading seen again is the same condition going on (it never is, but a bullet may run over a page).
                current = conditions.setdefault(line, {"name": line, "bullets": [], "page": page})
                continue
            if line == "Exhaustion":
                # The sidebar on exhaustion sits between two conditions; it is a table, kept out of their text.
                in_sidebar = True
                continue
            if in_sidebar or current is None:
                continue
            if line.startswith("•"):
                current["bullets"].append(line.lstrip("• ").strip())
            elif current["bullets"]:
                current["bullets"][-1] += " " + line
    out = []
    for name in CONDITIONS:
        c = conditions.get(name)
        if not c or not c["bullets"]:
            raise SystemExit(f"Condition not found or empty: {name}")
        out.append({"name": name, "text": "\n".join(f"• {b}" for b in c["bullets"]), "page": c["page"]})
    return out, start


def bullets_counted_another_way(start: int) -> int:
    """Every bullet mark on the two pages, without regard to headings: a check on the reader above."""
    return sum(line.count("•") for page in (start, start + 1) for line in page_lines(page))


def main() -> int:
    sections, start = read()
    total = sum(s["text"].count("• ") for s in sections)
    other = bullets_counted_another_way(start)
    # A second check on the words themselves: each condition's text must be found, letter for letter, in the
    # page text squeezed of everything but letters and digits, and must carry no page furniture.
    squeezed = "".join(re.sub(r"[^a-z0-9]", "", line.lower()) for page in (start, start + 1) for line in page_lines(page))
    for s in sections:
        for bullet in s["text"].split("\n"):
            if re.sub(r"[^a-z0-9]", "", bullet.lower()) not in squeezed:
                raise SystemExit(f"{s['name']}: a bullet is not in the page as read: {bullet[:70]}")
        if "System Reference Document" in s["text"]:
            raise SystemExit(f"{s['name']}: the page footer got into the text")
        print(f"Conditions: {len(sections)} on SRD pages {start}-{start + 1}; {total} bullets read, {other} bullet marks on the pages.")
    for s in sections:
        print(f"  {s['name']:14} p.{s['page']}  {s['text'].count('• ')} bullets, {len(s['text'])} characters")
    if total != other:
        raise SystemExit("The bullets read do not match the bullet marks on the pages.")
    entry = {
        "id": "rule.srd_conditions", "kind": "rule", "name": "Conditions", "versions": ["dndf-8.8", "dndf-10"],
        "source": {"book": BOOK, "page": start},
        "text": "Conditions alter a creature’s capabilities in a variety of ways. The handbooks use the 5th Edition conditions; these are their definitions from the System Reference Document 5.1.",
        "sections": sections,
    }
    if "--check" in sys.argv:
        return 0
    target = ROOT / "data" / "rules" / "dndf-10" / "srd_conditions.json"
    note = ATTRIBUTION + " Read from the official SRD_CC_v5.1.pdf by tools/extract/extract_srd_conditions.py; page numbers are that document's."
    target.write_text(json.dumps({"$schemaVersion": 1, "$note": note, "entries": [entry]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
