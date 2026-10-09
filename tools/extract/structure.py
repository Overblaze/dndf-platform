"""Hand-entered structure for classes: the numbers a class adds to the sheet.

The extractor copies book text; it can't know that "your AC equals 10 + your Dexterity modifier +
your Wisdom modifier" is an AC formula. Those facts are written here, once, by a person who read
the feature, and are applied after extraction, in every rules version that has the class.

Each feature patch carries `expect`: a few words of the feature's own text. If a version words the
feature differently, the patch is not applied there and the extractor reports it, so a changed
rule never silently inherits numbers that were written for the other version.
"""

import json
import re

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
        "Sharpened Shot": {"expect": "two-handed ranged weapons equal to twice your proficiency bonus", "effects": [{"type": "damage", "expr": "prof * 2", "when": "ranged && twoHanded"}]},
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
                # "in one hand and no other weapons": counted for every one-handed melee weapon; a second weapon in hand is the player's to discount.
                "Dueling": {"expect": "you gain a +2 bonus to Damage Rolls with that weapon", "effects": [{"type": "damage", "value": 2, "when": "melee && !twoHanded && weapon != 'unarmed_strike'"}]},
                "Thrown Weapon Fighting": {"expect": "you gain a +2 bonus to the damage roll", "effects": [{"type": "note", "label": "+2 damage on a ranged attack with a thrown weapon"}]},
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

def weapon_feat(weapon: str, plural: str, kind: str = "attack") -> dict:
    return {"expect": f"+1 bonus to {'attack' if kind == 'attack' else 'damage'} rolls with {plural}", "effects": [{"type": kind, "value": 1, "when": f"weapon == '{weapon}'"}]}


# Feats whose numbers the sheet can apply. A feat's "+1 to an ability score" is left to the player,
# who types final ability scores; everything conditional on a choice or a situation stays text.
FEAT_STRUCTURE = {
    "Alert": {"expect": "You gain a +5 bonus to initiative", "effects": [{"type": "initiative", "value": 5}]},
    "Mobile": {"expect": "Your speed increases by 10 feet", "effects": [{"type": "speed", "value": 10}]},
    "Tough": {"expect": "hit point maximum increases by an amount equal to twice your level", "effects": [{"type": "hp", "expr": "level * 2"}]},
    "Big Eater": {"expect": "you count as one size larger when determining your carrying capacity", "effects": [{"type": "carryMultiplier", "value": 2}]},
    "Armor Breaker": weapon_feat("mace", "maces"),
    "Assassin’s Strike": weapon_feat("shortsword", "shortswords"),
    "Boarding Cutlass": weapon_feat("cutlass", "cutlasses"),
    "Harvest the Weak": weapon_feat("sickle", "sickles"),
    "Saber Dance": weapon_feat("saber", "sabers"),
    "Whirling Blades": weapon_feat("scimitar", "scimitars", "damage"),
}


# Haki features (p222–240 of each handbook). Their dice come from the wording (see haki_rolls in
# extract_chapters.py); what is here is the rest: armor formulas, bonuses and things switched on.
RESIST_NONMAGICAL = "Resistance to bludgeoning, piercing, and slashing damage from nonmagical attacks"
HAKI_STRUCTURE: dict[str, dict] = {
    "Focused Hit": {"expect": "increase each die by one size up to a maximum of d8", "rolls": [], "effects": [{"type": "weaponDieStep", "max": 8, "label": "once per turn"}]},
    "Enhanced Strike": {"expect": "die by one size up to a maximum of d12", "rolls": [], "effects": [{"type": "weaponDieStep", "max": 12}]},
    "Resolve Within": {"expect": "resistance to bludgeoning, piercing, and slashing damage from nonmagical attacks", "toggle": {"id": "resolve_within", "label": "Resolve Within", "effects": [{"type": "note", "label": RESIST_NONMAGICAL}]}},
    "Vessel of Resilience": {
        "expect": "resistance to bludgeoning, piercing, and slashing damage from nonmagical attacks, and you have advantage on Constitution saving throws",
        "toggle": {"id": "vessel_of_resilience", "label": "Vessel of Resilience", "effects": [{"type": "note", "label": RESIST_NONMAGICAL}, {"type": "note", "label": "Advantage on Constitution saving throws"}]},
    },
    "Soul Armor": {
        "expect": "making your AC equal to 10 + your proficiency bonus + half of your Willpower (rounded up), maximum of 20 AC, when you aren’t wearing armor",
        "toggle": {"id": "soul_armor", "label": "Soul Armor", "effects": [{"type": "acFormula", "expr": "min(20, 10 + prof + ceil(willpower / 2))", "when": "noArmor"}]},
    },
    "Dark Armor": {
        "expect": "your Armor Class can’t be less than 5 + your Willpower",
        "toggle": {"id": "dark_armor", "label": "Dark Armor", "effects": [
            {"type": "acMinimum", "expr": "5 + willpower"},
            {"type": "note", "label": "Resistance to all types of damage except force"},
            {"type": "note", "label": "Immune to being grappled or restrained"},
        ]},
    },
    "Weapon Hardening": {"expect": "bonus to Attack rolls and Damage Rolls equal to a quarter of your Willpower (rounded up)", "effects": [{"type": "display", "label": "Attack and damage bonus with the coated weapon", "expr": "ceil(willpower / 4)"}]},
    "Conqueror’s Coating": {"expect": "bonus to Attack rolls and Damage Rolls equal to a quarter of your Willpower (rounded up)", "effects": [{"type": "display", "label": "Attack and damage bonus with the coated weapon", "expr": "ceil(willpower / 4)"}]},
    "Clairvoyant Strike": {"expect": "a bonus to your attack rolls equal to your Willpower score", "toggle": {"id": "clairvoyant_strike", "label": "Clairvoyant Strike", "effects": [{"type": "attack", "expr": "willpower"}]}},
    "Instinctual Awareness": {"expect": "You gain a +2 bonus to your passive Wisdom (Perception)", "effects": [{"type": "passivePerception", "value": 2}]},
    "Spirit Sense": {"expect": "You gain a +8 bonus to your passive Wisdom (Perception)", "effects": [{"type": "passivePerception", "value": 8}]},
}


def apply_haki_structure(version: str, item: dict, problems: list[str]) -> None:
    fields = HAKI_STRUCTURE.get(item["name"])
    if not fields:
        return
    if fields["expect"] not in item["text"]:
        problems.append(f"haki {item['name']} ({version}) is worded differently here, so its numbers were not applied")
        return
    for key in ("toggle", "rolls"):
        if key in fields:
            item[key] = fields[key]
    if "effects" in fields:
        item["effects"] = item.get("effects", []) + fields["effects"]
    if not item.get("rolls"):
        item.pop("rolls", None)
        if "auto" in item:
            item["auto"] = [a for a in item["auto"] if a != "rolls"]


def move(mode: str, speed: int | str, condition: str | None = None) -> dict:
    """A way of moving besides walking: swim, fly, climb or burrow, in feet or as an expression ("walk" is the walking speed)."""
    return {"type": "movement", "mode": mode, **({"value": speed} if isinstance(speed, int) else {"expr": speed}), **({"note": condition} if condition else {})}


def pick(ident: str, kind: str, label: str, count: int = 1, among: list[str] | None = None, or_tool: str | None = None) -> dict:
    """A choice a trait leaves to the player: a skill, a tool or a weapon "of your choice"."""
    return {"id": ident, "kind": kind, "count": count, "label": label, **({"from": among} if among else {}), **({"orTool": or_tool} if or_tool else {})}


NO_ARMOR_FLIGHT = "Not while wearing medium or heavy armor"

# Racial traits (p67–82). Uses, actions and plain dice come from the wording; these are the numbers that do not.
RACE_STRUCTURE: dict[str, dict[str, dict]] = {
    "Fishman": {"Speed": {"expect": "you have a Swimming speed of 35 feet", "effects": [move("swim", 35)]}},
    "Fish-Man, Wotan": {
        "Speed": {"expect": "you have a Swimming speed of 35 feet", "effects": [move("swim", 35)]},
        "Wotan Vigor": {"expect": "regain hit points equal to 1d12 + your Constitution modifier", "rolls": [{"label": "Regain hit points", "dice": "1d12 + {mod.con}", "kind": "heal"}]},
    },
    "Fishman / Cookiecutter": {"Speed": {"expect": "a Swimming speed of 30 feet, and a burrow speed of 30", "effects": [move("swim", 30), move("burrow", 30)]}},
    "Fishman / Manta Ray": {"Sea Glide": {"expect": "You have a Swimming speed of 40 feet", "effects": [move("swim", 40)]}},
    "Fishman / Octopus": {"Deadly Precision": {"expect": "sleight of hand or an Artisan’s tool of your choice", "picks": [pick("proficiency", "skill", "Sleight of Hand, or an artisan’s tool", among=["sleight_of_hand"], or_tool="Artisan’s tool")]}},
    "Fishman / Smelt-Whiting": {"Big-Mouthed": {"expect": "proficiency in the Deception or Persuasion skill (your choice)", "picks": [pick("skill", "skill", "Deception or Persuasion", among=["deception", "persuasion"])]}},
    "Merfolk": {"Speed": {
        "expect": "you have a Swimming speed of 50 feet. Once you reach level 5, your walking speed becomes 30 feet",
        "effects": [move("swim", 50), {"type": "speed", "expr": "level >= 5 ? 20 : 0", "walking": True}],
    }},
    "Sky Islander / Merveillians": {"Inherited Flight": {"expect": "you have a flying speed equal to your walking speed. You can’t use this flying speed if you’re wearing medium or heavy armor", "effects": [move("fly", "walk", NO_ARMOR_FLIGHT)]}},
    "Lunarian": {"Flight": {"expect": "You have a flying speed of 50 feet. To use this speed, you can’t be wearing medium or heavy armor", "effects": [move("fly", 50, NO_ARMOR_FLIGHT)]}},
    "Human / Variant": {"Skills": {"expect": "You gain proficiency in one skill of your choice", "picks": [pick("skill", "skill", "Skill proficiency")]}},
    "Yokai Tribesman": {"Crafty": {"expect": "You gain proficiency in one tool or instrument of your choice", "picks": [pick("tool", "tool", "Tool or instrument")]}},
    "Oni": {"Warrior’s Heritage": {"expect": "You have proficiency with two martial weapons of your choice and heavy armor", "picks": [pick("weapons", "weapon", "Martial weapons", count=2)]}},
    "Cyborg": {"Steel Skin": {"expect": "You gain a +1 bonus to Armor Class.", "effects": [{"type": "ac", "value": 1}]}},
    "Fishman / Fighting Fish": {"Thick-Skinned": {"expect": "You gain a +1 bonus to your Armor Class.", "effects": [{"type": "ac", "value": 1}]}},
    "Dwarf / Automata": {
        "Iron Shell": {"expect": "grants you a +1 bonus to Armor Class", "effects": [{"type": "ac", "value": 1}]},
        "Militaristic Design": {"expect": "You gain one skill proficiency and one weapon proficiency of your choice", "picks": [pick("skill", "skill", "Skill proficiency"), pick("weapon", "weapon", "Weapon proficiency")]},
    },
    "Dwarf / Tontatta Tribe": {
        "Hard to Detect": {"expect": "gives you proficiency in the Stealth and Acrobatics skills", "effects": [{"type": "proficiency", "skill": "stealth"}, {"type": "proficiency", "skill": "acrobatics"}]},
        "Glass Cannon": {"expect": "Your hit point maximum decreases by 2, and it decreases by 2 every time you gain a level", "effects": [{"type": "hp", "expr": "0 - 2 * level"}]},
    },
    "Buccaneer": {
        "Sturdy Build": {"expect": "When not wearing armor, your AC is 13 + your Constitution modifier", "effects": [{"type": "acFormula", "expr": "13 + mod.con", "when": "noArmor"}]},
        "Anchor Throw": {
            "expect": "it deals 1d12 in bludgeoning damage, gaining a",
            "rolls": [{"label": "Bludgeoning damage", "dice": "{level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1}d12", "kind": "damage"}],
        },
    },
    "Void Century Automaton": {"Constructed Resilience": {"expect": "your base Armor Class is 15 + your Wisdom modifier", "effects": [{"type": "acFormula", "expr": "15 + mod.wis", "when": "noArmor"}]}},
    "Fishman / Shark": {"Bite": {"expect": "piercing damage equal to 1d6 + your Strength modifier", "rolls": [{"label": "Bite: piercing damage", "dice": "1d6 + {mod.str}", "kind": "damage"}]}},
    "Mink": {"Beast’s Slash": {"expect": "your unarmed strike damage dice becomes a minimum of 1d6", "rolls": [], "effects": [{"type": "unarmedDie", "expr": "'1d6'", "weapons": "unarmedOnly"}, move("climb", 20)]}},
    "Yeti": {"Glacial Grasp": {"expect": "Constitution saving throw equal to 8 + your proficiency bonus + your Strength modifier", "effects": [{"type": "display", "label": "Save DC", "expr": "8 + prof + mod.str"}]}},
}

# A trait whose bold name the book prints without its full stop, so it reads as the end of the trait before it.
RACE_TRAIT_SPLITS: dict[str, list[tuple[str, str]]] = {"Dwarf / Tontatta Tribe": [("Hard to Detect", "Glass Cannon")]}

# A trait that is a list to choose from: the lines after its first are the options.
RACE_CHOICES: dict[str, dict] = {
    "Mink": {
        "trait": ("Animal Characteristics", "Animal Characteristic"),
        "id": "minkCharacteristics",
        "group": "mink_animal_characteristics",
        "count": [("You can pick two of the following", "", "2")],
        "options": {
            "Tough Hide": {"expect": "Your Armor Class increases by 1 while you are not wearing heavy armor", "effects": [{"type": "ac", "value": 1, "when": "!heavyArmor"}]},
            "Fleet Footed": {"expect": "Your base walking speed increases by 10 feet", "effects": [{"type": "speed", "value": 10, "walking": True}]},
            "Brute Strength": {"expect": "You gain proficiency in Athletics", "effects": [{"type": "proficiency", "skill": "athletics"}]},
            "Opposable Thumbs": {"expect": "You gain proficiency in Sleight of Hand", "effects": [{"type": "proficiency", "skill": "sleight_of_hand"}]},
            "Leap": {"expect": "Strength save DC equal to 8 + your Strength modifier + your proficiency bonus", "effects": [{"type": "display", "label": "Save DC", "expr": "8 + mod.str + prof"}]},
            "Nimble Climber": {"expect": "You have a climbing speed equal to your walking speed", "effects": [move("climb", "walk")]},
            "Good Swimmer": {"expect": "You have a swimming speed equal to your walking speed", "effects": [move("swim", "walk")]},
        },
    },
    "Cyborg": {
        "trait": ("Cyborg Upgrades",),
        "id": "cyborgUpgrades",
        "group": "cyborg_upgrades",
        # How many upgrades a level gives, by the sentence that says so (the two handbooks differ).
        "count": [
            ("You install 2 weapon or tool features of your choice", "You can choose an additional upgrade at levels 4, 8, 12, 16, and 20th level", "2 + floor(level / 4)"),
            ("You install a weapon or tool feature of your choice", "At 20th level, you can install and use a fifth upgrade feature", "1 + floor(level / 5)"),
        ],
        "options": {
            "Propeller Body": {"expect": "You gain a swimming speed of 25 feet", "effects": [move("swim", 25)]},
            "Larger Propellers": {"expect": "You now have a flying speed of 10 feet", "effects": [move("fly", 10)]},
            "Shape-Memory Alloy Body": {"expect": "You gain one skill proficiency and one tool proficiency of your choice", "picks": [pick("skill", "skill", "Skill proficiency"), pick("tool", "tool", "Tool proficiency")]},
            "Advanced Shape-Memory Alloy": {"expect": "You learn an additional Skill of your choice", "picks": [pick("skill", "skill", "Additional skill")]},
            "Night Lens": {"expect": "You can see in dim light within 60 feet of you as if it were bright light", "effects": [{"type": "note", "label": "Darkvision 60 feet"}]},
            "Centaur Form": {
                "expect": "your speed increases by 10 feet for one minute. Additionally, you have advantage on all Strength checks",
                "toggle": {"id": "centaur_form", "label": "Centaur Form", "effects": [{"type": "speed", "value": 10}, {"type": "note", "label": "Advantage on Strength checks"}]},
            },
        },
    },
}


def apply_race_structure(version: str, who: str, trait: dict, problems: list[str]) -> None:
    fields = RACE_STRUCTURE.get(who, {}).get(trait["name"])
    if not fields:
        return
    if fields["expect"] not in trait["text"]:
        problems.append(f"race {who} / {trait['name']} ({version}) is worded differently here, so its numbers were not applied")
        return
    if "rolls" in fields:
        trait["rolls"] = fields["rolls"]
        if not trait["rolls"]:
            del trait["rolls"]
            if "auto" in trait:
                trait["auto"] = [a for a in trait["auto"] if a != "rolls"]
                if not trait["auto"]:
                    del trait["auto"]
    if "effects" in fields:
        trait["effects"] = trait.get("effects", []) + fields["effects"]
    if "picks" in fields:
        trait["picks"] = fields["picks"]


def apply_feat_structure(version: str, feat: dict, problems: list[str]) -> None:
    fields = FEAT_STRUCTURE.get(feat["name"])
    if not fields:
        return
    if fields["expect"] not in feat["text"]:
        problems.append(f"feat {feat['name']} ({version}) is worded differently here, so its numbers were not applied")
        return
    feat["effects"] = fields["effects"]


def more_class(key: str, features: dict[str, dict], versions: tuple[str, ...] = ("dndf-10", "dndf-8.8")) -> None:
    """Adds feature patches to a class, in the handbooks named (a class stored once under "*" gets them there)."""
    table = STRUCTURE[key]
    for version in versions:
        if version not in table:
            if "*" not in table:
                continue
            # Split the shared patch so one handbook can differ from the other.
            table["dndf-10"] = {**table["*"], "features": dict(table["*"].get("features", {}))}
            table["dndf-8.8"] = {**table["*"], "features": dict(table["*"].get("features", {}))}
            del table["*"]
        table[version].setdefault("features", {}).update(features)


ALL_SAVES = [{"type": "saveProficiency", "ability": a} for a in ("str", "dex", "con", "int", "wis", "cha")]
LEADERSHIP_ROLL = [{"label": "Leadership Die", "dice": "{col.leadershipDie}", "kind": "other"}]
MELODY = "level>=14 ? 3 : level>=8 ? 2 : 1"
EMPOWERING_MELODY = {
    "expect": "gain a +1 bonus to your harmonic weapons attack and damage rolls while you wield it. This bonus increases to +2 at 8th level and +3 at 14th level",
    "toggle": {"id": "harmonic_weapon", "label": "Attacking with your harmonic weapon", "effects": [{"type": "attack", "expr": MELODY}, {"type": "damage", "expr": MELODY}]},
    "effects": [{"type": "display", "label": "Added to spell damage and healing rolls", "expr": MELODY}],
}
RELIABLE = {"expect": "you can treat a d20 roll of 9 or lower as a 10", "effects": [{"type": "note", "label": "Ability checks that add your proficiency bonus: treat a d20 roll of 9 or lower as a 10"}]}

more_class("martial_artist", {
    "Ki-Fueled Attack": {"expect": "you may spend 1 ki point after your attack roll", "cost": {"ki": 1}},
    "Heart Chakra": {"expect": "You regain a number of hit points equal to the number rolled plus your proficiency bonus", "action": "action", "cost": {"ki": 2},
                     "rolls": [{"label": "Hit points regained", "dice": "{col.martialArtsDie} + {prof}", "kind": "heal"}]},
    "Crown Chakra": {"expect": "you gain proficiency in all Saving Throws", "effects": ALL_SAVES, "cost": {"ki": 1}},
    "Sacral Chakra": {"expect": "when you roll Initiative and have 3 Ki Points or fewer, you regain expended Ki Points until you have 4",
                      "effects": [{"type": "note", "label": "Rolling initiative with 3 ki points or fewer: regain ki until you have 4"}]},
    "Third Eye Chakra": {"expect": "you have resistance to all damage except force damage", "action": "action", "cost": {"ki": 3},
                         "toggle": {"id": "third_eye_chakra", "label": "Third Eye Chakra (1 minute)", "effects": [{"type": "note", "label": "Resistance to all damage except force"}]}},
    "Death Chakra": {"expect": "you can spend 4 ki points, roll four Martial Arts dice", "cost": {"ki": 4},
                     "rolls": [{"label": "Hit points you are left with", "dice": "{col.martialArtsDie} + {col.martialArtsDie} + {col.martialArtsDie} + {col.martialArtsDie}", "kind": "other"}]},
})
more_class("hybrid", {
    "Power Enhancements": {"expect": "you may spend 1 Hybrid Point and apply one of the following Power Enhancements", "action": "reaction", "cost": {"hybrid_points": 1}},
    "Flash Augment": {"expect": "you can expend 2 Hybrid Points to teleport up to 30 feet", "action": "bonus", "cost": {"hybrid_points": 2}},
    "Resilience Augment": {"expect": "you can spend 1 Hybrid Point to reroll the saving throw", "cost": {"hybrid_points": 1}},
    "Re-Energized": {"expect": "When you finish a short or long rest, you regain 4 Hybrid Points",
                     "effects": [{"type": "note", "label": "Finishing a short or long rest: regain 4 Hybrid Points"}]},
    "Chain Channeling": {"expect": "you can expend 2 Hybrid Points to immediately cast a second Hybrid Power", "cost": {"hybrid_points": 2}},
})
more_class("conqueror", {
    "Conqueror’s Command": {"expect": "choose one of the following options and expend a Leadership Die", "cost": {"leadership": 1}, "rolls": LEADERSHIP_ROLL},
    "Empower Conqueror’s Haki": {"expect": "you can expend a Leadership Die to increase the DC by the number rolled", "cost": {"leadership": 1}, "rolls": LEADERSHIP_ROLL},
    "Supreme Coordination": {"expect": "friendly creatures within 60 feet of you gain a +2 bonus to initiative rolls",
                             "effects": [{"type": "note", "label": "Friendly creatures within 60 feet: +2 to initiative rolls"}]},
})
more_class("priest", {
    "Kami’s Will": {"expect": "immune to the disease and poisoned conditions and resistant to poison damage",
                    "effects": [{"type": "note", "label": "Immune to the disease and poisoned conditions; resistance to poison damage"}]},
})
more_class("oracle", {
    "Enhanced Divination": {"expect": "cast the Divination spell once per day without expending a spell slot", "uses": {"max": 1, "recharge": "long"}},
})
more_class("virtuoso", {"Empowering Melody": EMPOWERING_MELODY}, ("dndf-10",))
more_class("skald", {"Empowering Melody": EMPOWERING_MELODY}, ("dndf-8.8",))
more_class("renegade", {
    "Reliable Talent": RELIABLE,
    "Fast Talker": {"expect": "you can add 1d4 to the roll", "rolls": [{"label": "Added to a Persuasion or Deception check", "dice": "1d4", "kind": "other"}]},
}, ("dndf-10",))
more_class("rogue", {
    "Reliable Talent": RELIABLE,
    "Fast Talker": {"expect": "you can treat a d20 roll of 9 or lower as a 10", "effects": [{"type": "note", "label": "Persuasion and Deception checks: treat a d20 roll of 9 or lower as a 10"}]},
}, ("dndf-8.8",))

FEATURE_FIELDS = ("effects", "toggle", "uses", "action", "rolls", "onUse", "counter", "choices", "cost")


def note(label: str) -> dict:
    return {"type": "note", "label": label}


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


# --- Subclasses ---------------------------------------------------------------------
# The numbers a subclass keeps on the sheet all the time, or while something is switched on.
# Keyed by subclass id, then feature name. Same rule as above: each quotes the feature's own words,
# and is skipped (and reported) in a handbook that words the feature differently.
NO_ARMOR = "noArmor"

SUBCLASS_STRUCTURE: dict[str, dict[str, dict]] = {
    # Hybrid
    "subclass.hybrid.beast": {
        "Prototype Augmentations": {"expect": "Your AC increases by +2", "effects": [{"type": "ac", "value": 2}]},
        "Integrate Beastcore": {"expect": "You are immune to being blinded, deafened, paralyzed, poisoned, or stunned",
                                "effects": [note("Immune to being blinded, deafened, paralyzed, poisoned, or stunned")]},
    },
    "subclass.hybrid.germa": {
        "Combat Exoskeleton": {
            "expect": "While you are not wearing armor, your AC equals 13 + your Strength modifier",
            "effects": [{"type": "acFormula", "expr": "13 + mod.str", "when": NO_ARMOR}, {"type": "hp", "expr": "level"}],
        },
        "Genetic Pinnacle": {"expect": "You have resistance to all damage except force and psychic damage", "effects": [note("Resistance to all damage except force and psychic")]},
    },
    "subclass.hybrid.seraphim": {
        "Prototype Seraphim Frame": {"expect": "You have resistance to fire damage", "effects": [note("Resistance to fire damage")]},
        "S-Defensive Protocol": {"expect": "While you are not wearing armor, your AC equals 13 + your Constitution modifier",
                                 "effects": [{"type": "acFormula", "expr": "13 + mod.con", "when": NO_ARMOR}]},
    },
    # Martial Artist
    "subclass.martial_artist.combustion_boxer": {
        "Toughened Body": {
            "expect": "You add your Constitution modifier to your Unarmored Defense AC",
            "effects": [{"type": "acFormula", "expr": "10 + mod.dex + mod.wis + mod.con", "when": "noArmor && noShield"}, note("Resistance to fire damage")],
        },
    },
    # Priest
    "subclass.priest.infernal": {
        "Fiendish Skin": {"expect": "While you are not wearing armor, your AC equals 10 + your proficiency bonus + your Wisdom modifier",
                          "effects": [{"type": "acFormula", "expr": "10 + prof + mod.wis", "when": NO_ARMOR}]},
        "Diabolic Resilience": {"expect": "Resistance to fire and poison damage", "effects": [note("Resistance to fire and poison damage")]},
    },
    "subclass.priest.sky": {
        "Bonus Proficiencies": {"expect": "you gain resistance to thunder and lightning damage", "effects": [note("Resistance to thunder and lightning damage")]},
    },
    # Virtuoso / Skald
    "subclass.virtuoso.battlehymn": {
        "Battle Proficiencies": {"expect": "your hit point maximum increases by an amount equal to twice your virtuoso level", "effects": [{"type": "hp", "expr": "level * 2"}]},
    },
    # Initiative bonuses
    "subclass.marksman.gunslinger": {
        "Quick-draw": {"expect": "bonus to your initiative rolls equal to your Wisdom modifier", "effects": [{"type": "initiative", "expr": "max(0, mod.wis)"}]},
    },
    "subclass.renegade.swashbuckler": {
        "Better’s Hand": {"expect": "You gain a bonus to initiative rolls equal to your Charisma modifier", "effects": [{"type": "initiative", "expr": "max(0, mod.cha)"}]},
    },
    "subclass.tinkerer.military_science": {
        "Tactical Mind": {"expect": "You gain a bonus to your Initiative rolls equal to your Intelligence modifier", "effects": [{"type": "initiative", "expr": "max(0, mod.int)"}]},
        "Durable Tech": {"expect": "While you maintain Concentration on a spell, you have a +2 bonus to AC and all Saving Throws",
                         "toggle": {"id": "durable_tech", "label": "Concentrating on a spell", "effects": [{"type": "ac", "value": 2}, note("+2 to all saving throws")]}},
    },
    # Things that are on only while something is true: a switch on the sheet.
    "subclass.devilforged.devil_blade": {
        "Hell’s Duelist": {"expect": "while you are wielding a melee weapon infused with at least one Devil Fruit, you gain a +1 bonus to your AC",
                           "toggle": {"id": "infused_blade", "label": "Wielding an infused melee weapon", "effects": [{"type": "ac", "value": 1}]}},
    },
    "subclass.renegade.circus_tricks": {
        "Trick Rider": {"expect": "Your walking speed increases by 25 feet",
                        "toggle": {"id": "trick_rider", "label": "Riding your prop", "effects": [{"type": "speed", "value": 25, "walking": True}]}},
    },
    "subclass.conqueror.warmonger": {
        "Warmonger’s Rage": {"expect": "Your movement speed increases by 10 feet",
                             "toggle": {"id": "warmongers_rage", "label": "Warmonger’s Rage", "effects": [{"type": "speed", "expr": "level>=16 ? 30 : 10"}]}},
    },
    # Standing resistances and immunities, shown under "In effect".
    "subclass.chemist.botany": {
        "Botanist’s Antidote": {"expect": "you can’t be charmed or frightened and you are immune to poison and disease", "effects": [note("Can’t be charmed or frightened; immune to poison and disease")]},
    },
    "subclass.conqueror.celestial_doctrine": {
        "Divine Right": {"expect": "you are immune to being charmed or frightened", "effects": [note("Immune to being charmed or frightened")]},
    },
    "subclass.oracle.bones_of_sight": {
        "Speaker of the Dead": {"only": "dndf-10", "expect": "resistance to necrotic damage", "effects": [note("Resistance to necrotic damage")]},
    },
    "subclass.tinkerer.plague_engineer": {
        "Viral Immunity": {"expect": "You are immune to diseases, gain resistance to poison damage", "effects": [note("Immune to diseases; resistance to poison damage")]},
    },
    "subclass.warrior.cursed_soul": {
        "Shepard of Spirits": {"expect": "You have Resistance to psychic damage", "effects": [note("Resistance to psychic damage")]},
    },
    "subclass.warrior.ryuo_samurai": {
        "Two Weapon Expert": {"expect": "you gain resistance to both magical and nonmagical slashing damage", "effects": [note("Resistance to slashing damage, magical and nonmagical")]},
    },
}

SWASHBUCKLER_88 = {"expect": "You can give yourself a bonus to your initiative rolls equal to your Charisma modifier", "effects": [{"type": "initiative", "expr": "max(0, mod.cha)"}]}
WORDSMITH = {"expect": "You gain expertise in Persuasion", "effects": [{"type": "proficiency", "skill": "persuasion"}, {"type": "expertise", "skill": "persuasion"}]}


def more(subclass: str, features: dict[str, dict]) -> None:
    SUBCLASS_STRUCTURE.setdefault(subclass, {}).update(features)


more("subclass.bruiser.drunken_dragon", {
    "Liquid Courage": {"expect": "but your movement speed is reduced by 10 feet",
                       "toggle": {"id": "sorrowful_stagger", "label": "Sorrowful Stagger (rolled a 2)", "effects": [{"type": "speed", "value": -10}, note("Resistance to all damage")]}},
})
more("subclass.bruiser.drunken_dragon", {
    "Drunken State": {"only": "dndf-10", "expect": "You can create up to 5 beverages per long rest", "uses": {"max": 5, "recharge": "long"}},
})
more("subclass.conqueror.warmonger", {
    "Warmonger’s Rage": {
        "expect": "Your movement speed increases by 10 feet",
        "toggle": {"id": "warmongers_rage", "label": "Warmonger’s Rage", "effects": [
            {"type": "speed", "expr": "level>=16 ? 30 : 10"},
            {**note("One additional weapon attack when you take the Attack action"), "when": "level<16"},
            {**note("Three additional weapon attacks when you take the Attack action"), "when": "level>=16"},
        ]},
        "rolls": [{"label": "Hit points when you drop a creature", "dice": "{level}", "kind": "heal"}],
    },
    "Battlefield Veteran": {"expect": "you have advantage on saving throws against being frightened", "effects": [note("Advantage on saving throws against being frightened")]},
})
more("subclass.devilforged.devil_bulwark", {
    "Defenders Leap": {"expect": "the AC bonus granted by that shield increases by 1",
                       "toggle": {"id": "infused_shield", "label": "Wielding your infused shield", "effects": [{"type": "ac", "expr": "level>=14 ? 3 : level>=10 ? 2 : 1"}]}},
})
more("subclass.devilforged.gear_smithing", {
    "Armored Up": {"expect": "you gain a +1 bonus to Armor Class while you have your infused devil fruit item equipped or held",
                   "toggle": {"id": "infused_item", "label": "Infused item equipped or held", "effects": [{"type": "ac", "value": 1}]}},
})
more("subclass.devilforged.firearm_smithing", {
    "Nether Scope": {"expect": "You gain resistance to fire damage", "effects": [note("Resistance to fire damage")]},
})
more("subclass.hybrid.mother_flame", {
    "Void Awakening": {
        "expect": "While you aren’t wearing armor, your base Armor Class is 15 + your Wisdom modifier",
        "effects": [{"type": "acFormula", "expr": "15 + mod.wis", "when": NO_ARMOR},
                    note("Resistance to poison damage; immune to disease; advantage on saves against being poisoned, charmed, or frightened")],
    },
})
more("subclass.marksman.beast_tamer", {
    "Bonded Companion": [
        {"expect": "You gain expertise in Animal Handling", "effects": [{"type": "proficiency", "skill": "animal_handling"}, {"type": "expertise", "skill": "animal_handling"}]},
        {"expect": "you gain proficiency in Animal Handling", "effects": [{"type": "proficiency", "skill": "animal_handling"}]},
    ],
})
more("subclass.marksman.gunslinger", {
    "Iron Mind": {"expect": "you gain proficiency in Wisdom saving throws", "effects": [{"type": "saveProficiency", "ability": "wis"}]},
})
more("subclass.marksman.rope_master", {
    "Rope Dance": {"expect": "You gain advantage on checks and saving throws made to escape grapples or restraints", "effects": [note("Advantage on checks and saves to escape grapples or restraints")]},
})
more("subclass.martial_artist.black_leg_style", {
    "Sky Step": {"expect": "your walking speed increases by an additional 10 feet", "effects": [{"type": "speed", "value": 10, "walking": True}]},
    "Black Leg Combatant": {"only": "dndf-8.8", "expect": "you gain a bonus to your AC equal to your proficiency bonus / 2 (rounded up)",
                            "toggle": {"id": "black_leg_guard", "label": "Not wielding a weapon or shield", "effects": [{"type": "ac", "expr": "ceil(prof / 2)"}]}},
})
more("subclass.martial_artist.wano_ninpo", {
    "Shadow Budoka": {"expect": "gaining expertise in Stealth", "effects": [{"type": "proficiency", "skill": "stealth"}, {"type": "expertise", "skill": "stealth"}]},
})
more("subclass.oracle.bones_of_sight", {
    "Death’s Rattle": {"expect": "you gain advantage on death saving throws", "effects": [note("Advantage on death saving throws")]},
    "Sight Beyond the Grave": {"only": "dndf-8.8", "expect": "resistance to necrotic damage", "effects": [note("Resistance to necrotic damage")]},
})
more("subclass.oracle.voices_of_the_past", {
    "Ancestral Echoes": {"expect": "you gain proficiency in History", "effects": [{"type": "proficiency", "skill": "history"}]},
})
more("subclass.priest.cherry_blossom", {
    "Channel Divinity: Blossom Joy": {"expect": "you gain a +5 bonus to all Charisma (Persuasion) and Charisma (Performance) checks",
                                      "toggle": {"id": "blossom_joy", "label": "Blossom Joy (1 minute)", "effects": [note("+5 to Charisma (Persuasion) and Charisma (Performance) checks")]}},
})
more("subclass.priest.sky", {
    "Dial Glide": {"expect": "you gain a flying speed equal to double your current walking speed", "effects": [move("fly", "walk * 2")]},
})
more("subclass.renegade.thief", {
    "Thievery Skills": {"expect": "you gain advantage on Dexterity (Sleight of Hand) checks", "effects": [note("Advantage on Sleight of Hand checks and on thieves’ tools checks to disarm a trap or open a lock")]},
    "Supreme Sneak": {"expect": "you have advantage on a Dexterity (Stealth) checks.", "effects": [note("Advantage on Dexterity (Stealth) checks")]},
})
more("subclass.renegade.circus_tricks", {
    "Mountain Climb": {"expect": "you gain a climbing speed equal to your walking speed", "effects": [{**move("climb", "walk"), "when": "on.trick_rider"}]},
})
more("subclass.rogue.swashbuckler", {"Rakish Audacity": SWASHBUCKLER_88})
more("subclass.tinkerer.meteorology", {
    "Storm Forecasting": {
        "expect": "you gain Resistance to lightning and thunder damage while holding your gadget",
        "toggle": {"id": "holding_gadget", "label": "Holding your gadget", "effects": [
            {**note("Resistance to lightning and thunder damage"), "when": "level<18"},
            {**note("Immune to lightning and thunder damage"), "when": "level>=18"},
        ]},
    },
})
more("subclass.virtuoso.battlehymn", {
    "Fury of the Battlehym": {"expect": "you can Attack twice, instead of once", "effects": [{"type": "attacksPerAction", "value": 2}]},
})
more("subclass.skald.battlehymn", {
    "Extra Attack": {"expect": "you can Attack twice, instead of once", "effects": [{"type": "attacksPerAction", "value": 2}]},
})
more("subclass.virtuoso.wordsmithing", {"Perfectly Placed Words": WORDSMITH})
more("subclass.skald.wordsmithing", {"Perfectly Placed Words": WORDSMITH})
more("subclass.warrior.kuja_huntress", {
    "Snake Companion": {"expect": "you gain expertise in the Acrobatics and Survival skills",
                        "effects": [{"type": "proficiency", "skill": "acrobatics"}, {"type": "expertise", "skill": "acrobatics"}, {"type": "proficiency", "skill": "survival"}, {"type": "expertise", "skill": "survival"}]},
})
more("subclass.warrior.cursed_soul", {
    "Silver Mist": {"expect": "gain a bonus of +2 to Armor Class",
                    "toggle": {"id": "silver_mist", "label": "Silver Mist (1 minute)", "effects": [{"type": "ac", "value": 2}, note("Advantage on one attack each turn")]}},
    "Jest of the Dead": {"expect": "advantage on saving throws against being blinded, deafened, stunned or knocked unconcious",
                         "effects": [note("Advantage on saves against being blinded, deafened, stunned or knocked unconscious")]},
})
more("subclass.warrior.ryuo_samurai", {
    "Ryuo Master": {"expect": "gain a +2 bonus to attack and damage rolls",
                    "toggle": {"id": "black_blades", "label": "Attacking with your paired Black Blades", "effects": [{"type": "attack", "value": 2}, {"type": "damage", "value": 2}]}},
})
more("subclass.warrior.black_weapon", {
    "Superior Sharpened Spirit": {"only": "dndf-8.8", "expect": "your weapon attacks score a critical hit on a roll of 17-20", "effects": [note("Weapon attacks score a critical hit on 17–20")]},
})

# --- Subclass pools: dice and uses a subclass owns, the die growing with level -----------


def die(*steps: tuple[int, str], first: str) -> str:
    """A die that grows: die((5, "d8"), (11, "d10"), first="d6") → "{level>=11 ? 'd10' : level>=5 ? 'd8' : 'd6'}"."""
    expr = f"'{first}'"
    for level, size in steps:
        expr = f"level>={level} ? '{size}' : {expr}"
    return "{" + expr + "}"


def show(label: str, expr: str) -> dict:
    return {"type": "display", "label": label, "expr": expr}


CURSED_DIE = die((5, "d8"), (11, "d10"), (17, "d12"), first="d6")
RYUO_DIE = die((5, "d8"), (11, "d10"), (17, "d12"), first="d6")
RAMEN_DIE = die((7, "d6"), (10, "d8"), (15, "d10"), (18, "d12"), first="d4")
SIGIL_DIE = die((5, "d6"), (11, "d8"), (17, "d10"), first="d4")
ETERNITY_DIE = die((5, "d6"), (9, "d8"), (13, "d10"), (17, "d12"), first="d4")
RAMEN_DISHES = "{level>=18 ? 4 : level>=15 ? 3 : level>=10 ? 2 : 1}"

more("subclass.oracle.eyes_of_the_future", {
    "Dice of Eternity": {"expect": "You have an amount of dice of eternity equal to your proficiency bonus",
                         "uses": {"max": "prof", "recharge": "short"}, "rolls": [{"label": "Die of eternity", "dice": "1" + ETERNITY_DIE, "kind": "other"}]},
})
more("subclass.oracle.occult_sigilist", {
    "Sacrificial Sigil Creation": {
        "expect": "You gain a number of sigil dice equal to twice your proficiency bonus",
        "uses": {"max": "prof * 2", "recharge": "long"},
        "rolls": [{"label": "Sigil die (the damage you take)", "dice": "1" + SIGIL_DIE, "kind": "other"}],
    },
})
more("subclass.oracle.soul_of_the_present", {
    # Sustained Vitality (11th) doubles Soul Aura's uses; the counter stays on Soul Aura.
    "Soul Aura": {"expect": "temporary hit points equal to your Wisdom modifier + your Oracle level (minimum of 1)",
                  "uses": {"max": "level>=11 ? prof * 2 : prof", "recharge": "long"}, "action": "bonus",
                  "rolls": [{"label": "Temporary hit points granted", "dice": "{max(1, mod.wis + level)}", "kind": "other"}]},
    "Sustained Vitality": {"expect": "you can use your Soul Aura feature a number of times equal to double your proficiency bonus", "uses": None},
})
more("subclass.oracle.bones_of_sight", {
    "Death’s Rattle": {"expect": "you gain advantage on death saving throws", "effects": [note("Advantage on death saving throws"), show("Temporary hit points", "level * 2")]},
})
more("subclass.warrior.cursed_soul", {
    "Champion of Malice": {
        "expect": "You have a number of these dice equal to twice your Proficiency Bonus",
        "uses": {"max": "prof * 2", "recharge": "long"},
        "rolls": [{"label": "Cursed Spirit die", "dice": "1" + CURSED_DIE, "kind": "other"}],
        "effects": [show("Curse save DC", "8 + prof + mod.int")],
    },
})
more("subclass.warrior.ryuo_samurai", {
    "Ryuo Training": {
        "expect": "You have a number of these dice equal to twice your proficiency bonus",
        "uses": {"max": "prof * 2", "recharge": "long"},
        "rolls": [{"label": "Ryuo Die", "dice": "1" + RYUO_DIE, "kind": "other"}],
        "effects": [show("Ryuo save DC", "8 + prof + mod.str")],
    },
})
more("subclass.warrior.ramen_kenpo", {
    "Apprentice Chef": {
        "expect": "they take 2 Ramen Dice in piercing damage",
        "rolls": [{"label": "Ramen Beam", "dice": "2" + RAMEN_DIE, "kind": "damage"},
                  {"label": "Noodle Whip", "dice": "2" + RAMEN_DIE + " + {max(mod.str, mod.dex)}", "kind": "damage"}],
        "effects": [show("Ramen save DC", "8 + prof + mod.con")],
    },
    "Home Cooking": {
        "expect": "you can prepare an amount of special ramen dishes equal to double your proficiency bonus",
        "uses": {"max": "prof * 2", "recharge": "short"},
        "rolls": [{"label": "Temporary hit points from a dish", "dice": RAMEN_DISHES + RAMEN_DIE + " + {ceil(level / 2)}", "kind": "other"}],
    },
})
more("subclass.martial_artist.six_powers", {
    "Shave": {"expect": "You can use this feature a number of times equal to your proficiency bonus", "uses": {"max": "prof", "recharge": "long"}, "action": "bonus"},
})
more("subclass.priest.cherry_blossom", {
    # One use comes back on a short rest, all of them on a long rest.
    "Calming Branches": {"expect": "You regain one use of this feature after a short rest and all expended uses after a long rest", "uses": {"max": "prof", "recharge": "long"}, "action": "reaction"},
})
more("subclass.devilforged.devil_bombardier", {
    "Devilbomb Creation": {"expect": "you can create a number of bombs equal to your proficiency bonus, regaining all expended uses after a long rest", "uses": {"max": "prof", "recharge": "long"}},
})
more("subclass.devilforged.firearm_smithing", {
    "Hellfire Artillery": {"expect": "a number of times equal to your porficiency bonus", "uses": {"max": "prof", "recharge": "long"}, "action": "bonus"},
})
more("subclass.devilforged.devil_bulwark", {
    "Improved Bulwark Stance": {"expect": "Gain an amount of temporary hit points equal to double your devilforged level",
                                "rolls": [{"label": "Temporary hit points", "dice": "{level * 2}", "kind": "tempHp"}]},
})
more("subclass.chemist.cryochemist", {
    "Icy Fortitude": {"expect": "temporary hit points equal to your Chemist level + your Wisdom modifier",
                      "rolls": [{"label": "Temporary hit points granted", "dice": "{level + mod.wis}", "kind": "other"}]},
})
more("subclass.martial_artist.black_leg_style", {
    "Stylish Boost": [
        {"expect": "temporary hit points equal to half you Martial Artist level rounded up", "rolls": [{"label": "Temporary hit points", "dice": "{ceil(level / 2)}", "kind": "tempHp"}]},
        {"expect": "Gain temporary hit points equal to your martial artist level", "rolls": [{"label": "Temporary hit points", "dice": "{level}", "kind": "tempHp"}]},
    ],
})
more("subclass.hybrid.germa", {
    "Cell Regeneration": {"expect": "regain a number of HP equal to your Strength modifier", "rolls": [{"label": "Hit points regained (1 hybrid point)", "dice": "{max(0, mod.str)}", "kind": "heal"}]},
})

# --- Choices inside a subclass ---------------------------------------------------------
GERMA_STRIKE = lambda dice, label: [{"label": label, "dice": dice, "kind": "damage"}]  # noqa: E731

more("subclass.hybrid.germa", {
    "Genetic Superpower": {"expect": "Choose one of the following powers", "choose": {"id": "germaSuperpower", "count": 1, "options": {
        "Poison Pink": {
            "expect": "You can use this ability a number of times equal to your proficiency bonus, regaining all expended uses after a long rest",
            "rolls": GERMA_STRIKE("1d6", "Acidic Touch (once per turn)"), "uses": {"max": "prof", "recharge": "long"},
            "effects": [note("Immune to poison damage and the poisoned condition"), move("fly", 45, NO_ARMOR_FLIGHT)],
        },
        "Stealth Black": {
            "expect": "a number of times equal to your Dexterity modifier (minimum of once), regaining all uses after a long rest",
            "rolls": GERMA_STRIKE("1d6", "Flame Strike (once per turn)"), "uses": {"max": "max(1, mod.dex)", "recharge": "long"},
            "effects": [note("Advantage on Dexterity (Stealth) checks made to move silently or hide")],
        },
        "Winch Green": {
            "expect": "Increase your strength score by +2 and your maximum strength score to 22. You count as gargantuan when determining your carrying capacity",
            "rolls": GERMA_STRIKE("1d8", "Bionic Strike (once per turn)"),
            # Gargantuan is three sizes above Medium: carrying doubles three times.
            "effects": [{"type": "ability", "ability": "str", "value": 2, "max": 22}, {"type": "carryMultiplier", "value": 8}],
        },
        "Dengeki Blue": {
            "expect": "Your walking speed increases by an amount equal to 10 x your proficiency bonus",
            "rolls": GERMA_STRIKE("1d6", "Lightning Strike (once per turn)"), "effects": [{"type": "speed", "expr": "10 * prof", "walking": True}],
        },
        "Sparking Red": {"expect": "you deal an additional 1d6 radiant damage with the spell", "rolls": GERMA_STRIKE("1d6", "Flash Burst (once per turn)")},
    }}},
})
more("subclass.marksman.rope_master", {
    # Each trick has its own uses; the count the detector put on the feature belonged to them.
    "Rope Tricks": {
        "expect": "You can use each of your Rope Tricks a number of times equal to double your proficiency bonus per short rest", "uses": None,
        "choose": {"id": "ropeTricks", "count": "level>=15 ? 4 : level>=7 ? 3 : 2", "inline": ["Whiplash", "Tether Throw", "Tripwire", "Hookshot"],
                   "each": {"uses": {"max": "prof * 2", "recharge": "short"}},
                   "options": {"Tether Throw": {"expect": "As a reaction", "action": "reaction"}, "Hookshot": {"expect": "As a bonus action", "action": "bonus"}}},
    },
})
more("subclass.devilforged.mechadevil", {
    "Mechadevil Mark 2": {
        "only": "dndf-10",
        "expect": "You can activate each weapon system a number of times equal to your proficiency bonus, and you regain all expended uses when you finish a short or long rest", "uses": None,
        "choose": {"id": "mechadevilWeapons", "count": "level>=14 ? 4 : level>=10 ? 3 : 2", "inline": ["Swarm Cannons", "Energy Blast", "Energy Lance", "Railcannon", "Power Fist"],
                   "each": {"uses": {"max": "prof", "recharge": "short"}, "action": "action"}},
    },
})
more("subclass.chemist.botany", {
    "Field Invention Powers (Spells)": {"expect": "Choose that land", "choose": {"id": "botanyLand", "count": 1}},
})

# --- Steamtech: Pressure Gauge Points and the device table -------------------------------
ENTRY = "*entry*"
ENTRY_88 = "*entry, v8.8 only*"


def _device(name: str, cost: int, *sentences: str, action: str = "action") -> dict:
    return {"name": name, "text": " ".join(sentences), "expect": list(sentences) + [name.split()[0]], "cost": {"pgp": cost}, "action": action}


# The table is three columns whose long cells wrap; each device is typed here from EH10 p.189 and
# checked against the extracted cells, line by line as the book breaks them.
STEAM_DEVICES = [
    _device("Gatling Gun", 1, "As an action, cast the Magic Missile spell at 1st level from the device."),
    _device("Grappling Hook", 1, "As an action, cast the Lightning Lure cantrip on a target or surface from the device. If cast on a surface, you",
            "pull yourself 15 ft. in the surface’s direction, ignoring opportunity attacks."),
    _device("Multiarm Apparatus", 1, "As an action, cast the Mage Hand cantrip from the device. While the mage hand is active, you can use a bonus",
            "action to have the hand grant the help action."),
    _device("Pneumatic Gauntlet", 1, "As an action, cast the Burning Hands spell at 1st level from the device."),
    _device("Steam Shield", 1, "As a reaction when you are hit by an attack or targeted by the Magic Missile spell, cast the Shield spell at 1st", "level.", action="reaction"),
    _device("Steam Vent Boots", 1, "As an action, cast the Thunderwave spell at 1st level from the device."),
    _device("Rocket Spear", 2, "As an action, cast the Aganazzar’s Scorcher spell at 2nd level from the device."),
    _device("Steam-Powered Turret", 2, "As an action, place the turret in unoccupied space within 5 ft. of you. As a reaction, cast the Gust of Wind spell",
            "at 2nd level from the turrets location."),
    _device("Jetpack", 3, "As an action, cast the Fly spell at 3rd level from the device."),
    _device("Pressure Mine Dispenser", 3, "As an action, place up to 3 mines in unoccupied space within 5 ft. of you. When a creature steps on this",
            "device, cast the Fireball spell at 3rd level on the mines location. Once a mine uses its signature spell, the device self destructs. You may only have 3 mine activate at a time."),
]


def repair_steamtech(version: str, entry: dict, problems: list[str]) -> None:
    """The device table sits in the middle of Overclock on the page, so Overclock's last paragraph is read
    as a part named after the table, and the table hangs on the last feature. Put the paragraph back and
    move the table, rebuilt as the book's three columns, to Steamtech Devices."""
    features = {f["name"]: f for f in entry["features"]}
    overclock, devices, last = features.get("Overclock"), features.get("Steamtech Devices"), features.get("Steam Conversion")
    stray = next((s for s in (overclock or {}).get("sections", []) if s["name"] == "Steamtech Device Table"), None)
    table = next((t for t in (last or {}).get("tables", []) if t["rows"] and t["rows"][0][0] == "Steamtech"), None)
    if not (overclock and devices and stray and table and "you can increase the spell level of your devices signature spell by 2" in overclock["text"]):
        problems.append(f"{entry['name']} ({version}): the Steamtech device table is laid out differently here; not repaired")
        return
    cells = re.sub(r"\s+", " ", " ".join(str(c) for row in table["rows"] for c in row))
    if any(part not in cells for device in STEAM_DEVICES for part in device["expect"]):
        problems.append(f"{entry['name']} ({version}): the Steamtech device table reads differently here; not repaired")
        return
    overclock["text"] += "\n" + stray["text"]  # the paragraph printed under the table
    overclock["sections"] = [s for s in overclock["sections"] if s is not stray]
    if not overclock["sections"]:
        del overclock["sections"]
    devices["tables"] = [{"rows": [["Steamtech Device", "Description", "PGP Cost"]] + [[d["name"], d["text"], str(d["cost"]["pgp"])] for d in STEAM_DEVICES], "page": table["page"]}]
    last["tables"] = [t for t in last["tables"] if t is not table]
    if not last["tables"]:
        del last["tables"]
    devices["_cells"] = cells  # for the option list below; removed once it is built


REPAIRS = {"subclass.tinkerer.steamtech": repair_steamtech}

more("subclass.tinkerer.steamtech", {
    ENTRY: {"feature": "Pressure Gauge System", "expect": "The amount of PGPs you have is based on your Tinkerer level",
            "resources": [{"id": "pgp", "name": "Pressure Gauge Points", "max": "level>=14 ? 20 : level>=10 ? 15 : level>=6 ? 10 : 5", "recharge": "long"}]},
    "Steamtech Devices": {
        "expect": "You can build two Steamtech Devices of your choice from the Steam Device Table",
        # A third device at 6th (Overclock), a fourth at 10th (Integrated Pressure Core), a fifth at 14th (Steam Conversion).
        "choose": {"id": "steamtechDevices", "count": "level>=14 ? 5 : level>=10 ? 4 : level>=6 ? 3 : 2", "given": STEAM_DEVICES},
        "effects": [show("Spell levels a device can be upcast (+1 PGP each)", "level>=14 ? 3 : level>=10 ? 2 : level>=6 ? 1 : 0")],
    },
    "Integrated Pressure Core": {"expect": "you regain 2 PGPs per hit dice you spend", "effects": [note("Short rest: regain 2 PGPs per hit die spent (no hit points from those dice)")]},
    "Steam Conversion": {"expect": "When you roll initiative, you immediately regain 3 PGPs", "effects": [note("Rolling initiative: regain 3 PGPs")]},
})
more("subclass.tinkerer.military_science", {
    ENTRY: {"feature": "Power Surge", "expect": "You can store a maximum number of Power Surges equal to your Intelligence modifier (minimum of one)",
            "trackers": [{"id": "power_surges", "name": "Power Surges", "min": 0, "max": "max(1, mod.int)"}]},
    "Power Surge": {"expect": "The extra damage equals your Tinkerer level", "cost": {"power_surges": 1},
                    "rolls": [{"label": "Extra force damage", "dice": "{level}", "kind": "damage"}]},
})

# --- Companions: the numbers the sheet can work out for a beast, mech, robot or vessel -------
# Each companion's own stat block (a beast from the Monster Manual, a Zoan form) stays outside the sheet;
# what depends on the character is shown on the feature, and a hit point pool is kept where the book gives a formula.
BEAST_CR = "level>=17 ? '8' : level>=13 ? '4' : level>=9 ? '2' : level>=5 ? '1' : '1/2'"
BEAST_DICE = "level>=17 ? 4 : level>=13 ? 3 : level>=9 ? 2 : level>=5 ? 1 : 0"
TAMER = {
    "expect": "The beast’s hit points equal the beasts normal hit points + your marksman level x your proficiency bonus",
    "effects": [
        show("Beast: hit points added to its own", "level * prof"),
        show("Beast: highest challenge rating", BEAST_CR),
        show("Beast: extra damage dice", BEAST_DICE),
        show("Beast: proficiency bonus", "prof"),
        {**note("Beast: attacks count as magical (Willpower Strikes)"), "when": "level>=5"},
        {**note("Beast: resistance to nonmagical bludgeoning, piercing and slashing (Resilience)"), "when": "level>=9"},
        {**note("Beast: heals for the damage it deals (Battle Leech)"), "when": "level>=13"},
    ],
}
more("subclass.marksman.beast_tamer", {
    # Animal Handling: expertise in v10's wording, proficiency in v8.8's (entered above); both keep the beast's numbers.
    "Bonded Companion": [
        {"only": "dndf-10", **TAMER, "expect": "You gain expertise in Animal Handling",
         "effects": [{"type": "proficiency", "skill": "animal_handling"}, {"type": "expertise", "skill": "animal_handling"}] + TAMER["effects"]},
        {"only": "dndf-8.8", **TAMER, "effects": [{"type": "proficiency", "skill": "animal_handling"}] + TAMER["effects"]},
    ],
})
more("subclass.devilforged.no_mi_trainer", {
    ENTRY_88: {"feature": "Bloodline Beast Synthesis", "expect": "Your created bloodline beast cannot be killed",
               "resources": [{"id": "bloodline_beast_hp", "name": "Bloodline Beast hit points", "max": "max(1, 2 * mod.cha + 5 * level)", "recharge": "long"}]},
    ENTRY: {"only": "dndf-10", "feature": "No Mi Star Synthesis", "expect": "the beast uses the Bloodline Beast stat block",
            "resources": [{"id": "bloodline_beast_hp", "name": "Bloodline Beast hit points", "max": "max(1, 2 * mod.int + 5 * level)", "recharge": "long"}]},
    "No Mi Star Synthesis": {
        "only": "dndf-10", "expect": "If the Bloodline Beast’s feature forces a creature to make a saving throw, it uses your Devilforged save DC",
        "effects": [show("Beast: hit point maximum", "max(1, 2 * mod.int + 5 * level)"), show("Beast: hit dice (d8)", "level"),
                    show("Beast: save DC", "8 + prof + mod.int"), show("Beast: proficiency bonus", "prof")],
    },
    "Bloodline Beast Synthesis": {
        "only": "dndf-8.8", "expect": "If your bloodline beast’s feature calls for a creature to roll a saving throw, use your spell save DC",
        "effects": [show("Beast: hit point maximum", "max(1, 2 * mod.cha + 5 * level)"), show("Beast: hit dice (d8)", "level"),
                    show("Beast: save DC", "8 + prof + mod.cha"), show("Beast: proficiency bonus", "prof")],
    },
})
MECH_HP = "(level>=17 ? 12 : level>=11 ? 10 : level>=5 ? 8 : 6) * level"
more("subclass.devilforged.mechadevil", {
    "Mechadevil Mark 1": [
        {"only": "dndf-8.8", "expect": "Your Mech’s size and stats scale with your Devilforged level",
         "effects": [show("Mech: Armor Class", "level>=17 ? 19 : level>=11 ? 18 : level>=5 ? 17 : 16"), show("Mech: hit point maximum", MECH_HP),
                     show("Mech: speed (ft.)", "level>=17 ? 50 : level>=11 ? 40 : level>=5 ? 35 : 30"), note("Mech: its Strength score equals your Charisma score")]},
        {"only": "dndf-10", "expect": "On a hit, the target takes damage equal to 1d10 + your intelligence modifier",
         "action": "action",
         "rolls": [{"label": "Elemental Blast", "dice": die((5, "2d10"), (11, "3d10"), (17, "4d10"), first="1d10") + " + {mod.int}", "kind": "damage"}],
         "toggle": {"id": "mechadevil_armor", "label": "Wearing your Mechadevil Armor", "effects": [
             note("Flying speed 30 ft. (60 ft. from Mark 3, 120 ft. from Mark 4)"),
             note("Resistance to nonmagical bludgeoning, piercing and slashing; immune to poison and the poisoned condition"),
             note("+2 to spell attack rolls made through the armor"),
         ]}},
    ],
})
more("subclass.devilforged.mechadevil", {
    ENTRY_88: {"feature": "Mechadevil Mark 1", "expect": "Your Mech’s size and stats scale with your Devilforged level",
               "resources": [{"id": "mech_hp", "name": "Mechadevil Suit hit points", "max": MECH_HP, "recharge": "long"}]},
})
more("subclass.devilforged.bestial_klabautermann", {
    "Figurehead Form": {"expect": "Its AC equals your Devilforged save DC",
                        "effects": [show("Figurehead: Armor Class", "8 + prof + mod.int"), show("Figurehead: hit points", "level * 2"), show("Figurehead: speed (ft.)", "30")]},
})
more("subclass.tinkerer.robotics", {
    "Simple Robots": {"expect": "Its AC is equal to 8 + your Intelligence Modifier, and its HP is 1", "action": "action",
                      "effects": [show("Robot: Armor Class", "8 + mod.int"), show("Robot: hit points", "1"), show("Robot: speed (ft.)", "30")]},
})
more("subclass.devilforged.firearm_smithing", {
    "Hellfire Artillery": {"expect": "a number of times equal to your porficiency bonus", "uses": {"max": "prof", "recharge": "long"}, "action": "bonus",
                           "rolls": [{"label": "Cannon shot (fire, cold or lightning)", "dice": die((10, "2d8"), first="1d8") + " + {mod.cha}", "kind": "damage"}]},
})

_seen_subclasses: set[str] = set()
_missing: dict[tuple[str, str], list[str]] = {}
_found: set[tuple[str, str]] = set()


def unused_subclass_structure() -> list[str]:
    """Subclass ids entered above that no handbook produced: a typo, or a renamed subclass."""
    never = [f"{sub}: '{name}'" for (sub, name) in _missing if (sub, name) not in _found]
    return sorted(set(SUBCLASS_STRUCTURE) - _seen_subclasses) + sorted(never)


def apply_subclass_structure(version: str, entry: dict, problems: list[str]) -> list[dict]:
    """A feature's patch is one dict, or a list of them when the handbooks word it differently.
    "only" limits a patch to one handbook, for a number the other handbook does not give."""
    patch = SUBCLASS_STRUCTURE.get(entry["id"])
    made: list[dict] = []
    if not patch:
        return made
    _seen_subclasses.add(entry["id"])
    squash = lambda t: re.sub(r"\s+", " ", t)
    repair = REPAIRS.get(entry["id"])
    if repair:
        repair(version, entry, problems)
    features = {f["name"]: f for f in entry["features"]}
    for name, wordings in patch.items():
        if name in (ENTRY, ENTRY_88):
            if (name == ENTRY_88 and version != "dndf-8.8") or wordings.get("only", version) != version:
                continue
            # Pools and trackers the subclass itself owns, shown from the level its feature arrives.
            anchor = features.get(wordings["feature"])
            if anchor is None or squash(wordings["expect"]) not in squash(anchor["text"] + " " + " ".join(s["text"] for s in anchor.get("sections", []))):
                problems.append(f"{entry['name']} ({version}): '{wordings['feature']}' is worded differently here, so its pool was not added")
                continue
            for field in ("resources", "trackers"):
                if field in wordings:
                    page = {"page": anchor["page"]} if field == "trackers" else {}
                    entry[field] = [{**item, "minLevel": anchor["level"], **page} for item in wordings[field]]
            continue
        wordings = [w for w in (wordings if isinstance(wordings, list) else [wordings]) if w.get("only", version) == version]
        feature = features.get(name)
        if not wordings:
            continue
        if feature is None:
            _missing.setdefault((entry["id"], name), []).append(version)
            continue
        _found.add((entry["id"], name))
        text = squash(feature["text"] + " " + " ".join(s["text"] for s in feature.get("sections", [])))
        fields = next((w for w in wordings if squash(w["expect"]) in text), None)
        if fields is None:
            problems.append(f"{entry['name']} ({version}): '{name}' is worded differently here, so its numbers were not applied")
            continue
        for field in FEATURE_FIELDS:
            if field in fields and fields[field] is None:
                feature.pop(field, None)  # the detector's guess was wrong and there is nothing to put in its place
            elif field in fields:
                feature[field] = fields[field]
        if "auto" in feature:
            feature["auto"] = [a for a in feature["auto"] if a not in fields]
            if not feature["auto"]:
                del feature["auto"]
        choose = fields.get("choose")
        if choose:
            made.append(_subclass_options(version, entry, feature, choose, problems))
    return made


def _subclass_options(version: str, entry: dict, feature: dict, choose: dict, problems: list[str]) -> dict:
    """The things a subclass feature lets the player pick, as an option list.
    They are the feature's sub-headed parts, or (with "inline") the paragraphs of its text that
    open with one of the names given, as in "Whiplash. When you hit…". Inline text stays in the feature too."""
    key = entry["id"].split(".")[1]
    group_id = f"optionGroup.{key}_{entry['id'].split('.')[2]}_{_slug(feature['name'])}"
    where = f"{entry['name']} ({version}): '{feature['name']}"
    options = []
    if choose.get("given"):
        # A list the book prints as a table: each option's words are typed here and must be found in the entry's tables.
        cells = feature.pop("_cells", None) or re.sub(r"\s+", " ", " ".join(str(c) for f in entry["features"] for t in f.get("tables", []) for row in t["rows"] for c in row))
        for given in choose["given"]:
            missing = [part for part in given["expect"] if part not in cells]
            if missing:
                problems.append(f"{where}: {given['name']}' is not in the book's table as typed ({missing[0][:40]}…)")
                continue
            options.append({"id": _slug(given["name"]), "name": given["name"], "page": feature["page"], **{k: v for k, v in given.items() if k not in ("name", "expect")}})
    elif choose.get("inline"):
        for name in choose["inline"]:
            line = next((p for p in feature["text"].split("\n") if p.startswith(name + ". ")), None)
            if line is None:
                problems.append(f"{where}' has no paragraph that opens with '{name}.'")
                continue
            options.append({"id": _slug(name), "name": name, "text": line[len(name) + 2:], "page": feature["page"]})
    else:
        for section in feature.pop("sections", []):
            option = {"id": _slug(section["name"]), "name": section["name"], "text": section["text"], "page": section["page"]}
            if section.get("tables"):
                option["tables"] = section["tables"]
            options.append(option)
    for option in options:
        extra = dict(choose.get("each", {}))
        extra.update(choose.get("options", {}).get(option["name"], {}))
        expect = extra.pop("expect", None)
        if expect and expect not in option["text"]:
            problems.append(f"{where}: {option['name']}' is worded differently here, so its numbers were not applied")
            continue
        option.update(extra)
    missing = set(choose.get("options", {})) - {o["name"] for o in options}
    if missing:
        problems.append(f"{where}' has no option {sorted(missing)}")
    feature["choices"] = {"id": choose["id"], "count": choose["count"], "from": group_id}
    return {"id": group_id, "kind": "optionGroup", "name": f"{entry['name']}: {feature['name']}", "versions": [version],
            "source": {**entry["source"], "page": feature["page"]}, "options": options}
