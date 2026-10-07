"""Hand-entered structure for classes: the numbers a class adds to the sheet.

The extractor copies book text; it can't know that "your AC equals 10 + your Dexterity modifier +
your Wisdom modifier" is an AC formula. Those facts are written here, once, by a person who read
the feature, and are applied after extraction, in every rules version that has the class.

Each feature patch carries `expect`: a few words of the feature's own text. If a version words the
feature differently, the patch is not applied there and the extractor reports it, so a changed
rule never silently inherits numbers that were written for the other version.
"""

import json

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

EXTRA_ATTACK_2 = {"expect": "twice, instead of once", "effects": [{"type": "attacksPerAction", "value": 2}]}


def caster(noun: str, ability: str, feature: str, prepared: str | None = None) -> dict:
    """Save DC and attack modifier for a casting class, and how many powers it prepares where it prepares them."""
    patch: dict = {
        "entry": {"formulas": {
            "spellDC": {"label": f"{noun} save DC", "expr": f"8 + prof + mod.{ability}"},
            "spellAttack": {"label": f"{noun} attack modifier", "expr": f"prof + mod.{ability}"},
        }},
        "features": {},
    }
    if prepared:
        patch["features"][feature] = {"expect": prepared, "effects": [{"type": "display", "label": "Powers prepared", "expr": f"max(1, mod.{ability} + level)"}]}
    return patch


def merge(*patches: dict) -> dict:
    out: dict = {"entry": {}, "features": {}}
    for patch in patches:
        for key, value in patch.get("entry", {}).items():
            if isinstance(value, dict):
                out["entry"].setdefault(key, {}).update(value)
            else:
                out["entry"].setdefault(key, []).extend(value)
        out["features"].update(patch.get("features", {}))
    return out


CHEMIST = merge(
    caster("Invention", "wis", "Invention Power (Spellcasting)", "equal to your Wisdom modifier + your Chemist level"),
    {"features": {"Monster Mutation": {
        "expect": "number of hours equal to half your chemist level (rounded down)",
        "action": "action",
        "effects": [{"type": "display", "label": "Hours in abomination form", "expr": "floor(level / 2)"}],
    }}},
)

PRIEST = merge(
    caster("Spell", "wis", "Holy Power (Spellcasting)", "equal to your Wisdom modifier + your Priest level"),
    {
        # "restore a total number of hit points equal to your priest level x 5", back on a long rest.
        "entry": {"resources": [{"id": "kamis_will", "name": "Kami’s Will healing pool", "max": "level * 5", "recharge": "long", "minLevel": 3}]},
        "features": {
            "Channel Divinity": {
                "expect": "You can use this feature twice, regaining all used when you finish a short or long rest",
                "uses": {"max": "level>=18 ? 4 : level>=6 ? 3 : 2", "recharge": "short"},
            },
            "Blessed Strikes": {"expect": "you can also deal 1d8 radiant damage", "rolls": [{"label": "Radiant damage", "dice": "1d8", "kind": "damage"}]},
        },
    },
)

TINKERER = merge(
    caster("Creation", "int", "Creation Power (Spellcasting)", "equal to your Intelligence modifier + your Tinkerer level"),
    {"features": {"Recharging": {
        "expect": "combined level that is equal to or less than half your Tinkerer level (rounded up)",
        # "Once per day when you finish a Short Rest".
        "uses": {"max": 1, "recharge": "long"},
        "effects": [{"type": "display", "label": "Slot levels recovered", "expr": "ceil(level / 2)"}],
    }}},
)

ORACLE = caster("Spell", "wis", "Divination Power (Spellcasting)")

CONQUEROR = {
    "features": {
        "Conqueror’s Leadership": {
            "expect": "You regain all expended Leadership Dice when you finish a short or long rest",
            "cost": {"leadership": 1},
            "rolls": [{"label": "Leadership Die", "dice": "{col.leadershipDie}", "kind": "other"}],
        },
        "Extra Attack": EXTRA_ATTACK_2,
        "Coordinated Assault": {"expect": "expend 2 Leadership Dice to move any number of friendly creatures", "action": "bonus", "cost": {"leadership": 2}},
    },
}


# Switching stance gives 1d4 force damage and temporary hit points in v10 only.
CONQUEROR_V10 = merge(CONQUEROR, {"features": {"Command Stances": {
    "expect": "additional 1d4 force damage on your weapon attacks until the end of your turn and you gain an amount of temporary hit points equal to your wisdom modifier",
    "action": "bonus",
    "rolls": [
        {"label": "Stance switch: force damage", "dice": "1d4", "kind": "damage"},
        {"label": "Stance switch: temporary hit points", "dice": "{max(0, mod.wis)}", "kind": "tempHp"},
    ],
}}})
CONQUEROR_V88 = merge(CONQUEROR, {"features": {"Command Stances": {"expect": "As a bonus action, change your current stance to a new one below", "action": "bonus"}}})


def marksman(first: int) -> dict:
    """Lock-On's dice differ by handbook: 2d4 / 3d4 / 4d4 in v10, 1d4 / 2d4 / 3d4 in v8.8."""
    return merge(
        caster("Tactic", "wis", "Special Tactics (Spellcasting)"),
        {"features": {
            "Hawk-Eyed": {"expect": "your proficiency bonus is doubled when making Perception checks", "effects": [{"type": "expertise", "skill": "perception"}]},
            "Lock-On": {
                "expect": f"you increase that damage by {first}d4",
                "rolls": [{"label": "Lock-On damage", "dice": f"{{level>=14 ? {first + 2} : level>=6 ? {first + 1} : {first}}}d4 + {{level>=6 ? max(0, mod.wis) : 0}}", "kind": "damage"}],
            },
            "Fleet of Foot": {"expect": "Dash action as a bonus action", "action": "bonus"},
        }},
    )


CLOSE_QUARTERS = {"expect": "+1 bonus to attack rolls on ranged attacks", "effects": [{"type": "attack", "value": 1, "when": "ranged"}]}
MARKSMAN_V10 = merge(marksman(2), {"features": {
    "Extra Attack": {
        "expect": "The number of attacks increases to three when you reach 14th level",
        "effects": [{"type": "attacksPerAction", "expr": "level>=14 ? 3 : 2"}],
    },
    "Fighting Style": {"expect": "choose one of the following options", "choose": {"id": "fightingStyle", "count": 1, "options": {
        "Close Quarters Shooter": CLOSE_QUARTERS,
        "Improved Aiming": {"expect": "+3 bonus to attack rolls you make with ranged weapon attacks", "effects": [{"type": "attack", "value": 3, "when": "ranged"}]},
        "Sharpened Shot": {"expect": "two- handed ranged weapons equal to twice your proficiency bonus", "effects": [{"type": "damage", "expr": "prof * 2", "when": "ranged && twoHanded"}]},
    }}},
}})
# v8.8's styles are smaller: Aiming +2 to hit, Sharpened Shot +2 damage with any ranged weapon.
MARKSMAN_V88 = merge(marksman(1), {"features": {
    "Extra Attack": EXTRA_ATTACK_2,
    "Fighting Style": {"expect": "choose one of the following options", "choose": {"id": "fightingStyle", "count": 1, "options": {
        "Close Quarters Shooter": CLOSE_QUARTERS,
        "Aiming": {"expect": "+2 bonus to attack rolls you make with ranged weapon attacks", "effects": [{"type": "attack", "value": 2, "when": "ranged"}]},
        "Sharpened Shot": {"expect": "+2 bonus to damage rolls you make with ranged weapons", "effects": [{"type": "damage", "value": 2, "when": "ranged"}]},
    }}},
}})

SLIPPERY = {"expect": "You gain proficiency in Wisdom saving throws", "effects": [{"type": "saveProficiency", "ability": "wis"}]}
DODGE = {"expect": "use your reaction to halve the attack’s damage against you", "action": "reaction"}

RENEGADE = {
    # Stacks built by hitting with Dueling Strikes; lost on a miss, a Finishing Act, or when combat ends.
    "entry": {"trackers": [{"id": "press_the_attack", "name": "Press the Attack stacks", "min": 0, "max": "ceil(level / 2)", "minLevel": 5}]},
    "features": {
        "Fast Talker": {"expect": "you can add 1d4 to the roll", "rolls": [{"label": "Persuasion or Deception bonus", "dice": "1d4", "kind": "other"}]},
        "Uncanny Dodge": DODGE,
        "Press the Attack": {
            "expect": "+1 bonus to attack rolls you make with your Dueling Strikes up to +3",
            "effects": [{"type": "attack", "expr": "min(3, tracker.press_the_attack)"}],
            "rolls": [{"label": "Extra damage for the stacks held", "dice": "{max(1, tracker.press_the_attack)}d4", "kind": "damage"}],
        },
        "Slippery Mind": SLIPPERY,
    },
}

ROGUE = {
    "features": {
        "Sneak Attack": {"expect": "as shown in the Sneak Attack column of the Rogue table", "rolls": [{"label": "Sneak Attack damage", "dice": "{col.sneakAttack}", "kind": "damage"}]},
        "Cunning Action": {"expect": "take the Dash, Disengage, or Hide action", "action": "bonus"},
        "Uncanny Dodge": DODGE,
        "Slippery Mind": SLIPPERY,
    },
}

def warrior(aiming: int) -> dict:
    """Aiming gives +1 to ranged attacks in v10 and +2 in v8.8; the rest of the class's numbers are shared."""
    patch = json.loads(json.dumps(WARRIOR_BASE, default=str))
    patch["features"]["Fighting Style"]["choose"]["options"]["Aiming"] = {
        "expect": f"+{aiming} bonus to Attack Rolls you make with Ranged Weapons", "effects": [{"type": "attack", "value": aiming, "when": "ranged"}]}
    return patch


AIMING = None
WARRIOR_BASE = {
    "entry": {"formulas": {"strikeDC": {"label": "Strike save DC", "expr": "8 + prof + max(mod.str, mod.dex)"}}},
    "features": {
        "Fighting Style": {
            "expect": "Choose two of the following options",
            "choose": {"id": "fightingStyle", "count": 2, "options": {
                "Aiming": AIMING,
                "Close Quarters Shooter": {"expect": "+1 bonus to attack rolls on ranged attacks", "effects": [{"type": "attack", "value": 1, "when": "ranged"}]},
                "Defense": {"expect": "While you are wearing armor, you gain a +1 bonus to AC", "effects": [{"type": "ac", "value": 1, "when": "wearingArmor"}]},
                "Interception": {"expect": "reduce the damage the target takes by 1d10 + your proficiency bonus", "action": "reaction",
                                 "rolls": [{"label": "Damage reduced", "dice": "1d10 + {prof}", "kind": "other"}]},
                "Mariner": {"expect": "not wearing heavy armor or using a shield", "effects": [{"type": "ac", "value": 1, "when": "!heavyArmor && noShield"}]},
            }},
        },
        "Second Wind": {"expect": "regain Hit Points equal to 1d10 + your Warrior level", "action": "bonus",
                        "rolls": [{"label": "Hit points regained", "dice": "1d10 + {level}", "kind": "heal"}]},
        "Action Surge": {"expect": "Starting at 17th level, you can use it twice before a rest", "uses": {"max": "level>=17 ? 2 : 1", "recharge": "short"}},
        "Extra Attack": {
            "expect": "increases to three when you reach 11th level in this class and to four when you reach 20th level",
            "effects": [{"type": "attacksPerAction", "expr": "level>=20 ? 4 : level>=11 ? 3 : 2"}],
        },
        "Dashing Strike": {"expect": "take damage equal to 2d8 + your Strength modifier", "action": "action",
                           "rolls": [{"label": "Damage", "dice": "2d8 + {mod.str}", "kind": "damage"}]},
        "Crescent Strike": {"expect": "take 3d6 + your Strength or Dexterity modifier", "action": "action",
                            "rolls": [{"label": "Damage", "dice": "3d6 + {max(mod.str, mod.dex)}", "kind": "damage"}]},
    },
}
# v10 only: the Execute Dice column, and the save bonus the v10 aura gives.
WARRIOR_V10 = merge(warrior(1), {"features": {
    "Execute": {"expect": "deal an extra 1d6 weapon damage to the target", "rolls": [{"label": "Execute damage", "dice": "{col.executeDice}", "kind": "damage"}]},
    "Aura of Endurance": {"expect": "equal half of your proficiency bonus (rounded up)", "effects": [{"type": "display", "label": "Saving throw bonus", "expr": "ceil(prof / 2)"}]},
}})
WARRIOR_V88 = merge(warrior(2), {"features": {
    "Execute": {"expect": "deal an extra 2d8 weapon damage to the target", "rolls": [{"label": "Execute damage", "dice": "2d8", "kind": "damage"}]},
}})

HYBRID_FULL = merge(HYBRID, {"features": {"Extra Attack": EXTRA_ATTACK_2}})
MARTIAL_ARTIST_FULL = merge(MARTIAL_ARTIST, {"features": {"Extra Attack": EXTRA_ATTACK_2}})

# By class key, then by rules version ("*" = every version that has the class).
STRUCTURE = {
    "martial_artist": {"*": MARTIAL_ARTIST_FULL},
    "hybrid": {"*": HYBRID_FULL},
    "virtuoso": {"*": SPIRIT_CASTER},
    "skald": {"*": SPIRIT_CASTER},
    "chemist": {"*": CHEMIST},
    "priest": {"*": PRIEST},
    "tinkerer": {"*": TINKERER},
    "oracle": {"*": ORACLE},
    "conqueror": {"dndf-10": CONQUEROR_V10, "dndf-8.8": CONQUEROR_V88},
    "marksman": {"dndf-10": MARKSMAN_V10, "dndf-8.8": MARKSMAN_V88},
    "renegade": {"*": RENEGADE},
    "rogue": {"*": ROGUE},
    "warrior": {"dndf-10": WARRIOR_V10, "dndf-8.8": WARRIOR_V88},
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
        }}, "features": {"Extra Attack": EXTRA_ATTACK_2}},
    },
}

FEATURE_FIELDS = ("effects", "toggle", "uses", "action", "rolls", "onUse", "counter", "choices", "cost")


def _slug(text: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "_", text.lower().replace("’", "").replace("'", "")).strip("_")


def apply_structure(key: str, version: str, entry: dict, problems: list[str]) -> list[dict]:
    """Adds the hand-entered fields to a freshly extracted class entry. Returns any option lists it made."""
    by_version = STRUCTURE.get(key, {})
    patch = by_version.get(version) or by_version.get("*")
    made: list[dict] = []
    if not patch:
        return made
    for field, value in patch.get("entry", {}).items():
        if isinstance(value, list):
            entry[field] = [*value, *[x for x in entry.get(field, []) if x["id"] not in {v["id"] for v in value}]]
        else:
            entry[field] = {**entry.get(field, {}), **value}
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
        choose = fields.get("choose")
        if choose:
            # The feature's sub-headed parts are the things to pick from: make them an option list.
            group_id = f"optionGroup.{key}_{_slug(name)}"
            options = []
            for section in feature.pop("sections", []):
                option = {"id": _slug(section["name"]), "name": section["name"], "text": section["text"], "page": section["page"]}
                extra = choose["options"].get(section["name"])
                if extra:
                    if extra["expect"] in section["text"]:
                        option.update({k: v for k, v in extra.items() if k != "expect"})
                    else:
                        problems.append(f"{entry['name']} ({version}): '{name}: {section['name']}' is worded differently here, so its numbers were not applied")
                options.append(option)
            missing = set(choose["options"]) - {o["name"] for o in options}
            if missing:
                problems.append(f"{entry['name']} ({version}): '{name}' has no option {sorted(missing)}")
            feature["choices"] = {"id": choose["id"], "count": choose["count"], "from": group_id}
            made.append({"id": group_id, "kind": "optionGroup", "name": name, "versions": [version], "source": {**entry["source"], "page": feature["page"]}, "options": options})
    return made
