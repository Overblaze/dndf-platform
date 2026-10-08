// Random characters in extreme states, with every action tried on each. The seed is fixed, so a
// failure can be run again. Found by the deep review; kept so the sheet stays unbreakable.
import { describe, expect, it } from 'vitest';
import * as E from '../src';
import { loadRules } from './load';

describe('random characters in extreme states', () => {
  it('600 of them: nothing throws, every number is a number, every pool and tracker stays in range', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)]!;
    const problems = new Map<string, number>();
    const note = (what: string) => problems.set(what, (problems.get(what) ?? 0) + 1);
    let sheets = 0;
    for (const version of ['dndf-10', 'dndf-8.8'] as E.RulesVersion[]) {
      const rules = loadRules(version);
      const all = [...rules.values()];
      const classes = all.filter((e) => e.kind === 'class');
      const feats = all.filter((e) => e.kind === 'feat').map((e) => e.id);
      const items = all.filter((e) => e.kind === 'item');
      for (let n = 0; n < 300; n++) {
        const cls = pick(classes);
        const subs = all.filter((e) => e.kind === 'subclass' && e.parent === cls.id);
        const level = 1 + Math.floor(rnd() * 20);
        const scores = { str: 3 + Math.floor(rnd() * 20), dex: 3 + Math.floor(rnd() * 20), con: 3 + Math.floor(rnd() * 20), int: 3 + Math.floor(rnd() * 20), wis: 3 + Math.floor(rnd() * 20), cha: 3 + Math.floor(rnd() * 20) };
        let doc: E.CharacterDoc;
        try {
          doc = E.newCharacter({ name: 'F', rulesVersion: version, classId: cls.id, level, scores, subclass: rnd() < 0.8 && subs.length ? pick(subs).id : undefined, feats: rnd() < 0.5 ? [pick(feats), pick(feats)] : [] }, rules);
          if (rnd() < 0.4) { const other = pick(classes); if (other.id !== cls.id) doc.classes.push({ id: other.id, level: 1 + Math.floor(rnd() * 10) }); }
          const weapons = items.filter((i) => i.itemType === 'weapon'); const armors = items.filter((i) => i.itemType === 'armor');
          if (weapons.length) doc.weapons = [E.weaponFromItem(pick(weapons))!, E.weaponFromItem(pick(weapons))!].filter(Boolean);
          if (rnd() < 0.5 && armors.length) doc.armor = E.armorFromItem(pick(armors));
          doc.shield = rnd() < 0.3;
          // every option list filled to the brim, every switch on, every tracker and counter at an extreme
          for (const e of [rules.get(cls.id)!, ...(doc.classes[0]!.subclass ? [rules.get(doc.classes[0]!.subclass)!] : [])]) for (const f of e.features ?? []) if (f.choices) doc.choices[f.choices.id] = ((rules.get(f.choices.from)?.options ?? []) as E.OptionDef[]).map((o) => o.id);
          let sheet = E.deriveSheet(doc, rules);
          const extreme = pick([0, -5, 999]);
          doc.state = { ...doc.state, toggles: Object.fromEntries(sheet.toggles.map((t) => [t.id, true])), trackers: Object.fromEntries(sheet.trackers.map((t) => [t.id, extreme])), spent: Object.fromEntries(sheet.resources.map((r) => [r.id, pick([0, -3, 999])])), hitDiceSpent: pick([0, -2, 99]), exhaustion: Math.floor(rnd() * 7), hp: pick([0, 1, 9999, -4]) };
          sheet = E.deriveSheet(doc, rules); sheets++;
          const nums: [string, number][] = [['maxHp', sheet.maxHp.value], ['ac', sheet.ac.value], ['speed', sheet.speed.value], ['init', sheet.initiative.value], ['carry', sheet.carry.value], ...sheet.skills.map((s) => [`skill ${s.id}`, s.value] as [string, number]), ...sheet.attacks.map((a) => [`attack hit`, a.toHit.value] as [string, number]), ...sheet.formulas.map((f) => [`formula ${f.label}`, f.value] as [string, number])];
          for (const [k, v] of nums) if (!Number.isFinite(v)) note(`${k} is not a number (${cls.name})`);
          for (const r of sheet.resources) { if (r.remaining < 0) note(`pool below zero: ${r.name}`); if (r.remaining > r.max) note(`pool above its maximum: ${r.name}`); if (!Number.isFinite(r.max) || r.max < 0) note(`pool max odd: ${r.name} = ${r.max}`); }
          for (const t of sheet.trackers) { if (t.value < t.min || t.value > t.max) note(`tracker outside its range: ${t.name}`); }
          if (sheet.hitDice.remaining < 0 || sheet.hitDice.remaining > sheet.hitDice.total) note('hit dice remaining outside 0..total');
          if (sheet.dreamPoints.remaining < 0) note('dream points below zero');
          if (sheet.speed.value < 0) note(`speed below zero (${cls.name})`);
          for (const a of sheet.attacks) if (/NaN|undefined/.test(a.damage)) note(`attack damage unreadable: ${a.damage}`);
          for (const f of sheet.features) for (const r of f.rolls) if (/NaN|undefined|\{/.test(r.dice)) note(`feature roll unreadable: ${f.name} ${r.dice}`);
          for (const f of sheet.features) for (const d of f.displays) if (/NaN|undefined/.test(d.value)) note(`feature number unreadable: ${f.name} ${d.label}=${d.value}`);
          // every action on it
          for (const f of sheet.features) { try { E.activateFeature(doc.state, sheet, f); } catch (e) { note(`Use throws: ${f.name}: ${(e as Error).message.slice(0, 60)}`); } }
          for (const t of sheet.toggles) { try { E.setToggle(doc.state, sheet, t.id, false); E.setToggle(doc.state, sheet, t.id, true); } catch (e) { note(`switch throws: ${t.label}`); } }
          try { E.shortRest(doc, sheet, { hitDiceRolls: [3, 4] }); E.longRest(doc, sheet); E.dawn(doc, sheet); E.healingSurge(doc, sheet, [4]); } catch (e) { note(`a rest throws: ${(e as Error).message.slice(0, 70)}`); }
          const after = E.longRest(doc, sheet).state;
          const rested = E.deriveSheet({ ...doc, state: after }, rules);
          if (after.hp > rested.maxHp.value) note('long rest leaves hit points above the maximum');
          if (after.hp < 0) note('long rest leaves hit points below zero');
          try { const plan = E.levelUpPlan(doc, rules, cls.id); E.applyLevelUp(doc, rules, { classId: cls.id, hpRoll: null, subclass: plan.subclass?.options[0]?.id }); } catch (e) { note(`level up throws: ${(e as Error).message.slice(0, 70)}`); }
        } catch (e) { note(`THROW (${cls.name} ${level}): ${(e as Error).message.slice(0, 90)}`); }
      }
    }
    expect(sheets).toBe(600);
    expect([...problems.entries()].map(([what, count]) => `${count} × ${what}`)).toEqual([]);
  });
});
