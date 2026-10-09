// What /ship and /bounty say and do, with no Discord and no database in them. The numbers come from
// the same engine as the website's ship sheet and wanted poster.
import {
  damageComponent, deriveShip, exactBerries, shipLog,
  type CharacterDoc, type RuleEntry, type Sheet, type ShipComponent, type ShipDoc, type ShipSheet,
} from '@dndf/engine';

export interface ShipOutcome {
  reply: string;
  /** The ship after the command, when it changed. */
  doc?: ShipDoc;
}

type Lookup = (id: string) => RuleEntry | undefined;
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const partLine = (c: ShipSheet['components'][number]) => {
  const facts = [c.ac !== undefined ? `AC ${c.ac}` : '', c.threshold ? `threshold ${c.threshold}` : '', c.speedNow !== undefined ? `${c.speedNow} ft` : ''].filter(Boolean).join(', ');
  const mark = c.destroyed ? '💥' : c.hp !== null && c.maxHp && c.hp <= c.maxHp / 2 ? '🩸' : '▫️';
  return `${mark} ${c.name}${c.hp !== null ? `: **${c.hp}** / ${c.maxHp}` : ''}${facts ? `  (${facts})` : ''}${c.destroyed ? ' — destroyed' : ''}`;
};

/** /ship status: the ship at a glance. */
export function shipStatus(doc: ShipDoc, rule: Lookup): ShipOutcome {
  const sheet = deriveShip(doc, rule);
  const lines = [
    `⛵ **${sheet.name}**${sheet.summary ? ` — ${sheet.summary}` : ''}`,
    `Speed ${sheet.speed.value} ft · crew ${sheet.crew.aboard}/${sheet.crew.max} · passengers ${sheet.crew.passengers}/${sheet.crew.passengerMax} · cargo ${sheet.cargo.tons}/${sheet.cargo.capacity} t · ${doc.pace.mph} mph`,
    ...sheet.components.filter((c) => c.hp !== null).map(partLine),
  ];
  if (sheet.weapons.total) lines.push(`Weapons: ${sheet.weapons.usable} of ${sheet.weapons.total} can be used`);
  lines.push(`Treasury ${exactBerries(sheet.treasury)} · rations ${doc.rations}${sheet.rationDays !== null ? ` (${sheet.rationDays} days for everyone aboard)` : ''} · upgrades ${sheet.slots.used}/${sheet.slots.total} slots · worth ${exactBerries(sheet.worth.value)}`);
  for (const note of sheet.notes) lines.push(`⚠️ ${note}`);
  return { reply: lines.join('\n') };
}

/** The component a player meant: an exact name, else the one name that starts with or contains what was typed. */
export function findPart(doc: ShipDoc, what: string): { found?: ShipComponent; close: string[] } {
  const want = norm(what);
  // "hull", "sails", "cannon 2": the book's names carry their role in front ("Weapon: Cannon 2").
  const names = doc.components.map((c) => ({ c, full: norm(c.name), short: norm(c.name.replace(/^[^:]+:\s*/, '')) }));
  if (!want) return { close: names.map(({ c }) => c.name).slice(0, 10) };
  for (const test of [
    (n: (typeof names)[number]) => n.full === want || n.short === want,
    (n: (typeof names)[number]) => n.full.startsWith(want) || n.short.startsWith(want),
    (n: (typeof names)[number]) => n.full.includes(want),
  ]) {
    const hits = names.filter(test);
    if (hits.length === 1) return { found: hits[0]!.c, close: [] };
    if (hits.length > 1) return { close: hits.map(({ c }) => c.name).slice(0, 10) };
  }
  return { close: [] };
}

/** /ship damage and /ship repair: one component, by name. Damage under its threshold does nothing. */
export function shipHit(doc: ShipDoc, what: string, amount: number, kind: 'damage' | 'repair', by: string, at: string, rule: Lookup): ShipOutcome {
  const n = Math.max(0, Math.floor(amount));
  const { found, close } = findPart(doc, what);
  if (!found) {
    const all = doc.components.filter((c) => c.maxHp !== undefined).map((c) => c.name);
    return { reply: close.length ? `"${what}" could be: ${close.join(', ')}. Which one?` : `**${doc.name}** has no part called "${what}". Hers: ${all.join(', ') || 'none with hit points'}.` };
  }
  if (found.maxHp === undefined) return { reply: `${found.name} has no hit points to ${kind === 'damage' ? 'lose' : 'repair'}.` };
  if (n === 0) return { reply: 'Nothing to change: the amount was 0.' };
  const result = damageComponent(doc, found.id, kind === 'damage' ? n : -n);
  if (result.doc === doc) return { reply: `🛡️ **${doc.name}** · ${result.summary}.` };
  const sheet = deriveShip(result.doc, rule);
  const now = sheet.components.find((c) => c.id === found.id)!;
  const lines = [`${kind === 'damage' ? '💥' : '🔧'} **${doc.name}** · ${result.summary}.`];
  if (kind === 'damage' && now.destroyed) lines.push(`💀 ${found.name} is destroyed.`);
  const speedBefore = deriveShip(doc, rule).speed.value;
  if (sheet.speed.value !== speedBefore) lines.push(`Speed ${speedBefore} → **${sheet.speed.value} ft**.`);
  return { reply: lines.join('\n'), doc: shipLog(result.doc, `${result.summary} (Discord, ${by})`, at) };
}

/** /ship treasury: the crew's shared berries, in or out, written in the ship's log with who did it. */
export function shipTreasury(doc: ShipDoc, kind: 'in' | 'out', amount: number, why: string, by: string, at: string): ShipOutcome {
  const n = Math.max(0, Math.floor(amount));
  if (n === 0) return { reply: `Nothing to change: the amount was 0. The treasury holds ${exactBerries(doc.treasury)}.` };
  const next = doc.treasury + (kind === 'in' ? n : -n);
  const reason = why.trim().slice(0, 80);
  const change = `Treasury ${kind === 'in' ? '+' : '−'}${exactBerries(n)}${reason ? ` (${reason})` : ''}: ${exactBerries(doc.treasury)} → ${exactBerries(next)}`;
  const short = next < 0 ? ' The treasury is in debt.' : '';
  return {
    reply: `💰 **${doc.name}** · ${kind === 'in' ? `${exactBerries(n)} put in` : `${exactBerries(n)} taken out`}${reason ? ` (${reason})` : ''}: ${exactBerries(doc.treasury)} → **${exactBerries(next)}**.${short}`,
    doc: shipLog({ ...doc, treasury: next }, `${change} (Discord, ${by})`, at),
  };
}

/** /ship crew: how many are working her, riding along, and what there is to eat. */
export function shipAboard(doc: ShipDoc, what: 'crew' | 'passengers' | 'rations', value: number, by: string, at: string, rule: Lookup): ShipOutcome {
  const n = Math.max(0, Math.floor(value));
  if (doc[what] === n) return { reply: `Nothing to change: ${what} is already ${n}.` };
  const next = { ...doc, [what]: n };
  const sheet = deriveShip(next, rule);
  const label = what === 'crew' ? 'Crew working the ship' : what === 'passengers' ? 'Passengers' : 'Rations';
  const lines = [`⛵ **${doc.name}** · ${label}: ${doc[what]} → **${n}**.`];
  if (what === 'rations' && sheet.rationDays !== null) lines.push(`That is ${plural(sheet.rationDays, 'day')} for everyone aboard.`);
  const before = new Set(deriveShip(doc, rule).notes);
  for (const note of sheet.notes) if (!before.has(note)) lines.push(`⚠️ ${note}`);
  return { reply: lines.join('\n'), doc: shipLog(next, `${label} ${doc[what]} → ${n} (Discord, ${by})`, at) };
}

/** /bounty: the poster the player has issued, and what the DM Guide's sums say. Nothing here is secret: a poster is public by nature. */
export function bountyReply(doc: CharacterDoc, sheet: Sheet): string {
  const poster = sheet.poster;
  const lines: string[] = [];
  if (poster) {
    lines.push(`📜 **WANTED** — ${poster.terms ?? 'Dead or Alive'}`);
    lines.push(`**${sheet.name}**${poster.epithet ? `, “${poster.epithet}”` : ''}`);
    lines.push(`**${exactBerries(poster.value)}**${poster.at ? `  ·  issued ${poster.at}` : ''}`);
    if (sheet.wanted.value !== poster.value) lines.push(`Since then the bounty on the sheet has become ${exactBerries(sheet.wanted.value)}; a new poster has not been issued.`);
  } else {
    lines.push(`**${sheet.name}** has no wanted poster out.`);
    lines.push(sheet.wanted.value > 0 ? `The bounty on the sheet is ${exactBerries(sheet.wanted.value)}. Issue a poster from the Status tab on the website.` : 'No bounty yet either. It is set on the Status tab on the website.');
  }
  if (doc.bounty?.deeds && sheet.wanted.overridden) lines.push(`(The DM Guide’s sums for the deeds recorded come to ${exactBerries(sheet.wanted.calculated)}.)`);
  return lines.join('\n');
}

/** /bounty crew: one line for each poster out in the campaign, highest first. */
export function crewPosters(crew: { doc: CharacterDoc; sheet: Sheet; player: string }[]): string {
  const out = crew.filter((c) => c.sheet.poster).sort((a, b) => b.sheet.poster!.value - a.sheet.poster!.value);
  if (out.length === 0) return 'Nobody in the crew has a wanted poster out yet.';
  const total = out.reduce((sum, c) => sum + c.sheet.poster!.value, 0);
  return [...out.map((c) => `📜 **${c.sheet.name}**${c.sheet.poster!.epithet ? ` “${c.sheet.poster!.epithet}”` : ''} — **${exactBerries(c.sheet.poster!.value)}** · ${c.sheet.poster!.terms ?? 'Dead or Alive'} (${c.player})`), `Total bounty of the crew: **${exactBerries(total)}**`].join('\n');
}
