# Formula reference (each row = one engine test)

Sample: Kaito Rourke, Human (Standard) Bruiser 7, v10 — Str 18, Dex 14, Con 16, Int 8, Wis 12, Cha 10; proficient Str/Con saves; Athletics, Intimidation, Perception, Persuasion. Pages: v10 Expanded Handbook unless noted. Round DOWN unless stated.

Books: **EH10** = DnDF Expanded Handbook v10 · **EH8.8** = DnDF Expanded Handbook v8.8 · **EDFE** = Expanded Devil Fruit Encyclopedia v1.2 · **DFE** = Original Devil Fruit Encyclopedia · **DMG** = DnDF DM Guide (PDF pages) · **PHB** = Original DnDF PHB · **VGM** = Volo's Guide to Monsters · **SRD** = 5e SRD 5.1. The site shows the same abbreviations beside every page number.

The made-up characters in `packages/engine/src/testCharacters.ts` are checked against these formulas with the arithmetic written out beside each expected number.

## Core 5e
| Number | Formula | Kaito | Page |
|---|---|---|---|
| Ability mod | floor((score − 10) / 2) | Str +4 | EH10 p.10 |
| Proficiency | 2 + floor((total level − 1) / 4) | +3 | EH10 p.209 |
| Weapon attack | ability mod (Str; Dex if finesse/ranged) + prof if proficient + item bonus | +7 | — |
| Weapon damage | die (or class die e.g. Scrapper) + same mod + bonuses | 1d6 + 4 (+3 frenzied) | EH10 p.86 |
| Save | mod + prof if proficient | Str +7, Con +6 | EH10 p.85 |
| Skill | mod + prof (×2 expertise) | Athletics +7 | — |
| Passive Perception | 10 + Perception (±5 adv/disadv) | 14 | — |
| Initiative | Dex mod + bonuses (Alert +5) | +2 | EH10 p.52 |
| AC | best of armor formula / class unarmored (Offensive Defense 10+Dex+Con, no armor & no shield) / 10+Dex; + shield 2 | 15 | EH10 p.86 |
| Speed | race base + bonuses (+10 Offensive Defense) | 40 ft | EH10 p.67, 86 |
| Max HP | L1: die max + Con; each later level: avg (die/2 + 1) or roll, + Con; Con changes are retroactive | 75 | EH10 p.85 |
| Carry | Str × 15 lb; ×2 per "counts as one size larger"; ×2 Tireless Training | 270 | EH10 p.10 |
| Temp HP | don't stack (keep higher); damage hits temp first; HP clamps 0..max | — | — |

## DnDF
| Number | Formula | Kaito | Page |
|---|---|---|---|
| Willpower | 1 at L1, +1 per level gained; Strengthen Self +2 (v10 only: in v8.8 it raises an ability score, not Willpower); total capped at 20 (Strengthen Self included). Variant: 0 + 1 per Spiritual Advancement | 7 | EH10 p.221–222 |
| Haki save DC | 10 + ceil(Willpower / 2) | 14 | EH10 p.221 |
| Haki attack (table ruling; custom/original-PHB features only) | 2 + ceil(Willpower / 2) | +6 | — |
| Haki tier per color | T2 at 4 features of that color, T3 at 6; Amateur (Common) don't count | — | EH10 p.221 |
| Haki Purist | picks at 4, 10, 16 (v8.8: 4, 8, 12, 16, 20); lost on gaining a Devil Fruit | — | EH10 p.221 |
| Devil Fruit save DC | 10 + ceil(Willpower / 2) | 14 | EH10 p.242 |
| Devil Fruit attack | 2 + ceil(Willpower / 2) | +6 | EH10 p.242 |
| Paramecia charges | L1–2: 2, then = level (max 20); highest spell level ceil(level/2), max 9 | L7: 7, 4th | EDFE p.8 |
| Logia charges | 2,2,3,3,4,4,5, then level − 2 (18 at 20); highest spell 2nd at L1, ceil((level+2)/2), max 9 | L7: 5, 5th | EDFE p.11 |
| Upcast fruit spell | +1 charge per level above base, up to highest level | — | EDFE p.8 |
| Zoan (eater) | human form: matching score + ceil(beast mod/2) (max 20); Beast Form uses = prof per dawn; lasts ceil(level/2) h | 3 uses, 4 h | EDFE p.9–10 |
| Power penalty variant | Very Rare Paramecia/Logia −2 max charges; Legendary/Infernal −3 | — | EH10 p.250 |
| Dream Points | = level, reset on level-up; +1d6 to attack/check/save after roll, or turn a failed death save into a success | 7 | EH10 p.11 |
| I Won't Abandon My Dreams | on death d20 ≥ 12 → 1 HP; exhaustion-6 death → exhaustion 5 | — | EH10 p.11 |
| Healing Surge (ruling) | spend up to max(1, floor(total HD / 2)), ≤ remaining; each die + Con; once per short/long rest | up to 3 | EH10 p.11 |
| Special Reactions | 2 per round; each usable prof times per short rest; Parry Blow / Deflect Projectile −(1d10 + level) | 3 each | EH10 p.11 |
| Pirate Prestige max | ceil(level / 2); MVP +1d4 | 4 | EH10 p.12 |
| Bounty (suggestion; player-editable) | L²×฿1M + crewmates×฿1M + fruit rarity lvl×฿10M + top Haki rarity lvl×฿10M + minor deeds×฿10M + major×฿100M + ship Con×฿1M + extra ships×฿10M + plunder×2 + civilians×฿100K + cities×฿10M + navy ships×฿10M + nobles×฿100M (Uncommon 1 … Legendary 4) | 49+8+10+30+15 = ฿112M | DMG p.107 (PDF page) |

## Bruiser (v10)
| Number | Formula | Kaito | Page |
|---|---|---|---|
| Scrapper die | d4 L1–4, d6 5–8, d8 9–12, d10 13–16, d12 17–20 | d6 | EH10 p.85 |
| Fury points | L1 0, then 2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,12 (L2…L20); refill on short rest after 30 min training | 4 | EH10 p.85–86 |
| Fury features known | = prof | 3 | EH10 p.86 |
| Fury save DC | 8 + prof + Con | 14 | EH10 p.86 |
| Thrill of the Fight | prof uses / long rest; while on: +prof melee dmg, resist B/P/S, adv Str checks & saves, no spellcasting | 3, +3 | EH10 p.86 |
| Brace for Impact | temp HP = Scrapper roll + bruiser level | 1d6 + 7 | EH10 p.86 |
| Enduring Honesty | Persuasion + ceil(level / 4) when truthful about motives | +2 | EH10 p.87 |
| Blood for Brawn | at ≤ half max HP (reaction): temp HP = Scrapper roll + level, refill Fury; 1/short rest | ≤ 37 HP | EH10 p.87 |
| Undying Frenzy | Con save DC 10, +5 per use, resets on rest | — | EH10 p.87 |
| Armament-Coated Muscles | DR = Con; or +ceil(Con/2) hit and +Con dmg | 3 / +2,+3 | EH10 p.89 |
| Internal Vibrations | ceil(prof / 2) d6 thunder | 2d6 | EH10 p.91 |
| The King (20) | Str, Con +2, cap 22 | — | EH10 p.87 |

## Martial Artist (v10 and v8.8; the class is the same in both)
Sample: Martial Artist 7 — Str 10, Dex 16, Con 14, Wis 14.
| Number | Formula | Sample | Page |
|---|---|---|---|
| Unarmored Defense | 10 + Dex + Wis, no armor and no shield | 15 | EH10 p.149 |
| Unarmored Movement | + table bonus to speed (10 ft at 2nd … 30 ft at 18th), no armor and no shield | 45 ft | EH10 p.150 |
| Martial Arts | unarmed and martial artist weapons (shortswords; simple melee without two-handed or heavy): Dex or Str, and the Martial Arts die if larger; no armor and no shield | +6, 1d8 + 3 | EH10 p.150 |
| Ki points | = table (0 at 1st, then = level); short rest after 30 min meditating | 7 | EH10 p.150 |
| Ki save DC | 8 + prof + Wis | 13 | EH10 p.150 |
| Deflect Projectile | 1d10 + Dex + level; redirect for 1 ki: two Martial Arts dice | 1d10 + 10, 2d8 | EH10 p.150 |
| Slow Fall | 5 × level | 35 | EH10 p.151 |

## Hybrid (v10 pages; v8.8 is the same from p136)
Sample: Hybrid 5 — Str 16, Dex 12, Cha 16.
| Number | Formula | Sample | Page |
|---|---|---|---|
| Hybrid save DC / attack | 8 + prof + Cha / prof + Cha | 14 / +6 | EH10 p.131 |
| Close Quarters Training | unarmed strikes 1d8, Str or Dex | +6, 1d8 + 3 | EH10 p.131 |
| Hybrid Points | held up to the Power Threshold maximum (table); 0 after a long rest | max 4 | EH10 p.131 |
| Power Threshold (from 2nd) | +1 melee damage per 2 points held, +1 AC per 5, +1 melee attack per 3 | 7 held: +3 dmg, +1 AC, +2 hit | EH10 p.132 |
| Energy Transfer / Absorb Power / Defensive Augment | +2 points / +1 point / −2 points | — | EH10 p.132 |

## Virtuoso (v10) and Skald (v8.8)
Sample: level 5 — Dex 14, Cha 18.
| Number | Formula | Sample | Page |
|---|---|---|---|
| Spirit save DC / attack | 8 + prof + Cha / prof + Cha | 15 / +7 | EH10 p.194 (EH8.8 p.184) |
| Jack of All Trades (from 2nd) | + floor(prof / 2) on ability checks without proficiency, initiative included | Stealth +3, Initiative +3 | EH10 p.195 |
| Harmonic Weaponry | Cha for the chosen weapon's attack and damage (set per weapon) | rapier +7, 1d8 + 4 | EH10 p.195 |
| Song of the Sea | 1d6; 1d8 at 9th, 1d10 at 13th, 1d12 at 17th | 1d6 | EH10 p.195 |
| Floating chords | up to 3 held | — | EH10 p.194 |

## Devilforged (v10)
| Number | Formula | Sample (level 5, Int 16) | Page |
|---|---|---|---|
| Devilforged save DC / attack | 8 + prof + Int / prof + Int | 14 / +6 | EH10 p.114 |

## Casters: Chemist, Priest, Tinkerer, Oracle, Marksman (both versions)
| Number | Formula | Sample | Page (v10) |
|---|---|---|---|
| Chemist Invention save DC / attack | 8 + prof + Wis / prof + Wis | level 5, Wis 16: 14 / +6 | EH10 p.94 |
| Chemist powers prepared | Wis + level, minimum 1 | 8 | EH10 p.94 |
| Chemist abomination form | floor(level / 2) hours; 2 uses per short rest | 2 h | EH10 p.94 |
| Priest Spell save DC / attack | 8 + prof + Wis / prof + Wis | level 6, Wis 18: 15 / +7 | EH10 p.165 |
| Priest Channel Divinity | 2 uses per short rest; 3 from 6th, 4 from 18th | 3 | EH10 p.165 |
| Priest Kami's Will pool (from 3rd) | 5 × level hit points per long rest | 30 | EH10 p.166 |
| Tinkerer Creation save DC / attack | 8 + prof + Int / prof + Int | level 4, Int 16: 13 / +5 | EH10 p.180 |
| Tinkerer Recharging | once a day, slot levels up to ceil(level / 2) | 2 | EH10 p.182 |
| Oracle Spell save DC / attack | 8 + prof + Wis / prof + Wis | level 5, Wis 16: 14 / +6 | EH10 p.158 |
| Marksman Tactic save DC / attack | 8 + prof + Wis / prof + Wis | level 6, Wis 14: 13 / +5 | EH10 p.142 |
| Marksman Hawk-Eyed | proficiency doubled for Perception (when proficient) | Wis 14, level 6: +8 | EH10 p.141 |
| Marksman Lock-On | v10: 2d4, 3d4 at 6th, 4d4 at 14th. v8.8: 1d4, 2d4, 3d4. + Wis from 6th (Greater Lock-On) | level 6: 3d4 + 2 (v8.8 2d4 + 2) | EH10 p.142 |
| Marksman Fighting Style (pick 1) | v10: Improved Aiming +3 ranged hit; Sharpened Shot + 2 × prof damage, two-handed ranged; Close Quarters Shooter +1 ranged hit. v8.8: Aiming +2 hit; Sharpened Shot +2 damage, ranged | musket, Dex 18, level 6: +10, or 1d10 + 10 | EH10 p.142 |
| Marksman Extra Attack | 2 from 5th; 3 from 14th (v10 only) | — | EH10 p.143 |

## Conqueror (both versions)
| Number | Formula | Sample | Page (v10) |
|---|---|---|---|
| Leadership Dice | number and die from the table; short rest | level 5: 4 × d8 | EH10 p.106 |
| Command Stances, on switching (v10 only) | 1d4 force damage this turn; temporary HP = Wis | Wis 14: 2 temp HP | EH10 p.106 |
| Coordinated Assault | costs 2 Leadership Dice | — | EH10 p.107 |

## Renegade (v10) and Rogue (v8.8)
| Number | Formula | Sample | Page |
|---|---|---|---|
| Renegade Press the Attack (from 5th) | stacks up to ceil(level / 2); +1 hit per stack up to +3; +1d4 damage per stack | level 8, 4 stacks: +3 hit, 4d4 | EH10 p.172 |
| Renegade Fast Talker | +1d4 to Persuasion and Deception | — | EH10 p.172 |
| Rogue Sneak Attack | dice from the Rogue table | level 1: 2d6; level 20: 12d6 | EH8.8 p.177 |
| Slippery Mind (15th, both) | proficiency in Wisdom saves | — | EH10 p.173 |

## Warrior (both versions)
Sample: Warrior 8 — Str 18, Dex 12.
| Number | Formula | Sample | Page (v10) |
|---|---|---|---|
| Strike save DC (Dashing, Crescent, Hawk Strike) | 8 + prof + the higher of Str and Dex | 15 | EH10 p.202 |
| Second Wind | 1d10 + level | 1d10 + 8 | EH10 p.201 |
| Action Surge | 1 use per short rest; 2 from 17th | 1 | EH10 p.201 |
| Execute | v10: Execute Dice column. v8.8: 2d8. Prof uses per long rest | v10 3d6 | EH10 p.201 |
| Dashing Strike / Crescent Strike | 2d8 + Str / 3d6 + higher of Str and Dex | 2d8 + 4 / 3d6 + 4 | EH10 p.202 |
| Extra Attack | 2 from 5th, 3 from 11th, 4 from 20th | 2 | EH10 p.202 |
| Aura of Endurance (v10) | ceil(prof / 2) to saves | +2 | EH10 p.202 |
| Fighting Style (pick 2) | Defense +1 AC in armor; Mariner +1 AC without heavy armor or shield; Aiming +1 ranged hit (v8.8: +2); Close Quarters Shooter +1 ranged hit; Interception 1d10 + prof | chain mail + Defense: AC 17 | EH10 p.201 |

## Subclasses the sheet applies
Tested in `packages/engine/test/subclasses.test.ts`. "Switch" means a toggle on the sheet: the number only counts while it is on.

| Subclass, feature | Effect | Page |
|---|---|---|
| Hybrid, Beast Lineage: Prototype Augmentations | +2 AC | EH10 p.134 · EH8.8 p.138 |
| Hybrid, Germa Lineage: Combat Exoskeleton | AC 13 + Str with no armor; +1 hit point per hybrid level | EH10 p.137 · EH8.8 p.142 |
| Hybrid, Seraphim Lineage: S-Defensive Protocol (6th) | AC 13 + Con with no armor | EH10 p.139 · EH8.8 p.145 |
| Hybrid, Mother Flame: Void Awakening | AC 15 + Wis with no armor | EH8.8 p.143 |
| Priest, Infernal Domain: Fiendish Skin | AC 10 + prof + Wis with no armor | EH10 p.169 · EH8.8 p.174 |
| Martial Artist, Combustion Boxer: Toughened Body (11th) | Unarmored Defense becomes 10 + Dex + Wis + Con | EH10 p.153 · EH8.8 p.158 |
| Martial Artist, Black Leg Style: Black Leg Combatant | switch: + ceil(prof / 2) AC with no weapon or shield | EH8.8 p.157 |
| Martial Artist, Black Leg Style: Sky Step (6th) | +10 ft walking speed | EH10 p.152 · EH8.8 p.157 |
| Virtuoso, School of Battlehymn: Battle Proficiencies | +2 hit points per virtuoso level | EH10 p.196 |
| Battlehymn: Fury of the Battlehym / Extra Attack (6th) | 2 attacks per Attack action | EH10 p.196 · EH8.8 p.186 |
| Marksman, Gunslinger: Quick-draw | + Wis to initiative (never a penalty) | EH10 p.145 · EH8.8 p.151 |
| Marksman, Gunslinger: Iron Mind (7th) | proficiency in Wisdom saves | EH10 p.145 · EH8.8 p.151 |
| Swashbuckler: Better’s Hand (Renegade) / Rakish Audacity (Rogue) | + Cha to initiative | EH10 p.178 · EH8.8 p.182 |
| Tinkerer, Military Science: Tactical Mind | + Int to initiative | EH10 p.186 · EH8.8 p.195 |
| Tinkerer, Military Science: Durable Tech (10th) | switch: +2 AC while concentrating | EH10 p.186 · EH8.8 p.195 |
| Devilforged, Devil Blade: Hell’s Duelist | switch: +1 AC with an infused melee weapon | EH10 p.121 |
| Devilforged, Devil Bulwark: Defenders Leap (6th) | switch: +1 AC with the infused shield, +2 at 10th, +3 at 14th | EH10 p.123 |
| Devilforged, Gear Smithing: Armored Up | switch: +1 AC with the infused item | EH8.8 p.121 |
| Conqueror, Warmonger: Warmonger’s Rage (6th) | switch: +10 ft speed, +30 ft from 16th (Warmonger’s Fury) | EH10 p.111 · EH8.8 p.110 |
| Renegade, Circus Tricks: Trick Rider | switch: +25 ft speed on the prop | EH10 p.176 |
| Warrior, Cursed Soul: Silver Mist (15th) | switch: +2 AC | EH10 p.204 · EH8.8 p.202 |
| Warrior, Ryuo Samurai: Ryuo Master (18th) | switch: +2 to attack and damage rolls | EH10 p.207 · EH8.8 p.207 |
| Bruiser, Drunken Dragon: Liquid Courage, Sorrowful Stagger | switch: −10 ft speed | EH10 p.90 · EH8.8 p.90 |
| Marksman, Beast Tamer: Bonded Companion | expertise in Animal Handling (v10); proficiency (v8.8) | EH10 p.144 · EH8.8 p.150 |
| Martial Artist, Wano Ninpo: Shadow Budoka | expertise in Stealth | EH10 p.156 · EH8.8 p.161 |
| Wordsmithing: Perfectly Placed Words | expertise in Persuasion | EH10 p.199 · EH8.8 p.189 |
| Warrior, Kuja Huntress: Snake Companion | expertise in Acrobatics and Survival | EH10 p.204 · EH8.8 p.205 |
| Oracle, Voices of the Past: Ancestral Echoes | proficiency in History | EH10 p.163 · EH8.8 p.168 |

"You gain expertise in X" is read as proficiency with the bonus doubled, whether or not the character had the proficiency already.
Standing resistances, immunities and advantages a subclass gives are listed on the sheet under "In effect" (word for word in the feature); they change no number.
Dice named in a feature's text ("takes 2d8 fire damage") become roll buttons on that feature automatically; these are marked `auto: ["rolls"]` in the data.

## Multiclassing (both versions)
| Number | Formula | Sample | Page |
|---|---|---|---|
| Proficiency, Willpower, Dream Points | from total character level | Bruiser 5 / Warrior 3: prof +3, Willpower 8 | EH10 p.209 (EH8.8 p.208) |
| Hit points | first class: die maximum at its 1st level; every other level of any class: average (or roll); Con × total level | Bruiser 5 / Warrior 3, Con 16: 12 + 4 × 7 + 3 × 6 + 3 × 8 = 82 | EH10 p.209 |
| Hit dice | each class's dice, pooled | 5d12 + 3d10 | EH10 p.209 |
| Saving throws | from the first class only | — | EH10 p.209 |
| Armor, weapon, tool proficiencies | all of the new class's | — | EH10 p.209 |
| Class features | each at its own class level | Second Wind 1d10 + 3 for Warrior 3 | EH10 p.209 |
| Extra Attack | doesn't add together: the highest count applies | 2 | EH10 p.210 |
| Armor Class | one way of calculating it at a time: the best | Martial Artist 5 / Bruiser 1: 16, not 15 | EH10 p.210 |
| Spell slots, Priest + Skald (Virtuoso) + Tinkerer | add those classes' levels; read the Multiclass Spellcaster table | Priest 3 / Tinkerer 2: 4 / 3 / 2 | EH10 p.210; table SRD |
| Spell slots, any other casters | each class's own table; slots of the same level are one pool | Chemist 3 / Oracle 2: 7 first-level, 2 second-level | EH10 p.210 |
| Prerequisites | ability scores from the table, for every class; a warning, never a block. Hybrid can't be multiclassed into | Bruiser: Str 13 and Con 13 | EH10 p.209 (EH8.8 p.208) |

## Feats the sheet applies (both versions)
| Feat | Effect | Page |
|---|---|---|
| Alert | +5 initiative | EH10 p.52 |
| Mobile | +10 ft speed | EH10 p.59 |
| Tough | +2 hit points per level | EH10 p.64 |
| Big Eater | counts as one size larger for carrying: × 2 | EH10 p.53 |
| Armor Breaker, Assassin's Strike, Boarding Cutlass, Harvest the Weak, Saber Dance | +1 to attack rolls with maces, shortswords, cutlasses, sickles, sabers | EH10 p.52–61 |
| Whirling Blades | +1 damage with scimitars | EH10 p.65 |
| Any feat, trait or feature that says "you gain proficiency in X" for named skills | proficiency in those skills | — |

A feat's "+1 to an ability score" is not applied: ability scores are entered as final values.

## Rests
- Short: choose HD to spend → roll each + Con → heal; refill short-rest uses, Special Reactions, Healing Surge, Fury (confirm 30 min training).
- Long: HP = max, temp HP cleared, ALL spent HD back (ruling), all short+long uses, exhaustion −1, Undying Frenzy DC → 10.
- Dawn: Devil Fruit charges, Zoan Beast Form uses, per-day features.
- Level up: recompute all; Dream Points = new level; Willpower +1.

## Ships (DM Guide, PDF pages) — sample Caravel
| Number | Formula | Sample | Page |
|---|---|---|---|
| Ship ability mod | as characters; score 0 auto-fails | Str 18 → +4 | DMG p.11 |
| Component damage | damage ≥ threshold → all of it; below → none | 12 vs 10 → 12 | DMG p.13 |
| Sail speed | base − 5 ft per full 25 damage (also into/with wind) | 35 → 30 (10/45) | DMG p.15 |
| Short-handed | crew ≤ half max → half speed, floor(weapons / 2) usable | 8: full; 4: 1 of 3 | DMG p.15 |
| Crew count | ≤Medium 1, Large 4, Huge 9, Gargantuan 20+ | 8 | DMG p.11 |
| Cramped | aboard > crew max + passengers → deck movement halved | > 18 | DMG p.11 |
| Over cargo | half speed, disadvantage maneuvering, may capsize | 3.2 / 10 t | DMG p.11 |
| Upgrade slots | sum of installed slots ≤ ship slots (warn, don't block) | 3 / 5 | DMG p.18–30 |
| Travel | days = miles ÷ (pace × 24) | 240 ÷ 96 = 2.5 | DMG p.15 |
| Rations | days = rations ÷ people aboard | 120 ÷ 8 = 15 | — |
| Ship's soul | per voyage, crew roll (DC 10 Large/Huge, 15 Gargantuan); > half succeed = 1; 3 = sentient | 1/3 | DMG p.11 |

## Devilforged v8.8 (example: Marlo, Devilforged 5, Blade Smithing, Cha 18)
| Number | Formula | Marlo | Page (v8.8) |
|---|---|---|---|
| Power save DC / attack | 8 + prof + Cha / prof + Cha | 15 / +7 | EH8.8 p.113 |
| Slots | table: L5 → 2 slots of 3rd, short rest | 2 × 3rd | EH8.8 p.112 |
| Known | cantrips 3, powers 6, emanations 4 at L5 | — | EH8.8 p.112 |
| Hell's Duelist weapon | Cha for attack and damage | — | EH8.8 p.116 |
| Zoan Infusion | +rarity modifier (Uncommon +1) attack & damage; reach +5 ft; summoned beast acts after you, non-elemental damage = weapon type, gains the weapon attack | katana +8, 1d8 + 5 | EH8.8 p.114–115 |
| Bestial Summon | summoned beast +1 attack, damage, AC | — | EH8.8 p.128 |
| Zoan Mount | ridden: walk 60 ft, Dash as bonus action | — | EH8.8 p.129 |
| Devil's Branding | +prof damage vs target, crit 19–20, heal level + Cha on its death; 1/short rest | +3, heal 9 | EH8.8 p.116 |
