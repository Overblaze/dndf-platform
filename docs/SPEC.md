# DnDF Platform — product spec

Source of truth for planning is the "DnDF Character Platform — Playbook" doc; this file is its build-relevant summary. Visual concept: "DnDF Character Sheet Concept" (9 boards) — match it.

## Source books (PDFs stay in ~/dndf/sources, never in git)
| Book | Use | Page note |
|---|---|---|
| DnDF Expanded Handbook v10 (373 pp) | races, classes, backgrounds, feats, crew roles, Haki, fruit rules, armory, spell lists | printed = PDF page |
| DnDF Expanded Handbook v8.8 (436 pp) | same for 8.8 players + ~93 fruits (pp 252–329, SECRET) | printed = PDF page |
| Expanded Devil Fruit Encyclopedia v1.2 (234 pp) | ~336 fruits (SECRET), charge tables, Zoan rules, fruit surges | printed = PDF page |
| Original Devil Fruit Encyclopedia (148 pp) | ~20 fruits not elsewhere (SECRET) | printed = PDF page |
| DnDF DM Guide (112 pp) | bounty p107, reputation p7, ships pp11–37 (crew, components, upgrades, officers) | cite PDF pages; printed differ |
| Original DnDF PHB (221 pp) | only Mounts & Vehicles p148, Crew Factions p137 are unique | printed = PDF page |
| Volo's Guide to Monsters (owner's copy) | 6 Zoan stat blocks (Cow, Ox, Rothe, Stench Kow, Aurochs, Martial Arts Adept) — LICENSED, private table only | PDF = printed + 1 |
| 5e SRD 5.1 (CC-BY) | core rules, conditions, SRD spell text | — |

v8.8 vs v10: creation rules, crew roles, backgrounds identical; races/feats/most classes 93–99% same (store once + per-version overrides); Conqueror, Hybrid, Warrior, Tinkerer differ 70–84%; Rogue(8.8)→Renegade(10) and Devilforged are reworked (separate entries); Skald(8.8)→Virtuoso(10) mostly a rename. v10 adds Void Century Automaton, Tinkerer Professions, Alternative Multiclassing, three Meito grades.

## Data schema (see data/rules/dndf-10/bruiser.json, the reference example)
Entry: `id`, `kind` (class, subclass, optionGroup, race, subrace, background, feat, crewRole, dream, hakiFeature, surgeAdvancement, devilFruit, item, spell, beast, shipType, shipUpgrade), `versions`, `source {book,page}`, word-for-word `text`/`flavor`, plus structured: `effects` (with `when`), `uses {max, recharge}`, `toggle`, `trackers`, `formulas`, `progression.columns`, `choices`. Identical content = one entry tagged with both versions; changed = per-version copy or `overrides` keyed by version.

## Final product
- **Live sheet** (desktop + phone): HP/temp HP with damage/heal buttons, AC, init, speed, prof, hit dice, Willpower and DCs, abilities/saves/skills, actions grouped Action/Bonus/Reaction/Special Reaction with one-tap rolls and breakdowns, resources and trackers, toggles that apply effects, conditions/exhaustion/death saves (Dream Point rescue, "I Won't Abandon My Dreams" d20), Haki by color and tier, Devil Fruit card (only if granted), inventory, crew role, dream, bounty + wanted poster, notes. Word-for-word text on tap.
- **Rests**: short (spend hit dice rolled for you; short-rest uses; Special Reactions; Healing Surge; Fury needs 30 min training confirm), long (full HP, all hit dice, long-rest uses, exhaustion −1), dawn (fruit charges, Zoan uses). Preview before applying.
- **Level up** wizard with undo; **new character wizard** at any level 1–20 following the book's 12 steps (v10 p9–10): builds the full list of required choices from the class table(s), progress count, "Waiting for DM" for fruits, drafts.
- **Build editor**: standard / override (swap features across classes) / custom class; add or remove any feature; borrowed features bring their resources; custom feature builder; History with undo.
- **Spirit Surges any time**: "+ Spirit Surge" on every sheet; rarity Common(Amateur)…Legendary; tabs Standard(11) Armament(20) Observation(20) Supreme King(24) Devil Fruit(22 v10 / 21 v8.8) Amateur(9); greys out options above rarity or missing prerequisites; previews changed numbers; logs rarity/reason/session; undo.
- **Devil Fruit secrecy**: fruits, generation tables, fruit surges, DM chapters, licensed stat blocks in RLS-protected tables; DM grants a fruit to a character → only owner + DMs can read it; others see "unknown" until Reveal; appraisal grants.
- **Inventory**: personal (owner edits, carry capacity) vs ship hold (shared, tons, crew treasury); transfers logged.
- **Ship sheet**: DM Guide types; editable everything; components (hull/helm/sails/weapons) with AC, HP, thresholds; crew/passengers; short-handed rule; upgrades purchased / DM gift / custom; voyage calculator; ship's soul.
- **Discord bot**: /sheet (PDF, public redacts secrets), /roll, /hp, /rest, /dawn, /status, /party; later /surge, /bounty, /ship.

## Roadmap (each phase depends only on earlier ones)
1. Foundation — scaffold, Discord sign-in, DB + RLS, DM bootstrap, CI/deploy, schema + validator. Check: Matt signs in on the live site as DM.
2. Engine + live sheet — every FORMULAS.md row tested; built on the Bruiser. Check: Kaito matches FORMULAS.md.
3. Extract all rules (both versions) — validator + engine tests.
4. Builder, level-up, build editor, custom features.
5. Discord bot + printable sheet.
6. Haki, Spirit Surges, Devil Fruits (secret data load, grants).
7. Inventory, gear, spells.
8. Ship and crew, bounty, DM party view.
9. Polish — offline PWA, export/import, /surge /bounty /ship, version-switch report.
