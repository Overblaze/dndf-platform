"""Hand-entered structure for classes: the numbers a class adds to the sheet.

The extractor copies book text; it can't know that "your AC equals 10 + your Dexterity modifier +
your Wisdom modifier" is an AC formula. Those facts are written here, once, by a person who read
the feature, and are applied after extraction, in every rules version that has the class.

Each feature patch carries `expect`: a few words of the feature's own text. If a version words the
feature differently, the patch is not applied there and the extractor reports it, so a changed
rule never silently inherits numbers that were written for the other version.
"""

SPIRIT_CASTER = {
    "entry": {
        "formulas": {
            "spiritDC": {"label": "Spirit save DC", "expr": "8 + prof + mod.cha"},
            "spiritAttack": {"label": "Spirit attack modifier", "expr": "prof + mod.cha"},
        },
        # "You can hold up to three floating chords at a time."
        "trackers": [{"id": "chords", "name": "Floating Chords", "min": 0, "max": 3}],
    },
    "features": {
        "Jack of All Trades": {"expect": "add half your Proficiency Bonus, rounded down", "effects": [{"type": "halfProficiency"}]},
        "Song of the Sea": {
            "expect": "regains an extra 1d6 Hit Points",
            "rolls": [{"label": "Extra hit points", "dice": "{level>=17 ? '1d12' : level>=13 ? '1d10' : level>=9 ? '1d8' : '1d6'}", "kind": "heal"}],
        },
    },
}

HYBRID = {
    "entry": {
        "formulas": {
            "hybridDC": {"label": "Hybrid save DC", "expr": "8 + prof + mod.cha"},
            "hybridAttack": {"label": "Hybrid attack modifier", "expr": "prof + mod.cha"},
        },
        # Gained by hitting, held up to the Power Threshold maximum, back to 0 on a long rest.
        "trackers": [{"id": "hybrid_points", "name": "Hybrid Points", "min": 0, "max": "col.powerThresholdMaximum", "reset": "long"}],
    },
    "features": {
        "Close Quarters Training": {
            "expect": "unarmed strikes deal 1d8 bludgeoning damage and you can use Dexterity or Strength",
            "effects": [{"type": "unarmedDie", "expr": "'1d8'", "weapons": "unarmedOnly", "finesse": True}],
        },
        "Power Threshold": {
            "expect": "+1 bonus to your AC for every 5 points",
            "effects": [
                {"type": "damage", "expr": "floor(tracker.hybrid_points / 2)", "when": "melee"},
                {"type": "ac", "expr": "floor(tracker.hybrid_points / 5)"},
                {"type": "attack", "expr": "floor(tracker.hybrid_points / 3)", "when": "melee"},
            ],
        },
        "Energy Transfer": {
            "expect": "takes 1d4 force damage. When you use this feature, you gain 2 Hybrid Points",
            "action": "action",
            "rolls": [{"label": "Force damage", "dice": "1d4", "kind": "damage"}],
            "onUse": [{"type": "addTracker", "tracker": "hybrid_points", "value": 2}],
        },
        "Absorb Power": {
            "expect": "take half of the damage from the spell and gain 1 Hybrid Point",
            "action": "reaction",
            "onUse": [{"type": "addTracker", "tracker": "hybrid_points", "value": 1}],
        },
        "Defensive Augment": {"expect": "expend 2 Hybrid Points to gain a +1 bonus to AC", "action": "bonus", "cost": {"hybrid_points": 2}},
    },
}

MARTIAL_ARTIST = {
    "entry": {"formulas": {"kiDC": {"label": "Ki save DC", "expr": "8 + prof + mod.wis"}}},
    "features": {
        "Unarmored Defense": {
            "expect": "your AC equals 10 + your Dexterity modifier + your Wisdom modifier",
            "effects": [{"type": "acFormula", "expr": "10 + mod.dex + mod.wis", "when": "noArmor && noShield"}],
        },
        "Martial Arts": {
            "expect": "You can use Dexterity instead of Strength for the Attack and Damage Rolls",
            "effects": [{"type": "unarmedDie", "expr": "col.martialArtsDie", "weapons": "martialArtist", "finesse": True, "when": "noArmor && noShield"}],
        },
        "Unarmored Movement": {
            "expect": "your speed increases by 10 feet while you are not wearing armor or wielding a Shield",
            "effects": [{"type": "speed", "expr": "col.unarmoredMovement", "when": "noArmor && noShield"}],
        },
        "Deflect Projectile": {
            "expect": "reduced by 1d10 + your Dexterity modifier + your martial artist level",
            "action": "reaction",
            "rolls": [
                {"label": "Damage reduced", "dice": "1d10 + {mod.dex + level}", "kind": "other"},
                {"label": "Redirected attack (1 ki)", "dice": "{col.martialArtsDie} + {col.martialArtsDie}", "kind": "damage"},
            ],
        },
        "Slow Fall": {
            "expect": "five times your martial artist level",
            "action": "reaction",
            "effects": [{"type": "display", "label": "Falling damage reduced", "expr": "level * 5"}],
        },
        "Stunning Strike": {"expect": "you can spend 1 ki point to attempt a Stunning Strike", "cost": {"ki": 1}},
        "Focused Aim": {"expect": "spend 1 to 3 ki points to increase your attack roll by 2", "cost": {"ki": 1}},
    },
}

# By class key, then by rules version ("*" = every version that has the class).
STRUCTURE = {
    "martial_artist": {"*": MARTIAL_ARTIST},
    "hybrid": {"*": HYBRID},
    "virtuoso": {"*": SPIRIT_CASTER},
    "skald": {"*": SPIRIT_CASTER},
    "devilforged": {
        # v8.8: a Charisma caster ("Spell save DC = 8 + your proficiency bonus + your Charisma modifier", p113).
        "dndf-8.8": {"entry": {"formulas": {
            "spellDC": {"label": "Spell save DC", "expr": "8 + prof + mod.cha"},
            "spellAttack": {"label": "Spell attack modifier", "expr": "prof + mod.cha"},
        }}, "features": {}},
        # v10: Intelligence, used for powers cast through an infused weapon (from 3rd level, p114).
        "dndf-10": {"entry": {"formulas": {
            "devilforgedDC": {"label": "Devilforged save DC", "expr": "8 + prof + mod.int"},
            "devilforgedAttack": {"label": "Devilforged attack modifier", "expr": "prof + mod.int"},
        }}, "features": {}},
    },
}

FEATURE_FIELDS = ("effects", "toggle", "uses", "action", "rolls", "onUse", "counter", "choices", "cost")


def apply_structure(key: str, version: str, entry: dict, problems: list[str]) -> None:
    """Adds the hand-entered fields to a freshly extracted class entry."""
    by_version = STRUCTURE.get(key, {})
    patch = by_version.get(version) or by_version.get("*")
    if not patch:
        return
    entry.update({k: v for k, v in patch.get("entry", {}).items()})
    features = {f["name"]: f for f in entry["features"]}
    for name, fields in patch.get("features", {}).items():
        feature = features.get(name)
        if feature is None:
            problems.append(f"{entry['name']} ({version}): no feature '{name}' to structure")
            continue
        text = feature["text"] + " " + " ".join(s["text"] for s in feature.get("sections", []))
        if fields["expect"] not in text:
            problems.append(f"{entry['name']} ({version}): '{name}' is worded differently here, so its numbers were not applied")
            continue
        for field in FEATURE_FIELDS:
            if field in fields:
                feature[field] = fields[field]
        if "auto" in feature:
            feature["auto"] = [a for a in feature["auto"] if a not in fields]
            if not feature["auto"]:
                del feature["auto"]
