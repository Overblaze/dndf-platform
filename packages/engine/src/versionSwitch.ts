// What would change if a character moved to the other handbook. A character is pinned to the handbook
// it was made with, so nothing here changes it: this works out the same character on the other
// handbook, as a copy, and says plainly what carried over, what has a new name, what is not there,
// and which numbers and features come out different.
import { crewRolesOf, type CharacterDoc } from './character';
import { HANDBOOKS } from './citations';
import { signed } from './core';
import { ABILITY_NAMES } from './types';
import { deriveSheet, type Sheet } from './sheet';
import { ABILITIES, type RuleEntry, type RulesVersion } from './types';

/** What one handbook calls something the other has under another id. Each pair is [v8.8, v10]. */
export const VERSION_RENAMES: [string, string][] = [
  ['class.rogue', 'class.renegade'],
  ['class.skald', 'class.virtuoso'],
  ['spellList.skald', 'spellList.virtuoso'],
  ['feat.moderately_armorered', 'feat.moderately_armored'],
  ['hakiFeature.predictive_shot', 'hakiFeature.predictive_attack'],
];

export interface VersionSwitch {
  from: RulesVersion;
  to: RulesVersion;
  /** The character on the other handbook. The original is not touched. */
  doc: CharacterDoc;
  /** Things the other handbook has under another name. */
  renamed: { what: string; from: string; to: string }[];
  /** Things the other handbook does not have. They were left off the copy. */
  missing: { what: string; name: string }[];
  /** Numbers that come out different. */
  numbers: { label: string; before: string; after: string }[];
  /** Features only the copy has, features only the original has, and features both have whose words differ. */
  gained: string[];
  lost: string[];
  reworded: string[];
  /** Anything the other handbook's sheet could not place, in the engine's own words. */
  unresolved: string[];
  /** True when nothing at all differs. */
  same: boolean;
}

const WHAT: Record<string, string> = { class: 'Class', subclass: 'Subclass', race: 'Race', subrace: 'Subrace', background: 'Background', crewRole: 'Crew role', feat: 'Feat', hakiFeature: 'Haki feature', surgeAdvancement: 'Spirit Surge advancement', spell: 'Spell', spellList: 'Spell list', item: 'Item' };
const pretty = (id: string) => id.split('.').pop()!.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function switchVersion(original: CharacterDoc, fromRules: Map<string, RuleEntry>, toRules: Map<string, RuleEntry>, to: RulesVersion): VersionSwitch {
  const from = original.rulesVersion;
  const renamed: VersionSwitch['renamed'] = [];
  const missing: VersionSwitch['missing'] = [];
  const said = new Set<string>();
  const nameOf = (id: string) => fromRules.get(id)?.name ?? pretty(id);
  const whatOf = (id: string) => WHAT[fromRules.get(id)?.kind ?? id.split('.')[0]!] ?? 'Entry';
  const column = to === 'dndf-10' ? 0 : 1;
  /** The same thing's id in the other handbook, or null when it has none. */
  const carry = (id: string): string | null => {
    if (id.startsWith('custom')) return id; // a class the player wrote travels with the character
    let found: string | null = toRules.has(id) ? id : null;
    if (!found) {
      const pair = VERSION_RENAMES.find((p) => p[column] === id);
      if (pair && toRules.has(pair[1 - column]!)) found = pair[1 - column]!;
    }
    if (!found) {
      // A subclass of a class that has another name there: "subclass.rogue.thief" is "subclass.renegade.thief".
      const parts = /^subclass\.([^.]+)\.(.+)$/.exec(id);
      const pair = parts ? VERSION_RENAMES.find((p) => p[column] === `class.${parts[1]}`) : undefined;
      const other = pair ? `subclass.${pair[1 - column]!.slice('class.'.length)}.${parts![2]}` : null;
      if (other && toRules.has(other)) found = other;
    }
    if (said.has(id)) return found;
    said.add(id);
    if (!found) missing.push({ what: whatOf(id), name: nameOf(id) });
    else if (found !== id && toRules.get(found)!.name !== nameOf(id)) renamed.push({ what: whatOf(id), from: nameOf(id), to: toRules.get(found)!.name });
    return found;
  };
  const carried = (ids: string[] | undefined) => (ids ?? []).flatMap((id) => carry(id) ?? []);

  const classes = original.classes.map((c) => ({ ...c, id: carry(c.id) ?? c.id, subclass: c.subclass ? carry(c.subclass) ?? undefined : undefined }));
  const raceId = original.race.id ? carry(original.race.id) ?? undefined : undefined;
  const subraceId = original.race.subraceId ? carry(original.race.subraceId) ?? undefined : undefined;
  const background = original.background ? (carry(original.background.id) ? { ...original.background, id: carry(original.background.id)! } : undefined) : undefined;
  // Choices are kept under the same keys; a key or option the other handbook lacks is found below, from its own sheet.
  const choices = Object.fromEntries(Object.entries(original.choices).map(([key, picks]) => [key, [...picks]]));
  let doc: CharacterDoc = {
    ...original,
    rulesVersion: to,
    classes,
    race: { ...original.race, id: raceId, subraceId: raceId ? subraceId : undefined },
    background,
    crewRoles: crewRolesOf(original).flatMap((r) => { const id = carry(r.id); return id ? [{ id }] : []; }),
    crewRole: undefined,
    feats: original.feats ? carried(original.feats) : undefined,
    surges: original.surges?.flatMap((record) => { const entry = record.entry.startsWith('fruitAdvancement.') ? record.entry : carry(record.entry); return entry ? [{ ...record, entry }] : []; }),
    spells: original.spells?.map((spell) => ({
      ...spell,
      // A spell stays on the sheet by name even when its text is not in the other handbook's data.
      entry: spell.entry && toRules.has(spell.entry) ? spell.entry : undefined,
      list: spell.list ? carry(spell.list) ?? undefined : undefined,
      cls: spell.cls ? classes[original.classes.findIndex((c) => c.id === spell.cls)]?.id ?? spell.cls : undefined,
    })),
    inventory: original.inventory?.map((item) => ({ ...item, item: item.item && toRules.has(item.item) ? item.item : undefined })),
    choices,
  };

  // The other handbook's own sheet says which picks it cannot place; those are taken off, and said.
  const optionName = (id: string) => {
    for (const entry of fromRules.values()) for (const option of ((entry.options ?? []) as { id?: string; name?: string }[])) if (option.id === id && option.name) return option.name;
    return pretty(id);
  };
  const unresolved: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const warnings = deriveSheet(doc, toRules).warnings;
    const unplaced = warnings.flatMap((w) => { const m = /^"([^"]+)" is not one of the (.+)\.$/.exec(w); return m ? [{ id: m[1]!, group: m[2]! }] : []; });
    if (unplaced.length === 0) { unresolved.push(...warnings.filter((w) => !/is not in the .*rules data\.$/.test(w) && !/^"[^"]+" is not one of/.test(w))); break; }
    for (const { id, group } of unplaced) {
      if (!said.has(`option:${id}`)) { said.add(`option:${id}`); missing.push({ what: `Pick from ${group}`, name: optionName(id) }); }
      doc = { ...doc, choices: Object.fromEntries(Object.entries(doc.choices).map(([key, picks]) => [key, picks.filter((p) => p !== id)])) };
    }
  }

  const before = deriveSheet(original, fromRules);
  const after = deriveSheet(doc, toRules);
  const numbers: VersionSwitch['numbers'] = [];
  const compare = (label: string, a: string | number | undefined, b: string | number | undefined) => {
    const x = a === undefined ? '—' : String(a);
    const y = b === undefined ? '—' : String(b);
    if (x !== y) numbers.push({ label, before: x, after: y });
  };
  const stats = (s: Sheet): [string, string | number][] => [
    ['Level', s.level], ['Hit point maximum', s.maxHp.value], ['Armor Class', s.ac.value], ['Speed', `${s.speed.value} ft`], ['Initiative', signed(s.initiative.value)],
    ['Proficiency bonus', signed(s.prof.value)], ['Passive Perception', s.passivePerception.value], ['Willpower', s.willpower.value], ['Haki save DC', s.hakiSaveDc.value],
    ['Hit dice', s.hitDice.pool.map((p) => `${p.count}d${p.die}`).join(' + ')], ['Dream Points', s.dreamPoints.max], ['Carrying capacity', `${s.carry.value} lb`], ['Attacks per Attack action', s.attacksPerAction],
    ...ABILITIES.map((a): [string, number] => [ABILITY_NAMES[a], s.abilities[a].score]),
    ...ABILITIES.map((a): [string, string] => [`${ABILITY_NAMES[a]} save`, signed(s.saves[a].value)]),
    ...s.skills.map((k): [string, string] => [k.label, signed(k.value)]),
  ];
  const a = stats(before);
  const b = stats(after);
  a.forEach(([label, value], i) => compare(label, value, b[i]![1]));
  const byName = <T,>(list: T[], name: (x: T) => string, value: (x: T) => string) => new Map(list.map((x) => [name(x), value(x)]));
  const pairs = (title: (name: string) => string, x: Map<string, string>, y: Map<string, string>) => { for (const name of new Set([...x.keys(), ...y.keys()])) compare(title(name), x.get(name), y.get(name)); };
  pairs((n) => `${n} (uses)`, byName(before.resources.filter((r) => !r.id.startsWith('sr.')), (r) => r.name, (r) => `${r.max} per ${r.recharge} rest`.replace('dawn rest', 'dawn')), byName(after.resources.filter((r) => !r.id.startsWith('sr.')), (r) => r.name, (r) => `${r.max} per ${r.recharge} rest`.replace('dawn rest', 'dawn')));
  pairs((n) => `Spell slots, level ${n}`, byName(before.spellbook.slots, (r) => r.id.slice(5), (r) => String(r.max)), byName(after.spellbook.slots, (r) => r.id.slice(5), (r) => String(r.max)));
  pairs((n) => `${n} (attack)`, byName(before.attacks, (x) => x.name, (x) => `${signed(x.toHit.value)} to hit, ${x.damage} ${x.damageType}`.trim()), byName(after.attacks, (x) => x.name, (x) => `${signed(x.toHit.value)} to hit, ${x.damage} ${x.damageType}`.trim()));
  // Casting numbers are matched by position: a class with a new name is still the same class.
  before.spellbook.classes.forEach((c, i) => {
    const d = after.spellbook.classes[i];
    compare(`${c.name} spell save DC`, c.dc?.value, d?.dc?.value);
    compare(`${c.name} spell attack`, c.attack ? signed(c.attack.value) : undefined, d?.attack ? signed(d.attack.value) : undefined);
  });
  compare('Class table', before.classTable.map((c) => `${c.label} ${c.value}`).join('; ') || undefined, after.classTable.map((c) => `${c.label} ${c.value}`).join('; ') || undefined);

  const texts = (s: Sheet) => { const m = new Map<string, string>(); for (const f of s.features) m.set(f.name, `${m.get(f.name) ?? ''}${f.text}${f.sections.map((x) => `${x.name}${x.text}`).join('')}`); return m; };
  const then = texts(before);
  const now = texts(after);
  const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
  const gained = [...now.keys()].filter((name) => !then.has(name)).sort();
  const lost = [...then.keys()].filter((name) => !now.has(name)).sort();
  const reworded = [...now.keys()].filter((name) => then.has(name) && flat(then.get(name)!) !== flat(now.get(name)!)).sort();
  return {
    from, to, doc, renamed, missing, numbers, gained, lost, reworded, unresolved,
    same: !renamed.length && !missing.length && !numbers.length && !gained.length && !lost.length && !reworded.length && !unresolved.length,
  };
}

/** The other handbook's name for a version: used in "a copy on …". */
export const otherVersion = (version: RulesVersion): RulesVersion => (version === 'dndf-10' ? 'dndf-8.8' : 'dndf-10');
export const handbookOf = (version: RulesVersion): string => HANDBOOKS[version];
