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
| Weight carried | sum of count × weight of each item not stowed; more than carrying capacity is said under "In effect" and changes no number | 12 lb of 225 lb | EH10 p.10 |
| Temp HP | don't stack (keep higher); damage hits temp first; HP clamps 0..max | — | — |

## DnDF
| Number | Formula | Kaito | Page |
|---|---|---|---|
| Willpower | 1 at L1, +1 per level gained; Strengthen Self +2 (v10 only: in v8.8 it raises an ability score, not Willpower); total capped at 20 (Strengthen Self included). Variant: 0 + 1 per Spiritual Advancement | 7 | EH10 p.221–222 |
| Haki save DC | 10 + ceil(Willpower / 2) | 14 | EH10 p.221 |
| Haki attack (table ruling; custom/original-PHB features only) | 2 + ceil(Willpower / 2) | +6 | — |
| Haki tier per color | T2 at 4 features of that color, T3 at 6; Amateur (Common) don't count | — | EH10 p.221 |
| Haki Purist | picks at 4, 10, 16 (v8.8: 4, 8, 12, 16, 20); lost on gaining a Devil Fruit | — | EH10 p.221 |
| Haki Purist: Train Quality | each pick: +1 die on every Haki roll button | Force of Will 5d10 → 6d10 | EH10 p.221 |
| Haki Purist: Train Stamina | each pick: +1 use on Uncommon and Rare Haki features; v8.8 only: also Very Rare for a pick from 12th level on, and Legendary for the 20th-level pick (picks count in the order taken) | Force of Will 1 → 2 | EH10 p.221 · EH8.8 p.221 |
| Haki feature count per Color | features of that Color, Amateur left out; overridable, because Haki from a class or subclass counts too | — | EH10 p.221 |
| Amateur Haki | from character level 5 an Amateur feature is its Uncommon variant, and counts toward the tier | Fortitude → Aura of Life | EH10 p.221 |
| Haki dice | "N dS + a number of dS equal to half / a quarter of your Willpower (rounded up)" → (N + ceil(Willpower ÷ 2 or 4)) dS; "equal to your Willpower" → Willpower dS | WP 8: Spirit Emission 6d10, Force of Will 3d10 | EH10 p.223–240 |
| Aura of Life / Fortitude | 1d6 + ceil(Willpower / 2) + level temporary HP / 1d4 + level | WP 8, L8: 1d6 + 12 | EH10 p.223 |
| Soul Armor (switch) | AC = min(20, 10 + prof + ceil(Willpower / 2)), without armor | WP 8: 17 | EH10 p.223 |
| Dark Armor (switch) | AC is at least 5 + Willpower | WP 12: 17 | EH10 p.226 |
| Clairvoyant Strike (switch) | + Willpower to attack rolls | — | EH10 p.229 |
| Weapon Hardening, Conqueror’s Coating | shown: + ceil(Willpower / 4) to attack and damage with the coated weapon | WP 8: +2 | EH10 p.224 |
| Enhanced Strike / Focused Hit | the weapon's own die one size larger, up to d12 / d8 (Focused Hit once per turn, noted on the attack); never a class feature's die | 1d8 → 1d10 | EH10 p.223 |
| Instinctual Awareness / Spirit Sense | passive Perception +2 / +8 | — | EH10 p.227–228 |
| Strengthen Self (surge) | +2 to one ability score, max 20; v10: or +2 Willpower | — | EH10 p.222 |
| Career Advancement | proficiency in a skill, or expertise when already proficient | — | EH10 p.222 |
| Muscle Memory | one feature's uses × 2 | — | EH10 p.222 |
| Improve Special Reactions | +1 use of every Special Reaction, each time taken | — | EH10 p.222 |
| Spirit Surge options | held back (greyed, never refused) when: rarer than the surge; taken and not repeatable; Tier 2 / 3 feature without that tier in its Color; a named prerequisite, level range, Qualities of a King or spellcasting is missing | — | EH10 p.221 |
| Devil Fruit save DC | 10 + ceil(Willpower / 2) | 14 | EH10 p.242 |
| Devil Fruit attack | 2 + ceil(Willpower / 2) | +6 | EH10 p.242 |
| Paramecia charges | L1–2: 2, then = level (max 20); highest spell level ceil(level/2), max 9 | L7: 7, 4th | EDFE p.8 |
| Logia charges | 2,2,3,3,4,4,5, then level − 2 (18 at 20); highest spell 2nd at L1, ceil((level+2)/2), max 9 | L7: 5, 5th | EDFE p.11 |
| Upcast fruit spell | +1 charge per level above base, up to highest level | — | EDFE p.8 |
| Zoan (eater) | human form: matching score + ceil(beast mod/2) (max 20); Beast Form uses = prof per dawn; lasts ceil(level/2) h | 3 uses, 4 h | EDFE p.9–10 |
| Power penalty variant | Very Rare Paramecia/Logia −2 max charges; Legendary/Infernal −3 | — | EH10 p.250 |
| Granted fruit on the sheet | held fruit: every feature, its spells and its awakening become features with the book's words; dice named in the text become roll buttons; Paramecia / Logia get "Devil Fruit charges" from the tables above and Zoan gets "Beast Form" uses, all back at dawn; Fruit DC and attack shown. A fruit only known about is text to read | — | EDFE p.8–11 |
| Haki Purist with a fruit | every pick stops counting while a fruit is held (kept in the save, so it returns if the fruit is taken away) | — | EH10 p.221 |
| Fruit advancement prerequisites | only the fruit type a prerequisite names is judged (greyed, never refused); the rest is shown as written | — | — |
| Dream Points | = level, reset on level-up; +1d6 to attack/check/save after roll, or turn a failed death save into a success | 7 | EH10 p.11 |
| I Won't Abandon My Dreams | on death d20 ≥ 12 → 1 HP; exhaustion-6 death → exhaustion 5 | — | EH10 p.11 |
| Healing Surge (ruling) | spend up to max(1, floor(total HD / 2)), ≤ remaining; each die + Con; once per short/long rest | up to 3 | EH10 p.11 |
| Special Reactions | 2 per round; each usable prof times per short rest; Parry Blow / Deflect Projectile −(1d10 + level) | 3 each | EH10 p.11 |
| Pirate Prestige max | ceil(level / 2); MVP +1d4 | 4 | EH10 p.12 |
| Bounty (suggestion; player-editable) | L²×฿1M + crewmates×฿1M + fruit rarity lvl×฿10M + top Haki rarity lvl×฿10M + minor deeds×฿10M + major×฿100M + ship Con×฿1M + extra ships×฿10M + plunder×2 + civilians×฿100K + cities×฿10M + navy ships×฿10M + nobles×฿100M (Uncommon 1 … Legendary 4) | 49+8+10+30+15 = ฿112M | DMG p.107 (PDF page) |
| Bounty on the sheet | level, the rarity of the strongest Haki feature and of a held Devil Fruit are read from the sheet; the other parts are counted by the player. A sheet derived without the private content leaves the fruit out. The player's own number replaces the total. A wanted poster keeps the bounty, epithet and terms as they were when it was issued | — | DMG p.107 |

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
| Warrior fighting style: Dueling | +2 damage with a melee weapon that is not two-handed (a second weapon in the other hand is the player's to discount) | 1d8 + 5 | EH10 p.201 |
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

### Subclass pools and dice
| Subclass, feature | Pool | Die or amount | Page |
|---|---|---|---|
| Warrior, Ryuo Samurai: Ryuo Training | 2 × prof, long rest | d6, d8 at 5th, d10 at 11th, d12 at 17th; Ryuo save DC 8 + prof + Str | EH10 p.207 · EH8.8 p.207 |
| Warrior, Cursed Soul: Champion of Malice | 2 × prof Cursed Spirit dice, long rest | d6, d8 at 5th, d10 at 11th, d12 at 17th; Curse save DC 8 + prof + Int | EH10 p.203 · EH8.8 p.202 |
| Warrior, Ramen Kenpo: Apprentice Chef | — | Ramen Die d4, d6 at 7th, d8 at 10th, d10 at 15th, d12 at 18th; Ramen save DC 8 + prof + Con | EH10 p.206 · EH8.8 p.206 |
| Warrior, Ramen Kenpo: Home Cooking | 2 × prof dishes, short rest | 1 Ramen Die + ceil(level / 2) temporary hit points; one more die at 10th, 15th and 18th | EH10 p.206 · EH8.8 p.206 |
| Oracle, Eyes of the Future: Dice of Eternity | prof, short rest | d6 at 5th, d8 at 9th, d10 at 13th, d12 at 17th | EH10 p.160 · EH8.8 p.165 |
| Oracle, Occult Sigilist: Sacrificial Sigil Creation | 2 × prof sigil dice, long rest | d4, d6 at 5th, d8 at 11th, d10 at 17th | EH10 p.161 · EH8.8 p.166 |
| Oracle, Soul of the Present: Soul Aura | prof, long rest; 2 × prof from 11th (Sustained Vitality) | Wis + level temporary hit points (minimum 1) | EH10 p.162 · EH8.8 p.167 |
| Priest, Cherry Blossom Domain: Calming Branches | prof, long rest (one use back on a short rest, by hand) | — | EH10 p.167 · EH8.8 p.172 |
| Martial Artist, Six Powers: Shave | prof, long rest | — | EH10 p.155 |
| Bruiser, Drunken Dragon: Drunken State | 5 beverages, long rest | — | EH10 p.89 |
| Devilforged, Devil Bombardier: Devilbomb Creation | prof bombs, long rest | — | EH8.8 p.117 |
| Devilforged, Firearm Smithing: Hellfire Artillery | prof, long rest | — | EH8.8 p.120 |
| Chemist, Cryochemist: Icy Fortitude | prof, long rest | level + Wis temporary hit points | EH10 p.98 · EH8.8 p.98 |
| Martial Artist, Black Leg Style: Stylish Boost | once per short rest | ceil(level / 2) temporary hit points (v10); level (v8.8) | EH10 p.152 · EH8.8 p.157 |
| Devilforged, Devil Bulwark: Improved Bulwark Stance | — | 2 × level temporary hit points | EH10 p.123 |
| Conqueror, Warmonger: Warmonger’s Rage | once per long rest | level hit points when you drop a creature | EH10 p.111 · EH8.8 p.110 |
| Hybrid, Germa Lineage: Cell Regeneration | 1 hybrid point | Str modifier hit points | EH10 p.137 · EH8.8 p.142 |

Every other "a number of times equal to your proficiency bonus / X modifier … per rest" and "once … until you finish a rest" sentence in a subclass feature is read automatically into a counter (`auto: ["uses"]`).

### Choices inside a subclass
Picked in the character form; only the chosen options appear on the sheet. Picking more than the book allows warns and never blocks.

| Subclass, feature | Pick | What each option adds | Page |
|---|---|---|---|
| Hybrid, Germa Lineage: Genetic Superpower | 1 of 5 | Poison Pink: 1d6 acid, Poisonous Kiss prof / long rest, poison immunity. Stealth Black: 1d6 fire, Optical Camouflage max(1, Dex) / long rest. Winch Green: 1d8, Str + 2 (max 22), carrying × 8. Dengeki Blue: 1d6 lightning, speed + 10 × prof. Sparking Red: 1d6 radiant | EH10 p.136 · EH8.8 p.141 |
| Marksman, Rope Master: Rope Tricks | 2, 3 at 7th, 4 at 15th | each trick 2 × prof uses per short rest | EH10 p.146 · EH8.8 p.152 |
| Devilforged, Mechadevil: Mechadevil Mark 2 | 2, 3 at 10th, 4 at 14th | each weapon system prof uses per short rest, with its own damage dice | EH10 p.125 |
| Chemist, Botany: Field Invention Powers | 1 land of 8 | that land's table of powers | EH10 p.97 · EH8.8 p.97 |
| Tinkerer, Steamtech: Steamtech Devices | 2, 3 at 6th, 4 at 10th, 5 at 14th, of 10 | each device spends its Pressure Gauge Point cost (1, 2 or 3) | EH10 p.189 · EH8.8 p.198 |

### Steamtech and Power Surges
| Rule | Formula | Page |
|---|---|---|
| Pressure Gauge Points | 5 at 2nd, 10 at 6th, 15 at 10th, 20 at 14th; all back on a long rest | EH10 p.188 · EH8.8 p.197 |
| Device upcasting | +1 spell level at 6th, +2 at 10th, +3 at 14th, each +1 PGP (paid by hand) | EH10 p.189 · EH8.8 p.198 |
| Power Surges (Military Science, 6th) | hold up to max(1, Int); spend one for extra force damage equal to Tinkerer level | EH10 p.186 · EH8.8 p.195 |

Power Surges "reset to one" on a long rest and are gained in play; the sheet keeps the count and the player sets it.

"You gain expertise in X" is read as proficiency with the bonus doubled, whether or not the character had the proficiency already.
Standing resistances, immunities and advantages a subclass gives are listed on the sheet under "In effect" (word for word in the feature); they change no number.
Dice named in a feature's text ("takes 2d8 fire damage") become roll buttons on that feature automatically; these are marked `auto: ["rolls"]` in the data.

## Class features that spend a pool (both versions unless noted)
Tested in `packages/engine/test/classgaps.test.ts`.

| Class, feature | On the sheet |
|---|---|
| Martial Artist: Ki-Fueled Attack, Heart, Crown, Third Eye and Death Chakra | spend 1, 2, 1, 3 and 4 ki; Heart heals a Martial Arts die + prof; Death rolls four Martial Arts dice; Third Eye is a switch for its resistance |
| Martial Artist: Crown Chakra (14th) | proficiency in every saving throw |
| Hybrid: Power Enhancements, Flash Augment, Resilience Augment, Chain Channeling | spend 1, 2, 1 and 2 Hybrid Points |
| Hybrid: Power Immunity (10th) | once per short or long rest (EH8.8 p.138; the v10 page, EH10 p.132, cuts the sentence off, so v10 uses the v8.8 wording by table ruling) |
| Conqueror: Conqueror’s Command, Empower Conqueror’s Haki | spend a Leadership Die and roll it |
| Virtuoso / Skald: Empowering Melody | switch: +1 to hit and damage with the harmonic weapon, +2 at 8th, +3 at 14th; the same number added to spell damage and healing |
| Oracle: Enhanced Divination | once per long rest |
| Renegade (v10): Fast Talker | 1d4 added to a Persuasion or Deception check |

Death Chakra's cost rises by 2 each use until a rest; the sheet spends 4 and the rest is taken by hand.

## Companions
Tested in `packages/engine/test/subclasses.test.ts`. A companion's own stat block (the chosen beast or Zoan form) is not on the sheet; these are the numbers that come from the character, shown on the feature.

| Companion | What the sheet works out | Page |
|---|---|---|
| Marksman, Beast Tamer: bonded beast | hit points added: level × prof; highest CR 1/2, 1 at 5th, 2 at 9th, 4 at 13th, 8 at 17th; extra damage dice 0 / 1 / 2 / 3 / 4 at the same levels; shares your proficiency bonus | EH10 p.144 · EH8.8 p.150 |
| Devilforged, No Mi Trainer: Bloodline Beast | hit points 2 × Int + 5 × level (v10), 2 × Cha + 5 × level (v8.8), kept as a pool that returns on a long rest; hit dice: level d8; save DC is yours | EH10 p.126 · EH8.8 p.123 |
| Devilforged, Mechadevil: the suit (v8.8) | AC 16 / 17 / 18 / 19 and speed 30 / 35 / 40 / 50 ft. at levels 1, 5, 11, 17; hit points 6 / 8 / 10 / 12 × level, kept as a pool | EH8.8 p.121 |
| Devilforged, Mechadevil: Elemental Blast (v10) | 1d10 + Int, 2d10 at 5th, 3d10 at 11th, 4d10 at 17th | EH10 p.125 |
| Devilforged, Bestial Klabautermann: Figurehead Form | AC = Devilforged save DC; hit points 2 × level; speed 30 ft. | EH10 p.120 |
| Tinkerer, Robotics: Simple Robot | AC 8 + Int; 1 hit point; speed 30 ft. | EH10 p.188 · EH8.8 p.197 |
| Devilforged, Firearm Smithing: cannon shot | 1d8 + Cha, 2d8 from 10th | EH8.8 p.120 |

## Armor, weapon and tool proficiencies (both versions)
Tested in `packages/engine/test/subclasses.test.ts`. Shown on the Skills tab, each with where it comes from.

| Rule | How the sheet works it out |
|---|---|
| A class's proficiencies | the armor, weapons and tools in its class entry ("all armor" is light, medium and heavy) |
| A subclass feature or feat that says "you gain proficiency with …" | read from the text automatically: armor kinds, shields, simple / martial (melee / ranged) weapons, named weapons, named tools |
| Attack roll with a weapon | adds the proficiency bonus when the character has its category, its category and reach ("martial ranged"), or its name |
| Armor kind | no Dex limit: light; Dex limit above 0: medium; no Dex: heavy |
| Armor or shield without proficiency | noted under "In effect" (disadvantage on Strength and Dexterity checks, saves and attack rolls; no spellcasting — SRD); never blocks, and the form can overrule it |

Not read: a proficiency that is a choice ("one tool of your choice", "four weapons of your choice"), and racial traits. In a multiclass build every class's full list is counted.

## Starting ability scores (the builder)
Tested in `packages/engine/test/abilityScores.test.ts`.

| Method | Rule | Page |
|---|---|---|
| Roll | four d6, total of the highest three, six times; give each total to an ability | EH10 p.10 · EH8.8 p.10 |
| Standard array | 15, 14, 13, 12, 10, 8, one to each ability | EH10 p.10 · EH8.8 p.10 |
| Point buy | 27 points; every score from 8 to 15; cost 0, 1, 2, 3, 4, 5, 7, 9 | standard 5e variant, not printed in the DnDF handbooks |
| Final score | the method's number + what race, improvements and feats add | — |

Nothing is refused: an unassigned number or overspent points is said in a notice. The method, the rolls and the bonuses are kept on the character (`scoreOrigin`); `scores` is what the sheet uses.

## Gaining a level
Tested in `packages/engine/test/levelUp.test.ts`.

| Rule | Formula |
|---|---|
| Hit points for the level | half the class's hit die + 1, or the die as rolled; + Constitution modifier |
| A new class's first level | the same (only the character's very first level takes the die's maximum) |
| Hit points gained | the change in the hit point maximum, so a higher Constitution, Tough or a level-20 feature reaches back over earlier levels; added to current hit points |
| Ability Score Improvement | at the class's improvement levels: +2 to one score or +1 to two, or a feat; nothing is capped, a score over 20 is flagged |
| Dream Points | reset to the new level |
| Multiclass prerequisites | warned about when taking a first level in another class; never blocked |

A character levelled one level at a time from 1 to 20 has the same hit point maximum as one built at that level (checked for every class in both handbooks).

## Custom and borrowed features
Tested in `packages/engine/test/customFeatures.test.ts`.

| Rule | How the sheet works it out |
|---|---|
| A player's own feature | its text is the player's words; its flat bonuses (AC, speed, initiative, hit point maximum, attack, damage) join the totals and are named in each breakdown; it can have a use counter (short or long rest), roll buttons, a standing note, and a switch |
| A borrowed feature | any feature or option in the handbook, outside the character's classes; expressions that read a level use the whole character level against the table of the class it comes from |
| What a borrowed feature brings | its own use counter, and the pool it spends (ki, for Stunning Strike) when the character has none, sized for the whole character level |

A class, subclass or option feature can be taken off a character: it leaves the sheet with its counter, its buttons and its numbers, and is listed so it can be put back. Taking one off and borrowing another is a swap.

A borrowed feature the character already has is not doubled. Trackers a borrowed feature reads (Hybrid Points, chords) are not brought along.

## Custom classes
Tested in `packages/engine/test/customClass.test.ts`.

| Rule | How the sheet works it out |
|---|---|
| Hit points and hit dice | the class's own die (d6, d8, d10 or d12), by the same formula as a handbook class |
| Saving throws, armor, weapons, tools | the ones ticked or typed for the class; saving throws count only when it is the character's first class |
| Features | each arrives at the class level it names, with its counter, dice, flat bonuses, note and switch |
| Improvements | at the levels listed for the class (4, 8, 12, 16, 19 unless changed) |

A custom class levels up and multiclasses like any other. It has no subclasses, class table columns or option lists.

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
| Ship speed on the sheet | the fastest movement component that still works, less its own damage loss; then halved (rounded down) if short-handed, and halved again if over cargo capacity | Caravel 35 → 25 after 60 damage to the sails | DMG p.11, 15 |
| Upgrade price | flat price + the book's percentage of the ship's own cost | Paddle-Wheel on a Caravel: ฿10M + 20% of ฿50M = ฿20M | DMG p.23–27 |
| A component from the book with a count | "Cannon (2)" becomes two components, each with its own hit points | — | DMG p.15 |

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

### Racial traits

Every racial trait is a feature on the sheet with the book's words. Uses, actions and plain dice are read from the wording; the rows below are the numbers that are not.

| Trait | What the sheet does | Source |
|---|---|---|
| Cyborg: Cyborg Upgrades | a list to pick from: v10 2 + 1 at levels 4, 8, 12, 16, 20 (2 + floor(level / 4)); v8.8 1 + 1 at 5, 10, 15, 20 (1 + floor(level / 5)). An upgrade of another says so when the other is not picked. Level-up asks when the count grows | EH10 p.75 · EH8.8 p.75 |
| Cyborg: Steel Skin · Fighting Fish: Thick-Skinned · Automata: Iron Shell | +1 Armor Class | EH10 p.75, 69, 77 |
| Cyborg upgrades | Centaur Form: switch, +10 ft speed, 1 per short rest; Flamethrower, Radical Beam, General Cannon, Advanced Shape-Memory Alloy: 1 per long rest; Propeller Body, Larger Propellers, Night Lens: shown under "In effect" | EH10 p.75 |
| Mink: Animal Characteristics | pick two. Tough Hide +1 AC unless in heavy armor; Fleet Footed +10 ft; Brute Strength Athletics; Opposable Thumbs Sleight of Hand; Leap DC 8 + Str + prof; Ferocity 1 per short rest; Scavenger Resilience 1 per long rest | EH10 p.73 |
| Mink: Beast’s Slash | unarmed strike die at least 1d6 | EH10 p.73 |
| Buccaneer: Sturdy Build | AC 13 + Con without armor | EH10 p.79 |
| Buccaneer: Anchor Throw | 1d12, 2d12 at 5th, 3d12 at 11th, 4d12 at 17th; 1 per short rest | EH10 p.79 |
| Void Century Automaton: Constructed Resilience | AC 15 + Wis without armor | EH10 p.82 |
| Tontatta: Glass Cannon | hit point maximum −2 per level | EH10 p.77 |
| Shark: Bite · Wotan: Wotan Vigor · Yeti: Glacial Grasp | 1d6 + Str piercing · regain 1d12 + Con, 1 per long rest · save DC 8 + prof + Str, prof uses per long rest | EH10 p.70, 78, 82 |

### Spells

| What | Rule on the sheet | Source |
|---|---|---|
| Casting a spell | a cantrip spends nothing; any other spell spends one slot of the level chosen, never lower than the spell's own. With no slot left it still goes ahead and says so | EH10 p.209 (multiclass slots) and each class's Spellcasting feature |
| Save DC, attack modifier, number prepared | from each class's Spellcasting feature (see the class rows above) | — |
| Spell text | only the eleven spells the handbook prints (EH10 p.218–220) have text and roll buttons; every other spell is the name the class list gives, with the player's own notes | EH10 p.211–220 |

### Spells by class (multiclassing, EH10 p.210 · EH8.8 p.209)

| What | Rule on the sheet |
|---|---|
| A class that **prepares** (Priest, Chemist, Tinkerer) | each long rest chooses up to (ability modifier + class level, at least 1) spells from its whole list; only prepared spells are ready, cantrips always are |
| A class that **learns** (Oracle, Virtuoso / Skald, Marksman, Hybrid, v8.8 Devilforged) | knows the number its table gives ("powers / tactics known"); every one is always ready; nothing is prepared |
| Each class on its own | cantrips known, spells known or prepared, and the highest spell level are read from that class's table at **that class's level**, "as if you were a single-classed member of that class" |
| A spell's class | each spell counts for one class and uses that class's ability, save DC and attack modifier. It is the class chosen, else the class whose list it was picked from, else the only casting class |
| Slots | Priest, Skald / Virtuoso and Tinkerer levels are added together and read on the Multiclass Spellcaster table; every other class keeps its own table's slots. Pooled slots can be of a higher level than any class's spells and are then only for casting lower-level spells at a higher level |
| Highest spell level of a class | the highest slot level its own table gives at its level (Hybrid: its "highest spell level" column). A spell above it is flagged, never refused |
| Override | any spell may be given to any class. One that counts for a class but is not on that class's own list is marked * ("override") on the sheet and the printed sheet; it counts toward that class's numbers like any other |
