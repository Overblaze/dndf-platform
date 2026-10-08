// What a change to a character does to the sheet, in words: shown before a Spirit Surge is added.
import { ABILITIES, ABILITY_NAMES } from './types';
import type { Sheet, Stat } from './sheet';

const RECHARGE: Record<string, string> = { short: 'per short rest', long: 'per long rest', dawn: 'per dawn' };

/** Every number, counter and feature that differs between two sheets of the same character, one line each. */
export function sheetChanges(before: Sheet, after: Sheet): string[] {
  const lines: string[] = [];
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const number = (label: string, a: Stat | null | undefined, b: Stat | null | undefined, mod = false) => {
    if (a && b && a.value !== b.value) lines.push(`${label}: ${mod ? signed(a.value) : a.value} → ${mod ? signed(b.value) : b.value}`);
  };
  for (const a of ABILITIES) {
    if (before.abilities[a].score !== after.abilities[a].score) lines.push(`${ABILITY_NAMES[a]}: ${before.abilities[a].score} → ${after.abilities[a].score}`);
  }
  number('Willpower', before.willpower, after.willpower);
  number('Haki save DC', before.hakiSaveDc, after.hakiSaveDc);
  number('Haki attack', before.hakiAttack, after.hakiAttack, true);
  number('Armor Class', before.ac, after.ac);
  number('Hit point maximum', before.maxHp, after.maxHp);
  number('Speed', before.speed, after.speed);
  number('Initiative', before.initiative, after.initiative, true);
  number('Passive Perception', before.passivePerception, after.passivePerception);
  number('Carrying capacity', before.carry, after.carry);
  for (const a of ABILITIES) number(`${ABILITY_NAMES[a]} save`, before.saves[a], after.saves[a], true);
  for (const skill of after.skills) {
    const was = before.skills.find((s) => s.id === skill.id);
    if (!was || was.value === skill.value) continue;
    const how = skill.expertise && !was.expertise ? ' (expertise)' : skill.proficient && !was.proficient ? ' (proficient)' : '';
    lines.push(`${skill.label}: ${signed(was.value)} → ${signed(skill.value)}${how}`);
  }
  for (const attack of after.attacks) {
    const was = before.attacks.find((a) => a.id === attack.id);
    if (!was) continue;
    number(`${attack.name} attack`, was.toHit, attack.toHit, true);
    if (was.damage !== attack.damage) lines.push(`${attack.name} damage: ${was.damage} → ${attack.damage}`);
  }
  for (const formula of after.formulas) number(formula.label, before.formulas.find((f) => f.key === formula.key), formula);
  for (const color of after.haki.colors) {
    const was = before.haki.colors.find((c) => c.id === color.id);
    if (was && was.tier !== color.tier) lines.push(`${color.name}: ${was.tier ? `Tier ${was.tier}` : 'no tier'} → Tier ${color.tier}`);
  }
  for (const feature of after.features) {
    if (before.features.some((f) => f.key === feature.key)) continue;
    const dice = feature.rolls.map((r) => `${r.label} ${r.dice}`).join(', ');
    lines.push(`New: ${feature.name}${dice ? ` (${dice})` : ''}`);
  }
  for (const feature of before.features) {
    if (!after.features.some((f) => f.key === feature.key)) lines.push(`Gone: ${feature.name}`);
  }
  for (const res of after.resources) {
    const was = before.resources.find((r) => r.id === res.id);
    const uses = (n: number) => `${n} use${n === 1 ? '' : 's'} ${RECHARGE[res.recharge] ?? res.recharge}`;
    if (!was) lines.push(`${res.name}: ${uses(res.max)}`);
    else if (was.max !== res.max) lines.push(`${res.name}: ${was.max} → ${uses(res.max)}`);
  }
  for (const toggle of after.toggles) {
    if (!before.toggles.some((t) => t.id === toggle.id)) lines.push(`${toggle.label}: a switch on the Combat tab`);
  }
  for (const kind of ['armor', 'weapons', 'tools'] as const) {
    for (const p of after.proficiencies[kind]) {
      if (!before.proficiencies[kind].some((b) => b.id === p.id)) lines.push(`Proficient with ${p.name.toLowerCase()}`);
    }
  }
  return lines;
}
