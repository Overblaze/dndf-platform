#!/usr/bin/env python3
"""Extracts everything public from both handbooks and writes data/rules/.

    python3 tools/extract/extract_all.py

v10 is written to data/rules/dndf-10/. v8.8 is then extracted and compared entry by entry:
- an entry that is identical in both books (same text, levels and tables, on the same pages or
  all shifted by the same number of pages) is stored once, in the v10 file, tagged with both
  versions and carrying the v8.8 book and first page under "sources";
- an entry that differs in any way, or exists only in v8.8, is written to data/rules/dndf-8.8/.

The hand-verified Bruiser file is never overwritten; its entries are tagged for v8.8 when a fresh
extraction of the v10 Bruiser matches the v8.8 one.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import extract_chapters as chapters  # noqa: E402
import extract_classes as classes  # noqa: E402

ROOT = classes.ROOT
V10, V88 = "dndf-10", "dndf-8.8"
PILOT = "bruiser"


def printed(entry: dict) -> dict:
    """What the book prints, without the bookkeeping that names the version. Pages are taken
    relative to the entry's first page, so a class that simply starts five pages later in the
    other book still counts as the same."""
    start = entry["source"]["page"]

    def relative(value):
        if isinstance(value, dict):
            return {k: (v - start if k == "page" and isinstance(v, int) else relative(v)) for k, v in value.items()}
        if isinstance(value, list):
            return [relative(v) for v in value]
        return value

    return relative({k: v for k, v in entry.items() if k not in ("versions", "source", "sources")})


# Hand-entered structure on the pilot (v10 Bruiser) is reused for a v8.8 feature only when the
# two books print the same text for it, plus these, read and judged to work the same:
#   Scrapper: v8.8 lists the bruiser weapons without kanabos; the die and bonus attack are unchanged.
SAME_MECHANICS = {("class.bruiser", "Scrapper")}
STRUCTURE = ("effects", "toggle", "uses", "action", "rolls", "onUse", "counter", "choices", "cost", "asi", "grantsSubclass")


def inherit_structure(old: dict, pilot: dict, fresh: dict) -> int:
    """Copies hand-entered fields from the pilot entry onto the matching v8.8 features. Returns how many."""
    pilot_features = {f["name"].replace("'", "’"): f for f in pilot.get("features", [])}
    fresh_features = {f["name"]: f for f in fresh.get("features", [])}
    copied = 0
    for feature in old.get("features", []):
        hand, twin = pilot_features.get(feature["name"]), fresh_features.get(feature["name"])
        if not hand or not twin:
            continue
        same = twin["text"] == feature["text"] and twin.get("sections") == feature.get("sections") and twin["level"] == feature["level"]
        if not same and (old["id"], feature["name"]) not in SAME_MECHANICS:
            continue
        for key in STRUCTURE:
            if key in hand:
                feature[key] = hand[key]
            elif key in feature and key in ("uses", "action"):
                del feature[key]
        feature.pop("auto", None)
        copied += 1
    # Pools and formulas belong to the class table and the features above; reuse them when the tables match.
    if old.get("progression") == fresh.get("progression"):
        for key in ("resources", "formulas", "startingEquipment"):
            if key in pilot:
                old[key] = pilot[key]
        # The pilot names the Scrapper column scrapperDie, with values like "d6".
        if "progression" in pilot:
            old["progression"] = pilot["progression"]
    return copied


def extract(version: str) -> dict[str, list[dict]]:
    files: dict[str, list[dict]] = {}
    for key in classes.CLASSES[version]:
        files[key] = classes.extract_class(version, key)["entries"]
    for name, fn in chapters.CHAPTER_FILES.items():
        files[name] = fn(version)
    return files


def note(version: str, script: str) -> str:
    return (f"Extracted from {classes.BOOKS[version]['book']} (PDF page = printed page) by tools/extract/{script}. "
            "Text is word for word; fields listed under \"auto\" were recognised from the wording.")


# A v10 feature whose text box runs off the page in the v10 PDF, finished from the v8.8 handbook, which
# prints it whole (Matt's ruling). Only done while the v10 text is still the opening of the v8.8 text.
COMPLETED_FROM_V88 = [("hybrid", "class.hybrid", "Power Immunity")]


def complete_from_v88(new: dict, old: dict) -> list[str]:
    said: list[str] = []
    squash = lambda text: " ".join(text.split())
    for name, entry_id, feature_name in COMPLETED_FROM_V88:
        find = lambda files: next((f, e) for e in files[name] if e["id"] == entry_id for f in e["features"] if f["name"] == feature_name)
        (cut, _), (whole, source) = find(new), find(old)
        if squash(cut["text"]) == squash(whole["text"]):
            continue  # the v10 book has been corrected: nothing to do
        if not squash(whole["text"]).startswith(squash(cut["text"])):
            said.append(f"{entry_id} '{feature_name}': the v10 text is no longer the opening of the v8.8 text, so it was not completed")
            continue
        cut["text"] = whole["text"]
        cut["completedFrom"] = {"book": source["source"]["book"], "page": whole["page"]}
        for field in ("uses", "action", "auto"):
            if field in whole:
                cut[field] = whole[field]
    return said


def main() -> int:
    new, old = extract(V10), extract(V88)
    classes.problems.extend(complete_from_v88(new, old))
    shared = only_old = changed = 0
    for directory in (ROOT / "data" / "rules" / V88,):
        directory.mkdir(parents=True, exist_ok=True)
        for stale in directory.glob("*.json"):
            stale.unlink()

    old_by_id = {e["id"]: e for entries in old.values() for e in entries}
    same_ids: set[str] = set()
    for entries in new.values():
        for e in entries:
            twin = old_by_id.get(e["id"])
            if twin and printed(twin) == printed(e):
                same_ids.add(e["id"])

    # v10 files: fresh extraction, except the hand-verified Bruiser, which is only re-tagged.
    for name, entries in new.items():
        path = ROOT / "data" / "rules" / V10 / f"{name}.json"
        if name == PILOT:
            data = json.loads(path.read_text())
            entries = data["entries"]
            fresh_ids = {e["id"] for e in new[name]}
            follows = {e["id"]: e["id"] for e in entries if e["id"] in fresh_ids}
            # The Fury option list exists only in the pilot; in the fresh extractions it is the Fury
            # feature's sub-sections. It is shared when those match.
            fury = lambda es: next((f for e in es if e["id"] == "class.bruiser" for f in e["features"] if f["name"] == "Fury"), {})
            fury_same = {k: v for k, v in fury(new[name]).items() if k != "page"} == {k: v for k, v in fury(old[name]).items() if k != "page"}
            pilot_by_id = {e["id"]: e for e in entries}
            fresh_by_id = {e["id"]: e for e in new[name]}
            for e in old[name]:
                if e["id"] not in same_ids and e["id"] in pilot_by_id:
                    inherited = inherit_structure(e, pilot_by_id[e["id"]], fresh_by_id[e["id"]])
                    print(f"v8.8 {e['id']}: {inherited} of {len(e['features'])} features reuse the v10 hand-entered structure")
        else:
            script = "extract_classes.py" if name in classes.CLASSES[V10] else "extract_chapters.py"
            data = {"$schemaVersion": 1, "entries": entries, "$note": note(V10, script)}
            follows = {e["id"]: e["id"] for e in entries}
        for e in entries:
            if name == PILOT and e["id"] not in follows:
                e["versions"] = [V88, V10] if fury_same else [V10]
                if fury_same:
                    e["sources"] = {V88: {"book": classes.BOOKS[V88]["book"], "page": e["source"]["page"]}}
                    shared += 1
                continue
            twin = old_by_id.get(follows[e["id"]])
            if follows[e["id"]] in same_ids and twin:
                e["versions"] = [V88, V10]
                # The v8.8 citation. Pages inside the entry shift by the same amount as its first page.
                e["sources"] = {V88: dict(twin["source"])}
                shared += 1
            else:
                e["versions"] = [V10]
                e.pop("sources", None)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    # v8.8 files: only what differs from v10 or isn't in it.
    new_ids = {e["id"] for entries in new.values() for e in entries}
    for name, entries in old.items():
        keep = [e for e in entries if e["id"] not in same_ids]
        changed += sum(1 for e in keep if e["id"] in new_ids)
        only_old += sum(1 for e in keep if e["id"] not in new_ids)
        if not keep:
            continue
        script = "extract_classes.py" if name in classes.CLASSES[V88] else "extract_chapters.py"
        data = {"$schemaVersion": 1, "entries": keep, "$note": note(V88, script)}
        (ROOT / "data" / "rules" / V88 / f"{name}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    total_new = sum(len(v) for v in new.values())
    total_old = sum(len(v) for v in old.values())
    print(f"v10: {total_new} entries extracted. v8.8: {total_old} entries extracted.")
    print(f"Identical in both, stored once: {shared}. In both but different: {changed}. Only in v8.8: {only_old}. Only in v10: {total_new - len(same_ids) - changed}.")
    from structure import unused_subclass_structure
    classes.problems.extend(f"subclass structure never applied: {u}" for u in unused_subclass_structure())
    for label, items in (("level(s) inferred from position", classes.notes), ("thing(s) to check", classes.problems + chapters.problems)):
        if items:
            print(f"\n{len(items)} {label}:")
            for item in items:
                print("  -", item)
    return 0


if __name__ == "__main__":
    sys.exit(main())
