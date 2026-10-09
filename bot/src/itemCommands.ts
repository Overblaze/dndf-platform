// What /item says and does, with no Discord and no database in it. An item added here is the same
// thing the website's Gear tab and item maker save, checked by the same engine.
import {
  ABILITY_NAMES, SKILLS, armorFromItem, cleanCustomItem, inventoryFromItem, itemDoesSomething, itemInUse, itemNeedsAttunement, itemSummary, parseWeight, weaponFromItem,
  type Ability, type CharacterDoc, type CustomItem, type InventoryItem, type RuleEntry, type Sheet,
} from '@dndf/engine';
import type { Outcome } from './commands';

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lb = (n: number) => `${Math.round(n * 100) / 100} lb`;
const carriedLine = (sheet: Sheet) => `Carrying ${lb(sheet.gear.carried)} of ${lb(sheet.gear.capacity)}${sheet.gear.over ? ' — more than they can carry' : ''}.`;

/** The item in the list a player meant: an exact name, else the one that starts with or contains what was typed. */
export function findItem(doc: CharacterDoc, what: string): { found?: InventoryItem; close: string[] } {
  const want = norm(what);
  const items = (doc.inventory ?? []).map((item) => ({ item, name: norm(item.name) }));
  if (!want) return { close: items.map(({ item }) => item.name).slice(0, 10) };
  for (const test of [(n: string) => n === want, (n: string) => n.startsWith(want), (n: string) => n.includes(want)]) {
    const hits = items.filter(({ name }) => test(name));
    if (hits.length === 1) return { found: hits[0]!.item, close: [] };
    if (hits.length > 1) return { close: [...new Set(hits.map(({ item }) => item.name))].slice(0, 10) };
  }
  return { close: [] };
}
const notFound = (doc: CharacterDoc, sheet: Sheet, what: string, close: string[]): Outcome => ({
  reply: close.length ? `"${what}" could be: ${close.join(', ')}. Which one?` : `**${sheet.name}** carries nothing called "${what}".${doc.inventory?.length ? ` They have: ${doc.inventory.map((i) => i.name).slice(0, 15).join(', ')}.` : ''}`,
});

export interface AddInput { name: string; quantity?: number | null; weight?: number | null; notes?: string | null }

/**
 * /item add: something from the book's armory by name (it comes with its weight, and can be put to use
 * on the website like any armory item), or else a plain thing with a name, a count and a weight.
 */
export function itemAdd(doc: CharacterDoc, sheet: Sheet, input: AddInput, armory: RuleEntry[], makeId: () => string, resheet: (next: CharacterDoc) => Sheet): Outcome {
  const name = input.name.trim().slice(0, 80);
  if (!name) return { reply: 'Give the item a name.' };
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const entry = armory.find((e) => e.id === name) ?? armory.find((e) => norm(e.name) === norm(name));
  const notes = input.notes?.trim().slice(0, 300) || undefined;
  const item: InventoryItem = entry
    ? { ...inventoryFromItem(entry, makeId(), qty), ...(typeof input.weight === 'number' ? { weight: Math.max(0, input.weight) } : {}), notes }
    : { id: makeId(), name, qty, weight: typeof input.weight === 'number' ? Math.max(0, input.weight) : undefined, notes };
  const next = { ...doc, inventory: [...(doc.inventory ?? []), item] };
  const facts = [entry ? `from the armory${entry.cost ? ` (listed at ${String(entry.cost)}; nothing was taken from the purse)` : ''}` : 'your own', item.weight !== undefined ? `${lb(item.weight)} each` : 'no weight given'].join(', ');
  return {
    doc: next,
    reply: `🎒 **${sheet.name}** now carries ${qty > 1 ? `${qty} × ` : ''}**${item.name}** — ${facts}.\n${carriedLine(resheet(next))}`,
    log: `Added ${qty > 1 ? `${qty} × ` : ''}${item.name} (Discord)`,
  };
}

export interface MakeInput extends AddInput {
  kind: string;
  rarity?: string | null; worth?: number | null; description?: string | null;
  damage?: string | null; damageType?: string | null; martial?: boolean | null; ranged?: boolean | null; finesse?: boolean | null; twoHanded?: boolean | null; weaponBonus?: number | null;
  armorClass?: number | null; armorDex?: string | null; stealthDisadvantage?: boolean | null;
  acBonus?: number | null; speedBonus?: number | null; hpBonus?: number | null;
  charges?: number | null; recharge?: string | null; roll?: string | null; rollIs?: string | null; rollName?: string | null; effect?: string | null;
  /** One ability score it changes: to a number (if lower), or up by one. */
  ability?: string | null; abilityBecomes?: number | null; abilityBonus?: number | null;
  /** A bonus to every saving throw. */
  saveBonus?: number | null;
  skill?: string | null; skillBonus?: number | null;
  /** Spells it lets its bearer cast, separated by commas. */
  spells?: string | null;
  attunement?: boolean | null;
  useNow?: boolean | null;
}

/** What changed on the sheet between two workings-out of it, for a reply. */
function sheetChanges(before: Sheet, after: Sheet): string[] {
  const abilities = (Object.keys(after.abilities) as Ability[]).filter((a) => after.abilities[a].score !== before.abilities[a].score)
    .map((a) => `${ABILITY_NAMES[a]} ${before.abilities[a].score} → **${after.abilities[a].score}** (${after.abilities[a].mod >= 0 ? '+' : ''}${after.abilities[a].mod})`);
  return [
    ...abilities,
    after.ac.value !== before.ac.value ? `AC ${before.ac.value} → **${after.ac.value}**` : '', after.speed.value !== before.speed.value ? `speed ${before.speed.value} → **${after.speed.value} ft**` : '',
    after.maxHp.value !== before.maxHp.value ? `hit point maximum ${before.maxHp.value} → **${after.maxHp.value}**` : '', after.initiative.value !== before.initiative.value ? `initiative ${before.initiative.value} → **${after.initiative.value}**` : '',
    ...after.attacks.filter((a) => !before.attacks.some((b) => b.name === a.name)).map((a) => `attack **${a.toHit.value >= 0 ? '+' : ''}${a.toHit.value}** to hit, ${a.damage} ${a.damageType}`),
    before.attacks.some((b) => !after.attacks.some((a) => a.name === b.name)) ? 'it is no longer under Attacks' : '',
    after.spellbook.known.length > before.spellbook.known.length ? `${after.spellbook.known.filter((k) => !before.spellbook.known.some((b) => b.id === k.id)).map((k) => k.name).join(', ')} on the spell list` : '',
  ].filter(Boolean);
}
const attunementLine = (sheet: Sheet) => `Attuned to ${sheet.attunement.used} of ${sheet.attunement.max.value}${sheet.attunement.over ? ' — more than the rules allow; nothing is stopped' : ''}.`;

/** /make: an item of the player's own that works on the sheet, from what was typed into the command. */
export function itemMake(doc: CharacterDoc, sheet: Sheet, input: MakeInput, makeId: () => string, resheet: (next: CharacterDoc) => Sheet, spellNamed: (name: string) => RuleEntry | undefined = () => undefined): Outcome {
  const name = input.name.trim().slice(0, 80);
  if (!name) return { reply: 'Give the item a name.' };
  const dropped: string[] = [];
  const bonuses = [['ac', input.acBonus], ['speed', input.speedBonus], ['hp', input.hpBonus]].filter(([, v]) => typeof v === 'number' && v !== 0).map(([type, value]) => ({ type, value }));
  // A skill may arrive as its id (picked from the suggestions) or as its name, typed.
  const typedSkill = input.skill?.trim().toLowerCase();
  const skillId = typedSkill ? SKILLS.find((k) => k.id === typedSkill || k.name.toLowerCase() === typedSkill)?.id ?? null : undefined;
  if (skillId === null) dropped.push(`"${input.skill}" is not a skill, so the skill bonus was left off`);
  const raw = {
    kind: input.kind, rarity: input.rarity ?? undefined, value: input.worth ?? undefined, text: input.description ?? undefined,
    weapon: input.kind === 'weapon' ? { damage: (input.damage ?? '').replace(/\s+/g, ''), damageType: input.damageType ?? '', category: input.martial ? 'martial' : 'simple', ranged: input.ranged === true, finesse: input.finesse === true, twoHanded: input.twoHanded === true, bonus: input.weaponBonus ?? undefined } : undefined,
    armor: input.kind === 'armor' && typeof input.armorClass === 'number' ? { base: input.armorClass, dexCap: input.armorDex === 'none' ? 0 : input.armorDex === 'max2' ? 2 : null, stealthDisadvantage: input.stealthDisadvantage === true } : undefined,
    bonuses,
    uses: input.charges ? { max: input.charges, recharge: input.recharge === 'short' ? 'short' : 'long' } : undefined,
    rolls: input.roll ? [{ label: input.rollName ?? '', dice: input.roll, kind: input.rollIs ?? (input.kind === 'consumable' ? 'heal' : 'damage') }] : undefined,
    note: input.effect ?? undefined,
    attune: input.attunement === true,
    abilities: input.ability ? [{ ability: input.ability, set: input.abilityBecomes ?? undefined, bonus: input.abilityBonus ?? undefined }] : undefined,
    saves: input.saveBonus ? [{ value: input.saveBonus }] : undefined,
    skills: input.skillBonus && skillId !== null ? [{ skill: skillId ?? undefined, value: input.skillBonus }] : undefined,
    spells: (input.spells ?? '').split(',').map((name) => name.trim()).filter(Boolean).map((name) => { const entry = spellNamed(name); return { name: entry?.name ?? name, level: typeof entry?.level === 'number' ? entry.level : 1, entry: entry?.id }; }),
  };
  const custom: CustomItem | undefined = cleanCustomItem(raw);
  if (!custom) return { reply: `"${input.kind}" is not a kind of item I know. Use weapon, armor, shield, wondrous, consumable or gear.` };
  if (input.kind === 'weapon' && !custom.weapon) dropped.push(input.damage ? `its damage "${input.damage}" is not dice like 1d8, so it will not show under Attacks until that is fixed on the website` : 'no damage dice were given, so it will not show under Attacks until they are added on the website');
  if (input.kind === 'armor' && !custom.armor) dropped.push('no base Armor Class was given (armor_class), so it will not change Armor Class until one is added on the website');
  if (input.roll && !custom.rolls?.length) dropped.push(`"${input.roll}" is not dice I can roll (write it like 2d6+3), so that roll was left off`);
  if (input.kind !== 'weapon' && (input.damage || typeof input.weaponBonus === 'number')) dropped.push('damage and the weapon’s own bonus only apply to a weapon');
  if (!input.ability && (typeof input.abilityBecomes === 'number' || typeof input.abilityBonus === 'number')) dropped.push('no ability was chosen, so the ability score change was left off');
  if (input.ability && !custom.abilities?.length) dropped.push('an ability was chosen but no number to set it to or raise it by, so it was left off');
  if (skillId && !input.skillBonus) dropped.push('a skill was chosen but no skill_bonus, so it was left off');
  if (input.kind !== 'armor' && typeof input.armorClass === 'number') dropped.push('the armor_class option only applies to armor (use ac_bonus for a bonus)');
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const use = input.useNow === true && itemDoesSomething(custom);
  // "Use now" on an item that needs attunement attunes to it too: that is what the player asked for.
  const item: InventoryItem = { id: makeId(), name, qty, weight: typeof input.weight === 'number' ? Math.max(0, input.weight) : undefined, notes: input.notes?.trim().slice(0, 300) || undefined, custom, ...(use ? { equipped: true } : {}), ...(use && custom.attune ? { attuned: true } : {}) };
  const next = { ...doc, inventory: [...(doc.inventory ?? []), item] };
  const after = resheet(next);
  const lines = [`🛠️ **${sheet.name}** has a new item: ${qty > 1 ? `${qty} × ` : ''}**${name}**`, itemSummary(custom)];
  if (custom.text) lines.push(`> ${custom.text.slice(0, 300)}${custom.text.length > 300 ? '…' : ''}`);
  if (use) {
    const changes = sheetChanges(sheet, after);
    lines.push(`In use${custom.attune ? ' and attuned' : ''} now${changes.length ? `: ${changes.join(' · ')}` : '.'}`);
    if (custom.attune) lines.push(attunementLine(after));
  } else if (itemDoesSomething(custom)) lines.push(`Not in use yet. \`/item use item: ${name}\`${custom.attune ? ' with `attune: attune`' : ''} puts it to use.`);
  for (const d of dropped) lines.push(`⚠️ ${d[0]!.toUpperCase()}${d.slice(1)}.`);
  lines.push(carriedLine(after));
  return { doc: next, reply: lines.join('\n'), log: `Made ${name} (Discord): ${itemSummary(custom)}` };
}

/**
 * /item use: put an item to use or away, and attune to it or end the attunement. An item the player made
 * is switched on; a weapon, armor or shield from the armory is readied or worn as the website's Gear tab does.
 */
export function itemUse(doc: CharacterDoc, sheet: Sheet, what: string, on: boolean, resheet: (next: CharacterDoc) => Sheet, more: { attune?: 'attune' | 'end' | null; rules?: Map<string, RuleEntry> } = {}): Outcome {
  const { found, close } = findItem(doc, what);
  if (!found) return notFound(doc, sheet, what, close);
  const entry = found.item ? more.rules?.get(found.item) : undefined;
  const attuneTo = more.attune === 'attune' ? true : more.attune === 'end' ? false : undefined;
  let next = doc;
  const said: string[] = [];
  const patch = (change: Partial<InventoryItem>) => { next = { ...next, inventory: next.inventory!.map((i) => (i.id === found.id ? { ...i, ...change } : i)) }; };

  if (found.custom) {
    if (!itemDoesSomething(found.custom) && attuneTo === undefined) return { reply: `**${found.name}** has nothing to switch on: it is carried and weighed, and that is all.` };
    if (itemDoesSomething(found.custom) && (found.equipped === true) !== on) { patch({ equipped: on || undefined }); said.push(on ? 'puts it to use' : 'puts it away'); }
  } else if (entry) {
    const weapon = weaponFromItem(entry, `armory:${found.id}`);
    const armor = armorFromItem(entry);
    if (weapon) {
      const has = doc.weapons.some((w) => w.name === entry.name);
      if (on && !has) { next = { ...next, weapons: [...next.weapons, weapon] }; said.push('readies it'); }
      if (!on && has) { next = { ...next, weapons: next.weapons.filter((w) => w.name !== entry.name) }; said.push('puts it away'); }
    } else if (armor) {
      if (on && doc.armor?.name !== entry.name) { next = { ...next, armor }; said.push('puts it on'); }
      if (!on && doc.armor?.name === entry.name) { next = { ...next, armor: null }; said.push('takes it off'); }
    } else if (entry.itemType === 'shield') {
      if (on && !doc.shield) { next = { ...next, shield: true }; said.push('takes it up'); }
      if (!on && doc.shield) { next = { ...next, shield: false }; said.push('puts it down'); }
    } else if (attuneTo === undefined) return { reply: `**${found.name}** is not something that is wielded or worn. It is carried, and that is all.` };
  } else if (attuneTo === undefined) return { reply: `**${found.name}** is a plain item with nothing to switch on. \`/make\` makes one that does something; any item can be attuned to with \`attune: attune\`.` };

  if (attuneTo !== undefined && (found.attuned === true) !== attuneTo) { patch({ attuned: attuneTo || undefined }); said.push(attuneTo ? 'attunes to it' : 'ends the attunement'); }
  if (said.length === 0) return { reply: `Nothing to change: **${found.name}** is already ${on ? 'in use' : 'put away'}${attuneTo === undefined ? '' : attuneTo ? ' and attuned' : ' and not attuned'}.` };

  const after = resheet(next);
  const now = next.inventory!.find((i) => i.id === found.id)!;
  const changes = sheetChanges(sheet, after);
  const lines = [`${on ? '🗡️' : '📦'} **${sheet.name}** ${said.join(' and ')}: **${found.name}**${changes.length ? ` — ${changes.join(' · ')}` : '.'}`];
  if (now.custom && now.equipped && !itemInUse(now)) lines.push(now.qty <= 0 ? 'It is used up, so it does nothing until there is more of it.' : now.carried === false ? 'It is stowed, so it does nothing until it is carried.' : 'It requires attunement, so it does nothing until they attune to it: add `attune: attune`.');
  if (now.custom?.attune && now.attuned && !now.equipped) lines.push('Attuned, but not in use: it does nothing until it is put to use.');
  if (attuneTo !== undefined || itemNeedsAttunement(now, entry)) lines.push(attunementLine(after));
  return { doc: next, reply: lines.join('\n'), log: `${said.map((x) => x[0]!.toUpperCase() + x.slice(1)).join(', ')}: ${found.name} (Discord)` };
}

/** /item remove: some or all of one item. */
export function itemRemove(doc: CharacterDoc, sheet: Sheet, what: string, quantity: number | null, resheet: (next: CharacterDoc) => Sheet): Outcome {
  const { found, close } = findItem(doc, what);
  if (!found) return notFound(doc, sheet, what, close);
  const take = quantity === null ? found.qty : Math.max(0, Math.floor(quantity));
  if (quantity !== null && take === 0) return { reply: 'Nothing to change: the quantity was 0.' };
  const left = Math.max(0, found.qty - take);
  const all = quantity === null || left === 0;
  const next = { ...doc, inventory: all ? doc.inventory!.filter((i) => i.id !== found.id) : doc.inventory!.map((i) => (i.id === found.id ? { ...i, qty: left } : i)) };
  return {
    doc: next,
    reply: `🗑️ **${sheet.name}** ${all ? `no longer carries **${found.name}**` : `has ${left} × **${found.name}** left (${Math.min(take, found.qty)} removed)`}.\n${carriedLine(resheet(next))}`,
    log: all ? `Removed ${found.name} (Discord)` : `${found.name}: ${found.qty} → ${left} (Discord)`,
  };
}

/** /item list: everything carried. */
export function itemList(doc: CharacterDoc, sheet: Sheet): Outcome {
  const items = doc.inventory ?? [];
  if (items.length === 0) return { reply: `**${sheet.name}** carries nothing yet. \`/item add\` or \`/make\` to change that.` };
  const lines = items.slice(0, 40).map((i) => {
    const mark = itemInUse(i) ? '🗡️' : i.carried === false ? '📦' : '▫️';
    const facts = [i.custom ? itemSummary(i.custom) : '', i.attuned ? 'attuned' : '', i.custom?.attune && i.equipped && !i.attuned ? 'worn but not attuned' : '', i.weight !== undefined ? `${lb(i.weight)} each` : '', i.carried === false ? 'stowed' : '', i.notes ?? ''].filter(Boolean).join(' · ');
    return `${mark} ${i.qty !== 1 ? `${i.qty} × ` : ''}**${i.name}**${facts ? ` — ${facts}` : ''}`;
  });
  if (items.length > 40) lines.push(`…and ${items.length - 40} more on the website.`);
  return { reply: [`🎒 **${sheet.name}**`, ...lines, carriedLine(sheet), ...(sheet.attunement.used ? [attunementLine(sheet)] : [])].join('\n') };
}

/** Armory names for the autocomplete of /item add. */
export function armoryMatches(armory: RuleEntry[], typed: string): { name: string; value: string }[] {
  const want = norm(typed);
  return armory.filter((e) => norm(e.name).includes(want)).sort((a, b) => Number(norm(b.name).startsWith(want)) - Number(norm(a.name).startsWith(want)) || a.name.localeCompare(b.name))
    .slice(0, 25).map((e) => ({ name: `${e.name}${parseWeight(e.weight) !== undefined ? ` (${String(e.weight)})` : ''}`.slice(0, 100), value: e.id }));
}
