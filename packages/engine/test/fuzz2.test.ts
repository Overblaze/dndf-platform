// Random characters using everything added in phases 6 and 7 (races and their pick-lists, Haki, Spirit
// Surges, Devil Fruits, gear, spells), in extreme and damaged states, with every action tried on each.
// The seed is fixed, so a failure can be run again.
import { describe, expect, it } from 'vitest';
import * as E from '../src';
import { loadRules } from './load';

describe('random characters with races, Haki, fruits, gear and spells', () => {
  it('600 of them: nothing throws, every number is a number, every pool stays in range', () => {
    let seed = 987654;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)]!;
    const some = <T,>(list: T[], chance: number) => list.filter(() => rnd() < chance);
    const problems = new Map<string, number>();
    const note = (what: string) => problems.set(what, (problems.get(what) ?? 0) + 1);
    const odd = () => pick<unknown>([undefined, null, '', 'x', -1, 0, 1.5, 9999, NaN, Infinity, {}, [], true]);
    let sheets = 0;
    for (const version of ['dndf-10', 'dndf-8.8'] as E.RulesVersion[]) {
      const rules = loadRules(version);
      const all = [...rules.values()];
      const classes = all.filter((e) => e.kind === 'class');
      const races = all.filter((e) => e.kind === 'race');
      const surgeable = all.filter((e) => e.kind === 'hakiFeature' || e.kind === 'surgeAdvancement');
      const items = all.filter((e) => e.kind === 'item');
      const fruitOf = (n: number): E.RuleEntry => ({
        id: `devilFruit.f${n}`, kind: 'devilFruit', name: `Fruit ${n}`, versions: [], source: { book: 'Test', page: pick([1, 0, 300]) },
        rarity: pick(['Rare', 'Legendary', undefined, 7]) as never, type: pick(['Paramecia', 'Standard Zoan', 'Gaseous Logia', 'garbled', undefined, 12]) as never,
        section: pick(['Zoan', '', undefined]) as never, appearance: odd() as never, description: odd() as never, seaWeakness: odd() as never,
        features: pick<unknown>([[{ name: 'A', text: 'Deal 3d6 fire damage and 0d6 and 99d99 and 1d20.', page: 2 }, { name: 'A', text: '', page: 2 }, { name: '', text: 'x' }, null, 'str', { text: 5 }], undefined, 'nope', []]) as never,
        spells: pick<unknown>([{ name: 'S', text: '2d8 + 3 necrotic damage', page: 3 }, 'x', null, undefined]) as never,
        awakening: pick<unknown>([{ name: 'W', text: 'Once per day.', page: 4 }, 4, undefined]) as never,
        statBlockLines: pick<unknown>([[{ name: 'Armor Class', text: '12' }, 'raw line', null, 4, { name: 'Bite' }], undefined, 'x']) as never,
      });
      const advancements: E.RuleEntry[] = [
        { id: 'fruitAdvancement.a', kind: 'fruitAdvancement', name: 'Adv A', versions: [version], source: { book: 'T', page: 1 }, typeLine: 'Devil Fruit Advancement, Rare', text: 'Deal 2d6. Once per long rest.', uses: { max: 'prof', recharge: 'long' } as never },
        { id: 'fruitAdvancement.b', kind: 'fruitAdvancement', name: 'Adv B', versions: [], source: { book: 'T', page: 1 }, prerequisite: 'Zoan or Logia Type', text: '' },
        { id: 'fruitAdvancement.c', kind: 'fruitAdvancement', name: 'Adv C', versions: [version], source: { book: 'T', page: 1 }, uses: { max: 'nonsense(', recharge: 'dawn' } as never, text: 5 as never },
      ];
      for (let n = 0; n < 300; n++) {
        const cls = pick(classes);
        const level = 1 + Math.floor(rnd() * 20);
        const scores = { str: 1 + Math.floor(rnd() * 24), dex: 1 + Math.floor(rnd() * 24), con: 1 + Math.floor(rnd() * 24), int: 1 + Math.floor(rnd() * 24), wis: 1 + Math.floor(rnd() * 24), cha: 1 + Math.floor(rnd() * 24) };
        try {
          let doc = E.newCharacter({ name: 'F', rulesVersion: version, classId: cls.id, level, scores }, rules);
          const race = pick(races);
          const subs = all.filter((e) => e.kind === 'subrace' && e.parent === race.id);
          doc.race = { ...doc.race, id: race.id, subraceId: subs.length && rnd() < 0.8 ? pick(subs).id : undefined, name: race.name };
          for (const choice of E.raceChoices(doc, rules)) doc.choices[choice.id] = pick([choice.options.map((o) => o.id), some(choice.options, 0.3).map((o) => o.id), ['nope', ...choice.options.slice(0, 2).map((o) => o.id)]]);
          const weapons = items.filter((i) => i.itemType === 'weapon');
          doc.weapons = [E.weaponFromItem(pick(weapons)), E.weaponFromItem(pick(weapons))].filter((w): w is E.WeaponDef => w !== null);
          if (rnd() < 0.3) doc.armor = E.armorFromItem(pick(items.filter((i) => i.itemType === 'armor')));
          // Spirit Surges: many, repeated, with picks that fit, do not fit, or are rubbish
          const taken = pick([surgeable, some(surgeable, 0.2), some(surgeable, 0.05), []]);
          doc.surges = [...taken, ...some(taken, 0.3)].map((e, i) => ({
            id: pick([`s${i}`, 's-dup']), entry: e.id, rarity: pick(['Rare', 'Mythic', undefined]) as never,
            pick: pick<E.SurgePick | undefined>([undefined, { ability: pick([...E.ABILITIES]) }, { willpower: true }, { skill: pick(E.SKILLS).id }, { skill: 'nope' }, { ability: 'luck' as never }, { proficiency: { kind: 'armor', id: pick(['light', 'shields', 'all', 'nope']) } }, { proficiency: { kind: 'weapon', id: pick(['martial', '', 'nope']) } }, { resource: pick(['use.second_wind', 'slots1', 'nope', 'fruit.charges']) }, { proficiency: 4 as never }, { note: 'x'.repeat(500) }]),
          }));
          if (rnd() < 0.3) doc.surges.push({ id: 'fa', entry: pick(['fruitAdvancement.a', 'fruitAdvancement.b', 'fruitAdvancement.c', 'fruitAdvancement.missing', 'hakiFeature.missing', 'rule.haki_tiers', 'class.warrior']) });
          doc.hakiPurist = pick([undefined, ['quality'], ['stamina', 'stamina', 'quality', 'quantity', 'stamina', 'stamina', 'stamina', 'stamina']]);
          doc.qualitiesOfAKing = rnd() < 0.5 ? true : undefined;
          doc.willpower = pick([{ strengthenSelf: 0 }, { strengthenSelf: 30 }, { strengthenSelf: -5 }, { strengthenSelf: 0, variantAdvancements: pick([0, 40, -3]) }]);
          doc.inventory = pick<E.InventoryItem[] | undefined>([undefined, [], [{ id: 'a', name: 'A', qty: 3, weight: 2.5 }, { id: 'a', name: 'B', qty: 1e9, weight: 1e9 }, { id: 'c', name: 'C', qty: -4, weight: -2 }, { id: 'd', name: 'D', qty: NaN, weight: NaN, carried: false }, { id: 'e', name: 'E', qty: 1, item: 'item.nope' }]]);
          doc.money = pick([undefined, 0, -5e12, 5e15, 12.7]);
          doc.spells = pick<E.KnownSpell[] | undefined>([undefined, [], [{ id: 'a', name: 'Bless', level: 1, prepared: true }, { id: 'b', name: 'X', level: 0 }, { id: 'c', name: 'Big', level: 9 }, { id: 'd', name: 'Odd', level: 42 }, { id: 'e', name: 'Neg', level: -3 }, { id: 'f', name: 'Custom', level: 3, entry: pick(['spell.slime_wave', 'spell.nope', 'class.warrior']) }]]);
          const secrets: E.Secrets = pick([E.NO_SECRETS, { granted: [{ key: 'k1', kind: 'owner', revealed: rnd() < 0.5, entry: fruitOf(1) }], advancements }, { granted: [{ key: 'k1', kind: 'owner', revealed: false, entry: fruitOf(1) }, { key: 'k2', kind: 'owner', revealed: true, entry: fruitOf(2) }, { key: 'k1', kind: 'knowledge', revealed: false, entry: fruitOf(1) }, { key: 'k3', kind: 'knowledge', revealed: false, entry: fruitOf(3) }, { key: 'k4', kind: 'owner', revealed: false, entry: { ...fruitOf(4), kind: 'rule' } }], advancements }]);

          // a save round trip must not lose or break anything, and must be stable
          const again = E.normalizeDoc(JSON.parse(JSON.stringify(doc)));
          if (!again) { note('a character does not survive being saved and read back'); continue; }
          if (!E.sameDoc(E.normalizeDoc(JSON.parse(JSON.stringify(again))), again)) note('reading a save twice gives two different characters');
          doc = again;

          let sheet = E.deriveSheet(doc, rules, E.DEFAULT_SETTINGS, secrets);
          doc.state = { ...doc.state, toggles: Object.fromEntries(sheet.toggles.map((t) => [t.id, true])), spent: Object.fromEntries(sheet.resources.map((r) => [r.id, pick([0, -3, 999])])), hp: pick([0, 1, 9999, -4]), exhaustion: Math.floor(rnd() * 7) };
          sheet = E.deriveSheet(doc, rules, E.DEFAULT_SETTINGS, secrets); sheets++;
          const stats: [string, number][] = [['maxHp', sheet.maxHp.value], ['ac', sheet.ac.value], ['speed', sheet.speed.value], ['initiative', sheet.initiative.value], ['carry', sheet.carry.value], ['willpower', sheet.willpower.value], ['haki DC', sheet.hakiSaveDc.value], ['passive Perception', sheet.passivePerception.value], ['gear carried', sheet.gear.carried], ['money', sheet.money],
            ...(sheet.fruitSaveDc ? [['fruit DC', sheet.fruitSaveDc.value] as [string, number]] : []), ...E.ABILITIES.map((a) => [`score ${a}`, sheet.abilities[a].score] as [string, number]), ...sheet.skills.map((s) => [`skill ${s.id}`, s.value] as [string, number]), ...sheet.attacks.map((a) => ['attack', a.toHit.value] as [string, number]), ...sheet.haki.colors.map((c) => [`haki count ${c.id}`, c.count.value] as [string, number])];
          for (const [k, v] of stats) if (!Number.isFinite(v)) note(`${k} is not a number`);
          if (sheet.willpower.value > 20 || sheet.willpower.value < 0) note(`Willpower outside 0..20: ${sheet.willpower.value}`);
          for (const a of E.ABILITIES) if (sheet.abilities[a].score > Math.max(30, doc.scores[a])) note(`an ability score ran away: ${sheet.abilities[a].score}`);
          for (const r of sheet.resources) { if (r.remaining < 0 || r.remaining > r.max) note(`pool outside its range: ${r.name}`); if (!Number.isFinite(r.max) || r.max <= 0) note(`pool with an odd maximum: ${r.name} = ${r.max}`); if (typeof r.name !== 'string' || !r.name) note('pool with no name'); }
          const ids = sheet.resources.map((r) => r.id); if (new Set(ids).size !== ids.length) note(`two pools share an id: ${ids.find((id, i) => ids.indexOf(id) !== i)}`);
          const keys = sheet.features.map((f) => f.key); if (new Set(keys).size !== keys.length) note(`two features share a key: ${keys.find((k, i) => keys.indexOf(k) !== i)?.replace(/k\d/, 'k')}`);
          const toggles = sheet.toggles.map((t) => t.id); if (new Set(toggles).size !== toggles.length) note(`two switches share an id: ${toggles.find((k, i) => toggles.indexOf(k) !== i)}`);
          for (const f of sheet.features) { if (typeof f.name !== 'string' || typeof f.text !== 'string') note(`feature with a name or text that is not text (${f.key.split('/')[0]})`); if (!Number.isFinite(f.page)) note(`feature with no page: ${f.key.split('/')[0]}`); for (const r of f.rolls) if (/NaN|undefined|\{/.test(r.dice)) note(`roll unreadable: ${f.name} ${r.dice}`); for (const d of f.displays) if (/NaN|undefined/.test(d.value)) note(`number unreadable: ${f.name} ${d.label}`); }
          for (const a of sheet.attacks) if (/NaN|undefined/.test(a.damage)) note(`attack damage unreadable: ${a.damage}`);
          for (const fr of [...sheet.fruits, ...sheet.knownFruits]) { for (const k of ['name', 'rarity', 'type', 'appearance', 'description', 'seaWeakness'] as const) if (typeof fr[k] !== 'string') note(`fruit ${k} is not text`); if (/undefined|null|NaN|\[object/.test(`${fr.rarity}${fr.type}${fr.appearance}${fr.description}${fr.seaWeakness}`)) note('fruit card shows "undefined" or "[object"'); for (const l of fr.statBlock) if (typeof l !== 'string' || /undefined|\[object/.test(l)) note('stat block line is not text'); for (const part of fr.parts) if (typeof part.name !== 'string' || typeof part.text !== 'string') note('fruit part is not text'); }
          for (const s of sheet.spellbook.known) { if (s.level < 0 || s.level > 9) note(`spell level outside 0..9: ${s.level}`); for (const l of s.castableWith) if (l < s.level) note('spell castable with a slot below its level'); }
          if (sheet.warnings.some((w) => /undefined|NaN|\[object/.test(w))) note(`warning shows a raw value: ${sheet.warnings.find((w) => /undefined|NaN|\[object/.test(w))!.slice(0, 60)}`);
          if (sheet.notes.some((x) => /undefined|NaN|\[object/.test(x.label))) note(`note shows a raw value: ${sheet.notes.find((x) => /undefined|NaN|\[object/.test(x.label))!.label.slice(0, 60)}`);

          // without the private content nothing of it may show
          const open = JSON.stringify(E.deriveSheet(doc, rules));
          if (/Fruit \d|Adv [ABC]|fruitAdvancement/.test(open)) note('private content shows on a sheet derived without it');
          if (/devilFruit\.f\d|"k\d"/.test(JSON.stringify(doc))) note('the saved character names its fruit');

          // every action
          for (const f of sheet.features) { try { E.activateFeature(doc.state, sheet, f); } catch (e) { note(`Use throws: ${f.key.split('/')[0]}: ${(e as Error).message.slice(0, 50)}`); } }
          for (const t of sheet.toggles) { try { E.setToggle(doc.state, sheet, t.id, false); E.setToggle(doc.state, sheet, t.id, true); } catch { note(`switch throws: ${t.label}`); } }
          for (const s of sheet.spellbook.known) { try { for (const l of [undefined, 1, 9, 0, -2, 99]) E.castSpell(doc.state, sheet, s, l); } catch (e) { note(`cast throws: ${(e as Error).message.slice(0, 50)}`); } }
          try { E.shortRest(doc, sheet, { hitDiceRolls: [3] }); E.dawn(doc, sheet); const st = E.longRest(doc, sheet).state; const rested = E.deriveSheet({ ...doc, state: st }, rules, E.DEFAULT_SETTINGS, secrets); for (const r of rested.resources) if ((r.recharge === 'long' || r.recharge === 'short') && r.remaining !== r.max) note(`long rest does not refill ${r.id.replace(/k\d/, 'k')}`); const dawned = E.deriveSheet({ ...doc, state: E.dawn(doc, sheet).state }, rules, E.DEFAULT_SETTINGS, secrets); for (const r of dawned.resources) if (r.recharge === 'dawn' && r.remaining !== r.max) note(`dawn does not refill ${r.id}`); } catch (e) { note(`a rest throws: ${(e as Error).message.slice(0, 60)}`); }
          try { const merged = E.withSecrets(rules, secrets, version); for (const rarity of E.RARITIES) { const opts = E.surgeOptions(doc, merged, rarity, { tiers: { armament: 0, observation: 3, supremeKing: 1 }, spellcaster: rnd() < 0.5, fruitCategories: sheet.fruits.map((f) => f.category) }); for (const o of opts) { E.surgeAsks(o.entry, version); if (o.blocked.some((b) => /undefined|NaN/.test(b))) note(`surge reason shows a raw value: ${o.blocked.join(';').slice(0, 50)}`); } } } catch (e) { note(`surge options throw: ${(e as Error).message.slice(0, 60)}`); }
          try { E.sheetChanges(E.deriveSheet(doc, rules), sheet); E.sheetChanges(sheet, E.deriveSheet({ ...doc, surges: [] }, rules, E.DEFAULT_SETTINGS, secrets)).forEach((l) => { if (/undefined|NaN/.test(l)) note(`"what changes" shows a raw value: ${l.slice(0, 50)}`); }); } catch (e) { note(`what-changes throws: ${(e as Error).message.slice(0, 60)}`); }
          try { E.spellLists(doc, rules); E.carriedWeight(doc.inventory, sheet.carry.value); } catch (e) { note(`lists throw: ${(e as Error).message.slice(0, 60)}`); }
          try { const plan = E.levelUpPlan(doc, rules, cls.id); const next = E.applyLevelUp(doc, rules, { classId: cls.id, hpRoll: null, choices: Object.fromEntries(plan.choices.map((c) => [c.id, [...c.have, ...c.options.slice(0, 1).map((o) => o.id)]])) }).doc; E.deriveSheet(next, rules, E.DEFAULT_SETTINGS, secrets); for (const k of ['surges', 'inventory', 'spells', 'money', 'hakiPurist', 'qualitiesOfAKing'] as const) if (!E.sameDoc(next[k] ?? null, doc[k] ?? null)) note(`level up changes ${k}`); } catch (e) { note(`level up throws: ${(e as Error).message.slice(0, 70)}`); }
        } catch (e) { note(`THROW (${cls.name} ${level}): ${(e as Error).message.slice(0, 90)}`); }
      }
    }
    const report = [...problems].sort((a, b) => b[1] - a[1]).map(([what, count]) => `${count} × ${what}`);
    expect(report).toEqual([]);
    expect(sheets).toBeGreaterThan(550);
  }, 120_000); // about 13 s alone; the default 30 s is missed when the whole suite shares a busy machine
});
