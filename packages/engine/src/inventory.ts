// What a character carries: items with a count and a weight, and berries. Weight is checked against
// carrying capacity (Strength × 15 lb and what changes it) and said when it is over; nothing is blocked.
import { CUSTOM_BONUS_TYPES, EDGE_TARGETS, GRANT_KINDS, SKILLS, type CharacterDoc, type CustomBonusType, type CustomFeature, type EdgeTarget, type GrantKind, type ProficiencyGrant, type RollEdgeDef, type WeaponDef } from './character';
import { cleanDefenses } from './conditions';
import { parseDice } from './dice';
import { ABILITIES, type Ability, type RuleEntry } from './types';

export const ITEM_KINDS = ['weapon', 'armor', 'shield', 'wondrous', 'consumable', 'gear'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_KIND_NAMES: Record<ItemKind, string> = { weapon: 'Weapon', armor: 'Armor', shield: 'Shield', wondrous: 'Wondrous item', consumable: 'Consumable', gear: 'Gear' };
export const ITEM_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Mythical'] as const;

/**
 * What makes an item of the player's own work on the sheet. While the item is in use: a weapon is
 * listed under Attacks, armor sets Armor Class, a shield adds its 2, and its powers (numbers it adds,
 * charges, dice to roll, a standing note) behave exactly as one of the player's own features does.
 */
export interface CustomItem {
  kind: ItemKind;
  rarity?: string;
  /** What it is worth, in berries. */
  value?: number;
  /** What it is and does, in the player's or the DM's words. */
  text?: string;
  weapon?: Pick<WeaponDef, 'damage' | 'damageType' | 'category' | 'ranged' | 'finesse' | 'twoHanded' | 'heavy' | 'bonus'>;
  /** Armor formula: base + Dexterity modifier, limited to dexCap when set (0 for heavy armor, null for light). */
  armor?: { base: number; dexCap?: number | null; /** Disadvantage on Stealth checks while worn. */ stealthDisadvantage?: boolean };
  action?: CustomFeature['action'];
  /** Charges, and when they come back. */
  uses?: CustomFeature['uses'];
  rolls?: CustomFeature['rolls'];
  bonuses?: CustomFeature['bonuses'];
  /** A standing line for "In effect" (a resistance, an advantage). */
  note?: string;
  /** True for an item that only works once its bearer has attuned to it. */
  attune?: boolean;
  /** Ability scores it changes: "set" makes the score that number if it is lower (a Headband of Intellect's 19); "bonus" raises it, to 30 at most. */
  abilities?: CustomFeature['abilities'];
  /** A bonus to saving throws: one ability's, or all of them when none is named. */
  saves?: CustomFeature['saves'];
  /** A bonus to skill checks: one skill's, or all of them when none is named. */
  skills?: CustomFeature['skills'];
  /** Spells it lets its bearer cast: by name, with the rules entry when the spell is one the library has. */
  spells?: { name: string; level: number; entry?: string }[];
  /** Advantage or disadvantage it gives on a kind of d20 roll while in use. */
  edges?: CustomFeature['edges'];
  /** Proficiencies it grants while in use. */
  grants?: CustomFeature['grants'];
  /** Damage it gives resistance, immunity or vulnerability to, and conditions it makes its bearer immune to, while in use. */
  defenses?: CustomFeature['defenses'];
  /** Where its text is from, when it was started from an item in the book. */
  source?: { book: string; page: number };
}


export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  /** Weight of one, in pounds. */
  weight?: number;
  /** The armory entry it came from, when it did. */
  item?: string;
  notes?: string;
  /** false: left on the ship or at home. It stays in the list but does not count toward weight carried. */
  carried?: boolean;
  /** Set on an item the player made themselves: what it does on the sheet while it is in use. */
  custom?: CustomItem;
  /** True while a made item is in use (wielded, worn). */
  equipped?: boolean;
  /** True while the character is attuned to it. Counted against the three a character can be attuned to. */
  attuned?: boolean;
}

export interface InventoryLine extends InventoryItem {
  /** qty × weight, in pounds; 0 when no weight is given. */
  total: number;
  carried: boolean;
}

/** "8 lb." → 8, "1/4 lb." → 0.25, "—" → undefined. */
export function parseWeight(text: unknown): number | undefined {
  if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? text : undefined;
  const m = /(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)/.exec(String(text ?? ''));
  if (!m) return undefined;
  if (m[1] && m[2]) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : undefined;
  return Number(m[3]);
}

/** ฿1,250,000: every berry, for a purse (bounty.ts has the short form, ฿1.25M). */
export function exactBerries(amount: number): string {
  // A debt reads "-฿750,000", the sign before the berry mark.
  const whole = Math.round(amount);
  return `${whole < 0 ? '-' : ''}฿${Math.abs(whole).toLocaleString('en-US')}`;
}

/** An armory entry as something carried. */
export function inventoryFromItem(entry: RuleEntry, id: string, qty = 1): InventoryItem {
  return { id, name: entry.name, qty, weight: parseWeight(entry.weight), item: entry.id };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Every item with its total weight, and the weight carried against the capacity. */
export function carriedWeight(items: InventoryItem[] | undefined, capacity: number): { lines: InventoryLine[]; carried: number; capacity: number; over: boolean } {
  const lines = (items ?? []).map((item) => {
    const qty = Number.isFinite(item.qty) ? Math.max(0, item.qty) : 0;
    const each = typeof item.weight === 'number' && Number.isFinite(item.weight) ? Math.max(0, item.weight) : 0;
    return { ...item, qty, carried: item.carried !== false, total: round(qty * each) };
  });
  const carried = round(lines.reduce((sum, line) => sum + (line.carried ? line.total : 0), 0));
  return { lines, carried, capacity, over: carried > capacity };
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const words = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);
const within = (value: unknown, min: number, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : undefined);
const rollable = (dice: unknown): dice is string => { if (typeof dice !== 'string' || !dice.trim()) return false; try { parseDice(dice); return true; } catch { return false; } };

/** A made item with every part the right kind of thing, or undefined when it is not one. Dice that cannot be rolled are dropped. */
export function cleanCustomItem(raw: unknown): CustomItem | undefined {
  if (!isObject(raw) || !(ITEM_KINDS as readonly unknown[]).includes(raw.kind)) return undefined;
  const item: CustomItem = { kind: raw.kind as ItemKind };
  const rarity = words(raw.rarity, 30);
  if (rarity) item.rarity = rarity;
  const value = within(raw.value, 0, 1e15);
  if (value !== undefined) item.value = value;
  const text = words(raw.text, 6000);
  if (text) item.text = text;
  if (item.kind === 'weapon' && isObject(raw.weapon) && typeof raw.weapon.damage === 'string' && /^\d*d\d+$/.test(raw.weapon.damage.trim())) {
    const w = raw.weapon;
    const bonus = within(w.bonus, -10, 10);
    item.weapon = {
      damage: (w.damage as string).trim(), damageType: words(w.damageType, 30) ?? '', category: w.category === 'martial' ? 'martial' : w.category === 'improvised' ? 'improvised' : 'simple',
      ...(w.ranged === true ? { ranged: true } : {}), ...(w.finesse === true ? { finesse: true } : {}), ...(w.twoHanded === true ? { twoHanded: true } : {}), ...(w.heavy === true ? { heavy: true } : {}),
      ...(bonus ? { bonus } : {}),
    };
  }
  if (item.kind === 'armor' && isObject(raw.armor)) {
    const base = within(raw.armor.base, 0, 40);
    if (base !== undefined) item.armor = { base, dexCap: raw.armor.dexCap === null || raw.armor.dexCap === undefined ? null : within(raw.armor.dexCap, 0, 10) ?? null, ...(raw.armor.stealthDisadvantage === true ? { stealthDisadvantage: true } : {}) };
  }
  if (raw.action === 'action' || raw.action === 'bonus' || raw.action === 'reaction') item.action = raw.action;
  if (isObject(raw.uses)) {
    const max = within(raw.uses.max, 0, 999);
    if (max) item.uses = { max, recharge: raw.uses.recharge === 'short' ? 'short' : 'long' };
  }
  if (Array.isArray(raw.rolls)) {
    const rolls = raw.rolls.filter(isObject).filter((r) => rollable(r.dice)).slice(0, 8).map((r) => ({
      label: words(r.label, 60) ?? (r.dice as string).trim(), dice: (r.dice as string).trim(),
      kind: (r.kind === 'heal' || r.kind === 'tempHp' || r.kind === 'other' ? r.kind : 'damage') as 'damage' | 'heal' | 'tempHp' | 'other',
    }));
    if (rolls.length) item.rolls = rolls;
  }
  if (Array.isArray(raw.bonuses)) {
    const seen = new Set<string>();
    const bonuses = raw.bonuses.filter(isObject).flatMap((b) => {
      const amount = within(b.value, -100, 100);
      if (!(CUSTOM_BONUS_TYPES as readonly unknown[]).includes(b.type) || !amount || seen.has(b.type as string)) return [];
      seen.add(b.type as string);
      return [{ type: b.type as CustomBonusType, value: amount }];
    });
    if (bonuses.length) item.bonuses = bonuses;
  }
  const note = words(raw.note, 200);
  if (note) item.note = note;
  if (raw.attune === true) item.attune = true;
  const ability = (value: unknown): value is Ability => (ABILITIES as readonly unknown[]).includes(value);
  if (Array.isArray(raw.abilities)) {
    const seen = new Set<string>();
    const abilities = raw.abilities.filter(isObject).flatMap((a) => {
      const set = within(a.set, 1, 30);
      const bonus = within(a.bonus, -20, 20);
      if (!ability(a.ability) || seen.has(a.ability) || (set === undefined && !bonus)) return [];
      seen.add(a.ability);
      return [{ ability: a.ability, ...(set !== undefined ? { set } : {}), ...(bonus ? { bonus } : {}) }];
    });
    if (abilities.length) item.abilities = abilities;
  }
  if (Array.isArray(raw.saves)) {
    const seen = new Set<string>();
    const saves = raw.saves.filter(isObject).flatMap((s) => {
      const value = within(s.value, -20, 20);
      const key = ability(s.ability) ? s.ability : 'all';
      if (!value || (s.ability !== undefined && s.ability !== null && s.ability !== '' && !ability(s.ability)) || seen.has(key)) return [];
      seen.add(key);
      return [{ ...(ability(s.ability) ? { ability: s.ability } : {}), value }];
    });
    if (saves.length) item.saves = saves;
  }
  if (Array.isArray(raw.skills)) {
    const seen = new Set<string>();
    const skills = raw.skills.filter(isObject).flatMap((s) => {
      const value = within(s.value, -20, 20);
      const known = typeof s.skill === 'string' && SKILLS.some((k) => k.id === s.skill);
      const key = known ? (s.skill as string) : 'all';
      if (!value || (s.skill !== undefined && s.skill !== null && s.skill !== '' && !known) || seen.has(key)) return [];
      seen.add(key);
      return [{ ...(known ? { skill: s.skill as string } : {}), value }];
    });
    if (skills.length) item.skills = skills;
  }
  if (Array.isArray(raw.edges)) {
    const seen = new Set<string>();
    const edges = raw.edges.filter(isObject).flatMap((e) => {
      const mode = e.mode === 'advantage' ? ('advantage' as const) : e.mode === 'disadvantage' ? ('disadvantage' as const) : null;
      const on = (EDGE_TARGETS as readonly unknown[]).includes(e.on) ? (e.on as EdgeTarget) : null;
      const skill = on === 'skill' && typeof e.skill === 'string' && SKILLS.some((k) => k.id === e.skill) ? e.skill : undefined;
      const of = (on === 'save' || on === 'check') && ability(e.ability) ? e.ability : undefined;
      // A skill or ability that is named but is not one is a mistake, not "all of them".
      if (!mode || !on || (on === 'skill' && e.skill && !skill) || ((on === 'save' || on === 'check') && e.ability && !of)) return [];
      const key = `${on}/${skill ?? of ?? ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ mode, on, ...(skill ? { skill } : {}), ...(of ? { ability: of } : {}) }];
    }).slice(0, 20);
    if (edges.length) item.edges = edges;
  }
  if (Array.isArray(raw.grants)) {
    const seen = new Set<string>();
    const ARMOR = ['light', 'medium', 'heavy', 'shields'];
    const grants = raw.grants.filter(isObject).flatMap((g) => {
      const kind = (GRANT_KINDS as readonly unknown[]).includes(g.kind) ? (g.kind as GrantKind) : null;
      const id = words(g.id, 60);
      if (!kind || !id) return [];
      const ok = kind === 'skill' || kind === 'expertise' ? SKILLS.some((k) => k.id === id) : kind === 'save' ? ability(id) : kind === 'armor' ? ARMOR.includes(id) : true;
      const key = `${kind}/${id.toLowerCase()}`;
      if (!ok || seen.has(key)) return [];
      seen.add(key);
      return [{ kind, id }];
    }).slice(0, 20);
    if (grants.length) item.grants = grants;
  }
  const defenses = cleanDefenses(raw.defenses);
  if (defenses) item.defenses = defenses;
  if (isObject(raw.source) && typeof raw.source.book === 'string' && raw.source.book.trim()) {
    const page = within(raw.source.page, 0, 9999);
    if (page !== undefined) item.source = { book: raw.source.book.trim().slice(0, 80), page };
  }
  if (Array.isArray(raw.spells)) {
    const spells = raw.spells.filter(isObject).flatMap((s) => {
      const name = words(s.name, 80);
      return name ? [{ name, level: within(s.level, 0, 9) ?? 0, ...(typeof s.entry === 'string' && s.entry.length <= 120 ? { entry: s.entry } : {}) }] : [];
    }).slice(0, 20);
    if (spells.length) item.spells = spells;
  }
  return item;
}

/** Whether a made item changes anything on the sheet when put to use (a plain crate of oranges does not). */
export function itemDoesSomething(custom: CustomItem | undefined): boolean {
  return Boolean(custom && (custom.weapon || custom.armor || custom.kind === 'shield' || custom.uses || custom.rolls?.length || custom.bonuses?.length || custom.note || custom.action
    || custom.abilities?.length || custom.saves?.length || custom.skills?.length || custom.spells?.length || custom.edges?.length || custom.grants?.length || custom.defenses));
}

const BONUS_WORDS: Record<CustomBonusType, string> = { ac: 'AC', speed: 'ft speed', initiative: 'initiative', hp: 'hit points', attack: 'to attacks', damage: 'damage' };
const plus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const ABILITY_SHORT: Record<Ability, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

/** "Stealth checks", "all saving throws", "Strength checks", "attack rolls", "initiative". */
export function edgeTargetName(edge: RollEdgeDef): string {
  if (edge.on === 'skill') return edge.skill ? `${SKILLS.find((k) => k.id === edge.skill)?.name ?? edge.skill} checks` : 'all skill checks';
  if (edge.on === 'save') return edge.ability ? `${ABILITY_SHORT[edge.ability]} saves` : 'all saving throws';
  if (edge.on === 'check') return edge.ability ? `${ABILITY_SHORT[edge.ability]} checks` : 'all ability checks';
  return edge.on === 'attack' ? 'attack rolls' : 'initiative';
}
/** "proficiency in Stealth", "expertise in Stealth", "proficiency in Wis saves", "proficiency with heavy armor". */
export function grantName(grant: ProficiencyGrant): string {
  if (grant.kind === 'skill' || grant.kind === 'expertise') return `${grant.kind === 'skill' ? 'proficiency' : 'expertise'} in ${SKILLS.find((k) => k.id === grant.id)?.name ?? grant.id}`;
  if (grant.kind === 'save') return `proficiency in ${ABILITY_SHORT[grant.id as Ability] ?? grant.id} saves`;
  if (grant.kind === 'armor') return `proficiency with ${grant.id === 'shields' ? 'shields' : `${grant.id} armor`}`;
  return `proficiency with ${grant.id.replace(/_/g, ' ')}${grant.kind === 'weapon' && !/weapon/i.test(grant.id) ? ' weapons' : ''}`;
}

/** One line saying what a made item is and does: "Weapon · 1d8 slashing, +1 · +1 AC · 3 charges (long rest) · Rare". */
export function itemSummary(custom: CustomItem): string {
  const parts: string[] = [ITEM_KIND_NAMES[custom.kind]];
  if (custom.weapon) {
    const w = custom.weapon;
    const tags = [w.category === 'martial' ? 'martial' : w.category === 'simple' ? 'simple' : 'improvised', w.ranged ? 'ranged' : '', w.finesse ? 'finesse' : '', w.twoHanded ? 'two-handed' : '', w.heavy ? 'heavy' : ''].filter(Boolean).join(', ');
    parts.push(`${w.damage}${w.damageType ? ` ${w.damageType}` : ''}${w.bonus ? `, ${plus(w.bonus)} to hit and damage` : ''} (${tags})`);
  }
  if (custom.armor) parts.push(`AC ${custom.armor.base}${custom.armor.dexCap === 0 ? '' : custom.armor.dexCap == null ? ' + Dex' : ` + Dex (max ${custom.armor.dexCap})`}${custom.armor.stealthDisadvantage ? ', disadvantage on Stealth' : ''}`);
  if (custom.kind === 'shield') parts.push('+2 AC');
  for (const a of custom.abilities ?? []) parts.push([a.set !== undefined ? `${ABILITY_SHORT[a.ability]} ${a.set}` : '', a.bonus ? `${plus(a.bonus)} ${ABILITY_SHORT[a.ability]}` : ''].filter(Boolean).join(', '));
  for (const b of custom.bonuses ?? []) parts.push(`${plus(b.value)} ${BONUS_WORDS[b.type]}`);
  for (const v of custom.saves ?? []) parts.push(`${plus(v.value)} to ${v.ability ? `${ABILITY_SHORT[v.ability]} saves` : 'all saves'}`);
  for (const k of custom.skills ?? []) parts.push(`${plus(k.value)} to ${k.skill ? SKILLS.find((x) => x.id === k.skill)?.name ?? k.skill : 'all skills'}`);
  for (const e of custom.edges ?? []) parts.push(`${e.mode} on ${edgeTargetName(e)}`);
  for (const g of custom.grants ?? []) parts.push(grantName(g));
  if (custom.defenses?.resist?.length) parts.push(`resistance to ${custom.defenses.resist.join(', ')}`);
  if (custom.defenses?.immune?.length) parts.push(`immunity to ${custom.defenses.immune.join(', ')}`);
  if (custom.defenses?.vulnerable?.length) parts.push(`vulnerability to ${custom.defenses.vulnerable.join(', ')}`);
  if (custom.defenses?.conditions?.length) parts.push(`can’t be ${custom.defenses.conditions.join(', ')}`);
  if (custom.spells?.length) parts.push(`casts ${custom.spells.map((x) => x.name).join(', ')}`);
  if (custom.uses) parts.push(`${custom.uses.max} charge${custom.uses.max === 1 ? '' : 's'} (${custom.uses.recharge} rest)`);
  for (const r of custom.rolls ?? []) parts.push(`${r.label === r.dice ? '' : `${r.label} `}${r.dice}`);
  if (custom.note) parts.push(custom.note);
  if (custom.attune) parts.push('requires attunement');
  if (custom.rarity) parts.push(custom.rarity);
  if (custom.value) parts.push(exactBerries(custom.value));
  return parts.join(' · ');
}

/** Whether an item is one a character attunes to: one the player made that way, or one from the armory whose text says so. */
export function itemNeedsAttunement(item: InventoryItem, entry?: RuleEntry): boolean {
  if (item.custom) return item.custom.attune === true;
  const text = [entry?.text, ...((entry?.features ?? []) as { text?: unknown }[]).map((f) => f.text)].filter((t) => typeof t === 'string').join(' ');
  return /requires attunement/i.test(text);
}

/**
 * Whether an item is one whose powers count right now: made by the player, in use, on their person, not
 * all used up, and attuned to when it is one that needs that.
 */
export const itemInUse = (item: InventoryItem): boolean => Boolean(item.custom && item.equipped && item.carried !== false && item.qty > 0 && (!item.custom.attune || item.attuned === true));

/**
 * The character as the sheet should work it out: the saved one, plus what the made items in use bring.
 * A weapon joins the weapons, armor is worn (the first, if the player is somehow using two), a shield
 * is taken up, and powers join the player's own features. Nothing is saved from here: put the item
 * away and it is all gone again.
 */
export function withEquippedItems(doc: CharacterDoc): CharacterDoc {
  const used = (doc.inventory ?? []).filter(itemInUse);
  if (used.length === 0) return doc;
  const weapons = [...doc.weapons];
  const features = [...(doc.customFeatures ?? [])];
  const spells = [...(doc.spells ?? [])];
  let armor = doc.armor;
  let shield = doc.shield;
  let worn = false;
  for (const item of used) {
    const custom = item.custom!;
    if (custom.weapon) weapons.push({ id: `item:${item.id}`, name: item.name, ...custom.weapon });
    if (custom.armor && !worn) { armor = { name: item.name, base: custom.armor.base, dexCap: custom.armor.dexCap, stealthDisadvantage: custom.armor.stealthDisadvantage === true }; worn = true; }
    if (custom.kind === 'shield') shield = true;
    for (const [i, spell] of (custom.spells ?? []).entries()) spells.push({ id: `item-${item.id}-${i}`, name: spell.name, level: spell.level, ...(spell.entry ? { entry: spell.entry } : {}), item: item.name, notes: `From ${item.name}` });
    if (custom.uses || custom.rolls?.length || custom.bonuses?.length || custom.note || custom.action || custom.text || custom.abilities?.length || custom.saves?.length || custom.skills?.length || custom.edges?.length || custom.grants?.length || custom.defenses) {
      features.push({
        id: `item-${item.id}`, name: item.name, text: custom.text ?? '', origin: custom.rarity ? `Item (${custom.rarity})` : 'Item',
        ...(custom.action ? { action: custom.action } : {}), ...(custom.uses ? { uses: custom.uses } : {}), ...(custom.rolls ? { rolls: custom.rolls } : {}),
        ...(custom.bonuses ? { bonuses: custom.bonuses } : {}), ...(custom.note ? { note: custom.note } : {}),
        ...(custom.abilities ? { abilities: custom.abilities } : {}), ...(custom.saves ? { saves: custom.saves } : {}), ...(custom.skills ? { skills: custom.skills } : {}),
        ...(custom.edges ? { edges: custom.edges } : {}), ...(custom.grants ? { grants: custom.grants } : {}), ...(custom.defenses ? { defenses: custom.defenses } : {}),
      });
    }
  }
  return { ...doc, weapons, armor, shield, customFeatures: features, ...(spells.length ? { spells } : {}) };
}

/** A magic item as the handbook prints it: its words, and what its heading says about it. */
export interface BookMagicItem {
  id: string;
  name: string;
  /** Word for word, heading line included. */
  text: string;
  book: string;
  page: number;
  /** The rules entry it is printed under ("Dials & Dial Inventions"). */
  chapter: string;
  kind: ItemKind;
  /** What the heading names in brackets: "scimitar", "dial". */
  base?: string;
  rarity?: string;
  attune: boolean;
  /** Its listed cost in berries, when the text gives one. */
  value?: number;
}

const HEADING = /^(Weapon|Armor|Shield|Wondrous Item|Ammunition|Potion|Ring|Rod|Staff|Wand)(?: \(([^)]*)\))?, (Common|Uncommon|Rare|Very Rare|Legendary|Mythical)(?: \(([^)]*)\))?\s*$/i;
const BOOK_KINDS: Record<string, ItemKind> = { weapon: 'weapon', armor: 'armor', shield: 'shield', ammunition: 'consumable', potion: 'consumable' };

/**
 * The magic items the handbook describes in its armory chapters (Dials, Meitos, gadgets). The book gives
 * them as text, so the sheet cannot work them out by itself: they are offered as the start of an item of
 * the player's own, with the book's words and page, for the player to add the numbers to.
 */
export function bookMagicItems(rules: Map<string, RuleEntry>): BookMagicItem[] {
  const found: BookMagicItem[] = [];
  for (const entry of rules.values()) {
    if (entry.kind !== 'rule' || !Array.isArray(entry.sections)) continue;
    for (const section of entry.sections as { name?: unknown; text?: unknown; page?: unknown }[]) {
      if (typeof section.name !== 'string' || typeof section.text !== 'string') continue;
      const heading = HEADING.exec(section.text.split('\n')[0]!.trim());
      if (!heading) continue;
      const cost = /Cost:\s*฿\s*([\d,]+)/.exec(section.text);
      const rarity = heading[3]!.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      found.push({
        id: `${entry.id}#${section.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, name: section.name, text: section.text, book: entry.source.book,
        page: typeof section.page === 'number' ? section.page : entry.source.page, chapter: entry.name,
        kind: BOOK_KINDS[heading[1]!.toLowerCase()] ?? 'wondrous', base: heading[2]?.trim() || undefined, rarity,
        attune: /requires attunement/i.test(heading[4] ?? ''), value: cost ? Number(cost[1]!.replace(/,/g, '')) : undefined,
      });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
