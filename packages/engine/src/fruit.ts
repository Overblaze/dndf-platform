// Private content a character has been granted: Devil Fruits and the advancements open to fruit users.
// None of it is in the repository or in the character's saved document. The website reads it from the
// database, which only returns what this account may see, and hands it to deriveSheet beside the document.
import { parseDice, formatDice } from './dice';
import type { RollDef, RuleEntry } from './types';

export interface GrantedSecret {
  /** The entry's key in the private table ("<id>@<book>"). */
  key: string;
  /** 'owner': the character has the fruit. 'knowledge': they can read it, nothing goes on the sheet. */
  kind: 'owner' | 'knowledge';
  /** Whether the DM has told the rest of the table. */
  revealed: boolean;
  entry: RuleEntry;
}

export interface Secrets {
  granted: GrantedSecret[];
  /** Devil Fruit advancements, which the database opens to anyone who holds a fruit. */
  advancements: RuleEntry[];
}

export const NO_SECRETS: Secrets = { granted: [], advancements: [] };

export type FruitCategory = 'paramecia' | 'logia' | 'zoan' | 'other';

interface Part { name: string; text: string; page: number }

export interface SheetFruit {
  key: string;
  name: string;
  book: string;
  page: number;
  rarity: string;
  /** The type line as the book prints it. */
  type: string;
  category: FruitCategory;
  appearance: string;
  description: string;
  seaWeakness: string;
  revealed: boolean;
  /** Feature keys on the sheet, for a holder; empty for a fruit only known about. */
  features: string[];
  /** Ids of its counters on the sheet (charges, Beast Form uses). */
  resources: string[];
  /** Everything the book says, in its order, for reading. */
  parts: Part[];
  statBlock: string[];
  /** Highest spell level the fruit's charges can cast, where its type has a table. */
  highestSpellLevel?: number;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const part = (value: unknown, fallback: string): Part[] => {
  if (!value || typeof value !== 'object') return [];
  const v = value as Record<string, unknown>;
  return text(v.text) || text(v.name) ? [{ name: text(v.name) || fallback, text: text(v.text), page: typeof v.page === 'number' ? v.page : 0 }] : [];
};

/** Paramecia, Logia or Zoan, read from the fruit's type line or the section it is printed in. */
export function fruitCategory(entry: RuleEntry): FruitCategory {
  for (const field of [entry.type, entry.section, entry.group]) {
    const found = /paramecia|logia|zoan/i.exec(text(field));
    if (found) return found[0].toLowerCase() as FruitCategory;
  }
  return 'other';
}

/** A fruit's parts in reading order: its features, then its spells, then its awakening. */
export function fruitParts(entry: RuleEntry): { features: Part[]; spells: Part[]; awakening: Part[] } {
  const features = (Array.isArray(entry.features) ? entry.features : []).flatMap((f) => part(f, 'Feature'));
  return { features, spells: part(entry.spells, 'Spells'), awakening: part(entry.awakening, 'Awakening') };
}

const DICE = /\b(\d{1,2}d(?:4|6|8|10|12|100))\b(?:\s*\+\s*(\d{1,2})\b(?!d))?/g;
const AFTER = /^\s+((?:(?:additional|extra|bonus|temporary|acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder|or|and|,)\s*)*?(?:damage|hit points))/;

/** Dice a private feature's text names, as roll buttons: the same reading the extractor gives public features. */
export function diceInText(words: string): RollDef[] {
  const rolls: RollDef[] = [];
  for (const m of words.matchAll(DICE)) {
    let dice: string;
    try { dice = formatDice(parseDice(m[1]! + (m[2] ? ` + ${m[2]}` : ''))); } catch { continue; }
    if (rolls.some((r) => r.dice === dice)) continue;
    const after = AFTER.exec(words.slice(m.index! + m[0].length, m.index! + m[0].length + 60));
    const label = (after ? `${dice} ${after[1]}` : dice).replace(/\s+/g, ' ').slice(0, 60);
    rolls.push({ label, dice, kind: after?.[1]?.endsWith('hit points') ? (/temporary/.test(after[1]) ? 'tempHp' : 'heal') : after ? 'damage' : 'other' });
    if (rolls.length === 4) break;
  }
  return rolls;
}

/** The handbook's rules with the advancements this character may see added, for the surge dialog and the sheet. */
export function withSecrets(rules: Map<string, RuleEntry>, secrets: Secrets | undefined, version: string): Map<string, RuleEntry> {
  const extra = (secrets?.advancements ?? []).filter((e) => e.kind === 'fruitAdvancement' && typeof e.id === 'string' && (!Array.isArray(e.versions) || e.versions.length === 0 || e.versions.includes(version as never)));
  if (extra.length === 0) return rules;
  const merged = new Map(rules);
  for (const entry of extra) {
    const rarity = /\b(Common|Uncommon|Very Rare|Rare|Legendary)\b/.exec(text(entry.typeLine))?.[1];
    merged.set(entry.id, { ...entry, rarity: entry.rarity ?? rarity, repeatable: entry.repeatable ?? /can be chosen multiple times/i.test(text(entry.text)) });
  }
  return merged;
}
