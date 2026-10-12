// The beast a Zoan fruit turns into, as a companion: a Devilforged's infused weapon "morphs into its devil
// fruit beast form … has its own intelligence and acts on its own turn" (v8.8 p115, Zoan Infusion).
// Its numbers come from the fruit's own stat block where the book prints one, read a line at a time; most
// Zoans name a beast from another book instead, and then the player types its numbers in.
import { ABILITIES, type Ability } from './types';

export interface BeastAttack {
  name: string;
  /** The line as printed, for anything the reading below missed. */
  text: string;
  toHit: number | null;
  damage: { dice: string; type: string }[];
}

export interface Beast {
  name: string;
  ac: number | null;
  hp: number | null;
  hpDice: string | null;
  speed: string;
  abilities: Record<Ability, number> | null;
  /** Skills, senses, languages, challenge and the like, as printed. */
  facts: { name: string; text: string }[];
  traits: { name: string; text: string }[];
  attacks: BeastAttack[];
}

/** A beast typed in by the player, kept on the character. */
export interface CustomBeast {
  name: string;
  ac: number;
  hp: number;
  speed: string;
  attacks: { name: string; toHit: number; damage: string; type: string }[];
  notes?: string;
}

const number = (text: string) => Number(text.replace(/[−–]/g, '-'));
const FACTS = /^(Armor Class|Hit Points|Speed|Skills|Senses|Languages|Challenge|Saving Throws|Damage (Vulnerabilities|Resistances|Immunities)|Condition Immunities)\b/;
const HEADINGS = /^(Actions|Reactions|Bonus Actions|Legendary Actions|Traits)$/i;
const TO_HIT = /([+−–-]\d+) to hit/;
const DAMAGE = /(?:\d+\s*\()?\s*(\d+d\d+(?:\s*[+−–-]\s*\d+)?)\s*\)?\s*([a-z]+)\s+damage/gi;

/** Dice as the roller reads them: "2d6 + 4", with a plain hyphen. */
const tidyDice = (dice: string) => dice.replace(/[−–]/g, '-').replace(/\s*([+-])\s*/, ' $1 ').trim();

/**
 * Reads a stat block's lines ("Armor Class 12", "Bite. Melee Weapon Attack: +6 to hit … Hit: 11 (2d6 + 4)
 * piercing damage"). What cannot be read is left null or kept as text; null when there is nothing to read at all.
 */
export function parseBeast(lines: { name?: unknown; text?: unknown }[]): Beast | null {
  const rows = lines.map((l) => ({ name: typeof l?.name === 'string' ? l.name.trim() : '', text: typeof l?.text === 'string' ? l.text.trim() : '' })).filter((l) => l.name || l.text);
  if (rows.length === 0) return null;
  const beast: Beast = { name: '', ac: null, hp: null, hpDice: null, speed: '', abilities: null, facts: [], traits: [], attacks: [] };
  rows.forEach((row, i) => {
    const whole = `${row.name} ${row.text}`.trim();
    if (/^Armor Class\b/.test(whole)) { beast.ac = number(/(\d+)/.exec(whole.slice(11))?.[1] ?? '') || null; return; }
    if (/^Hit Points\b/.test(whole)) {
      beast.hp = number(/(\d+)/.exec(whole.slice(10))?.[1] ?? '') || null;
      const dice = /\((\d+d\d+(?:\s*[+−–-]\s*\d+)?)\)/.exec(whole)?.[1];
      beast.hpDice = dice ? tidyDice(dice) : null;
      return;
    }
    if (/^Speed\b/.test(whole)) { beast.speed = whole.slice(5).trim(); return; }
    if (/^STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA/.test(whole)) {
      const scores = [...whole.matchAll(/(\d+)\s*\(\s*[+−–-]?\d+\s*\)/g)].map((m) => Number(m[1]));
      if (scores.length >= 6) beast.abilities = Object.fromEntries(ABILITIES.map((a, n) => [a, scores[n]!])) as Record<Ability, number>;
      return;
    }
    if (FACTS.test(whole)) { beast.facts.push({ name: FACTS.exec(whole)![0], text: whole.slice(FACTS.exec(whole)![0].length).trim() }); return; }
    if (HEADINGS.test(row.name) && !row.text) return;
    // The first line, when it is none of those, is the beast's name ("Bull", with its size and kind after it).
    if (i === 0) { beast.name = row.name || row.text; if (row.name && row.text) beast.facts.push({ name: 'Kind', text: row.text }); return; }
    const hit = TO_HIT.exec(row.text);
    if (hit) {
      beast.attacks.push({ name: row.name || 'Attack', text: row.text, toHit: number(hit[1]!), damage: [...row.text.slice(hit.index).matchAll(DAMAGE)].map((m) => ({ dice: tidyDice(m[1]!), type: m[2]!.toLowerCase() })) });
      return;
    }
    beast.traits.push({ name: row.name, text: row.text });
  });
  return beast.ac !== null || beast.hp !== null || beast.attacks.length > 0 || beast.traits.length > 0 || beast.name ? beast : null;
}

const WEAPON_DAMAGE = /^(bludgeoning|piercing|slashing)$/;

/** "All non-elemental damage the beast inflicts is based on the infused weapon's damage type." */
export function withWeaponDamage(attacks: BeastAttack[], weaponType: string | undefined): BeastAttack[] {
  if (!weaponType) return attacks;
  return attacks.map((attack) => ({ ...attack, damage: attack.damage.map((d) => (WEAPON_DAMAGE.test(d.type) ? { ...d, type: weaponType } : d)) }));
}

/** A beast typed in by hand, put into shape; null when it has neither a name nor any number. */
export function cleanBeast(raw: unknown): CustomBeast | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const whole = (value: unknown, min: number, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min);
  const words = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const attacks = (Array.isArray(r.attacks) ? r.attacks : []).flatMap((a: unknown) => {
    const row = a as Record<string, unknown> | null;
    const name = words(row?.name, 60);
    return row && typeof row === 'object' && name ? [{ name, toHit: whole(row.toHit, -10, 30) === -10 && typeof row.toHit !== 'number' ? 0 : whole(row.toHit, -10, 30), damage: words(row.damage, 30), type: words(row.type, 30) }] : [];
  }).slice(0, 12);
  const beast: CustomBeast = { name: words(r.name, 60), ac: whole(r.ac, 0, 40), hp: whole(r.hp, 0, 9999), speed: words(r.speed, 80), attacks, ...(words(r.notes, 2000) ? { notes: words(r.notes, 2000) } : {}) };
  return beast.name || beast.ac || beast.hp || beast.attacks.length ? beast : null;
}

/** The modifier of an ability score. */
export const beastMod = (score: number) => Math.floor((score - 10) / 2);
